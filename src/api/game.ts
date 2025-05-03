import { NetAgent, type ServiceProxy } from './index.ts';
import { EventEmitter } from 'events';
import { Tile } from '../tile.ts';
import { createHmac } from 'crypto';
import assert from 'assert';
import { lq } from '../liqi';

export enum Operation {
  None, //none
  Discard, //dapai,
  Chii, //eat,
  Pon, //peng,
  ClosedKan, //an_gang,
  OpenKan, //ming_gang,
  AddedKan, //add_gang,
  Riichi, //liqi,
  Tsumo, //zimo,
  Ron, //rong,
  Jiuzhongjiupai, //jiuzhongjiupai,
  Kita, //babei,
  Huansanzhang, //huansanzhang,
  Dinque, //dingque,
  Reveal, //reveal,
  Unveil, //unveil,
  LockTile, //locktile,
  RevealRiichi, //revealliqi,
  SelectTile, //selecttile,
  TrueRiichi, //po_liqi_5000,
  ExtremeRiichi, //po_liqi_10000,
}

export enum OpenMeld {
  Chii,
  Pon,
  OpenKan,
  ClosedKan,
  Kita,
  AddedKan,
}

export class Player {
  public score = -1;
  public pond: Tile[] = [];
  public discards: Tile[] = [];
  public riichiTile: Tile | null = null;
  public calls: Tile[] = [];
  public tileCount: number = 13;
  public kitas = 0;

  constructor(public accountId: number, public isSelf: boolean) {}

  reset() {
    this.pond = [];
    this.discards = [];
    this.calls = [];
    this.tileCount = 13;
    this.kitas = 0;
    this.riichiTile = null;
  }
}

export type GameEventMap = {
  operation: [lq.IOptionalOperationList];
  newRound: [lq.ActionNewRound];
  deal: [lq.ActionDealTile];
  discard: [lq.ActionDiscardTile];
  call: [lq.ActionChiPengGang];
  closedOrAddedKan: [lq.ActionAnGangAddGang];
  kita: [lq.ActionBaBei];
};

export class Game extends EventEmitter<GameEventMap> {
  private _hand?: Tile[];
  private _doraIndicators?: Tile[];
  private _tilesLeft?: number;
  private _seat?: number;
  private _players: Player[] = [];

  private _round?: number;
  private _jun?: number;
  private _honba?: number;

  private _config?: lq.IGameConfig;

  public readonly FastTest: ServiceProxy<'FastTest'>;
  public readonly agent: NetAgent;

  public handIsClosed() {
    return this.hand.some((tile) => tile.from !== this.seat);
  }

  public get hand() {
    assert(this._hand !== undefined, 'Game uninitialized!');
    return [...this._hand];
  }

  public get doraIndicators() {
    assert(this._doraIndicators !== undefined, 'Game uninitialized!');
    return [...this._doraIndicators];
  }

  public get tilesLeft() {
    assert(this._tilesLeft !== undefined, 'Game uninitialized!');
    return this._tilesLeft;
  }

  public get players() {
    assert(this._players.length > 0, 'Game uninitialized!');
    return [...this._players];
  }

  public get seat() {
    assert(this._seat !== undefined, 'Game uninitialized!');
    return this._seat;
  }

  public get round() {
    assert(this._round !== undefined, 'Game uninitialized!');
    return this._round;
  }

  public get jun() {
    assert(this._jun !== undefined, 'Game uninitialized!');
    return this._jun;
  }

  public get honba() {
    assert(this._honba !== undefined, 'Game uninitialized!');
    return this._honba;
  }

  public get self() {
    return this.players[this.seat];
  }

  public get visibleTiles() {
    return [
      ...this.hand,
      ...this.players.flatMap((player) => player.calls),
      ...this.players.flatMap((player) => player.pond),
      ...this.doraIndicators,
    ];
  }

  public get config() {
    assert(this._config, 'Game uninitialized!');
    return this._config;
  }

  public isEastMatch() {
    assert(this.config.mode);
    assert(this.config.mode.mode);
    return this.config.mode.mode % 10 === 1;
  }

  public getRankedRoom() {
    return this.config.meta?.mode_id;
  }

  constructor(
    private accountId: number,
    private gameUUid: string,
    private token: string
  ) {
    super();

    this.agent = new NetAgent(NetAgent.gameGateway, { throwErrors: true });
    this.FastTest = this.agent.proxyService('FastTest');

    this.agent.notify.on('ActionNewRound', this.handleNewRound.bind(this));
    this.agent.notify.on('ActionDealTile', this.handleDealTile.bind(this));
    this.agent.notify.on(
      'ActionDiscardTile',
      this.handleDiscardTile.bind(this)
    );
    this.agent.notify.on('ActionChiPengGang', this.handleCalledTile.bind(this));
    this.agent.notify.on(
      'ActionAnGangAddGang',
      this.handleClosedAndAddedKan.bind(this)
    );
    this.agent.notify.on('ActionBaBei', this.handleKita.bind(this));
  }

  public async init() {
    assert(
      this.agent.readyState !== this.agent.CLOSED &&
        this.agent.readyState !== this.agent.CLOSING
    );
    if (this.agent.readyState !== this.agent.OPEN)
      await this.agent.waitForOpen();
    const interval = setInterval(
      () => void this.FastTest.checkNetworkDelay(),
      2000
    );

    this.agent.addEventListener('close', () => clearInterval(interval));

    const game = await this.FastTest.authGame({
      account_id: this.accountId,
      game_uuid: this.gameUUid,
      token: this.token,
      gift: this.generateGift(),
    });
    assert(game.seat_list, "game.seat_list doesn't exist");
    this._seat = game.seat_list.indexOf(this.accountId);
    this._players = game.seat_list.map(
      (id) => new Player(id, id === this.accountId)
    );
    this._config = game.game_config!;

    await this.FastTest.enterGame();
    // todo restore and sync games
  }

  private generateGift() {
    const hmac = createHmac('sha256', 'damajiang');
    hmac.update(this.token + this.accountId + this.gameUUid);
    return hmac.digest('hex');
  }

  private removeTileFromHand(tile: Tile) {
    assert(this._hand);
    const idx = this._hand.findIndex((otherTile) =>
      tile.strictlyEquals(otherTile)
    );
    assert(idx !== -1, `Could not find tile in hand`);
    this._hand.splice(idx, 1);
  }

  private handleNewRound(action: lq.ActionNewRound) {
    this._hand = action.tiles!.map((tileStr) => new Tile(tileStr));
    this._doraIndicators = action.doras!.map((tileStr) => new Tile(tileStr));
    this._tilesLeft = action.left_tile_count;

    this._players.forEach((player, i) => {
      player.reset();
      player.score = action.scores![i];
    });
    this._round = action.chang;
    this._jun = action.ju;
    this._honba = action.ben;
    this.emit('newRound', action);
    if (action.operation) this.emit('operation', action.operation);
  }

  private handleDealTile(action: lq.ActionDealTile) {
    this._tilesLeft = action.left_tile_count;
    const player = this._players[action.seat!];
    player.tileCount++;

    if (player.isSelf) {
      this._hand!.push(new Tile(action.tile!));
    }
    this.emit('deal', action);
    if (action.operation) this.emit('operation', action.operation);
  }

  private handleDiscardTile(action: lq.ActionDiscardTile) {
    const tile = new Tile(action.tile!);
    const player = this._players[action.seat!];
    player.pond.push(tile);
    player.discards.push(tile);
    player.tileCount--;

    if (action.is_liqi || (action.is_wliqi && !player.riichiTile)) {
      player.score -= 1000;
      player.riichiTile = tile;
    }

    if (action.doras)
      this._doraIndicators = action.doras.map((tile) => new Tile(tile));

    if (player.isSelf) {
      this.removeTileFromHand(tile);
    }

    this.emit('discard', action);
    if (action.operation) this.emit('operation', action.operation);
  }

  private handleCalledTile(action: lq.ActionChiPengGang) {
    const player = this._players[action.seat!];

    action.tiles?.forEach((tileString, i) => {
      const tile = new Tile(tileString);
      tile.from = action.froms![i];

      if (action.type === OpenMeld.OpenKan) tile.kan = true;

      if (tile.from === action.seat) {
        player.tileCount--;
        if (player.isSelf) this.removeTileFromHand(tile);
      } else {
        const lastDiscarded = this._players[tile.from!].pond.pop();
        assert(lastDiscarded && lastDiscarded.equals(tile));
      }
      player.calls.push(tile);
    });

    this.emit('call', action);
    if (action.operation) this.emit('operation', action.operation);
  }

  private handleClosedAndAddedKan(action: lq.ActionAnGangAddGang) {
    const tile = new Tile(action.tiles!);
    tile.kan = true;
    const player = this._players[action.seat!];
    assert(
      action.type === OpenMeld.ClosedKan || action.type === OpenMeld.AddedKan
    );

    if (action.type === OpenMeld.AddedKan)
      player.calls
        .filter((other) => tile.strictlyEquals(other))
        .forEach((tile) => (tile.kan = true));

    const tileCount = action.type === OpenMeld.ClosedKan ? 4 : 1;
    for (let i = 0; i < tileCount; i++) {
      player.tileCount--;
      player.calls.push(tile.clone());
      if (player.isSelf) this.removeTileFromHand(tile);
    }

    this.emit('closedOrAddedKan', action);
    if (action.operation) this.emit('operation', action.operation);
  }

  private handleKita(action: lq.ActionBaBei) {
    const player = this._players[action.seat!];
    player.kitas++;

    this.emit('kita', action);
    if (action.operation) this.emit('operation', action.operation);
  }

  public onOperation(cb: (...args: GameEventMap['operation']) => void) {
    this.on('operation', cb);
  }

  public waitForOperation() {
    return new Promise<GameEventMap['operation'][0]>((resolve) =>
      this.onOperation(resolve)
    );
  }
}
