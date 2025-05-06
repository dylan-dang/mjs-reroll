import { NetAgent, type ServiceProxy, type TypeName } from './index.ts';
import { EventEmitter } from 'node:events';
import { Tile, type CalledTile, type ITile } from '../tile.ts';
import { createHmac } from 'node:crypto';
import assert from 'node:assert';
import type { lq } from '../liqi';
import { zip } from '../utils.ts';

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

export enum CallType {
  Chii, //shunzi
  Pon, //kezi
  OpenKan, //gang_ming
  ClosedKan, //gang_an
  Kita, //babei

  // I don't this this is even used
  AddedKan, //gang_add
}

export enum ClosedOrAddedKan {
  AddedKan = 2,
  ClosedKan = 3,
}

type Repeated<
  T,
  N extends number,
  Acc extends T[] = []
> = Acc['length'] extends N ? Acc : Repeated<T, N, [...Acc, T]>;

type CallNumberMap = {
  [CallType.Chii]: 3;
  [CallType.Pon]: 3;
  [CallType.OpenKan]: 4;
  [CallType.ClosedKan]: 4;
  [CallType.Kita]: 1;
  [CallType.AddedKan]: 4;
};

export type Call<T = keyof CallNumberMap> = T extends keyof CallNumberMap
  ? {
      type: T;
      tiles: Repeated<CalledTile, CallNumberMap[T]>;
    }
  : never;

class HiddenHand {
  constructor(public length: number) {}

  push() {
    return ++this.length;
  }

  decrement() {
    --this.length;
  }
}

export class Player {
  public score = -1;
  public pond: Tile[] = [];
  public discards: Tile[] = [];
  public riichiTile: Tile | null = null;
  public calls: Call[] = [];
  public tileCount = 13;
  public kitas = 0;
  public hand: Tile[] | HiddenHand = new HiddenHand(13);

  constructor(public accountId: number, public isSelf: boolean) {}

  reset() {
    this.pond = [];
    this.discards = [];
    this.calls = [];
    this.tileCount = 13;
    this.kitas = 0;
    this.riichiTile = null;
    this.hand = this.isSelf ? [] : new HiddenHand(13);
  }

  addCall(call: { type: number; tiles: CalledTile[] }) {
    this.calls.push(call as Call);
  }

  removeFromHand(tile: string | ITile) {
    if (this.hand instanceof HiddenHand) {
      this.hand.decrement();
      return typeof tile === 'string' ? Tile.parse(tile) : new Tile(tile);
    }
    const idx = this.hand.findIndex((otherTile) =>
      otherTile.strictlyEquals(tile)
    );
    assert(idx !== -1, 'Could not find tile in hand');
    return this.hand.splice(idx, 1)[0];
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
  private _doraIndicators?: Tile[];
  private _tilesLeft?: number;
  private _seat?: number;
  private _players: Player[] = [];

  private _round?: number;
  private _jun?: number;
  private _honba?: number;

  private _config?: lq.IGameConfig;

  public FastTest: ServiceProxy<'FastTest'>;
  public agent: NetAgent;
  public syncing = false;
  public ended = false;

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
    return this.players[this.seat] as Player & { hand: Tile[] };
  }

  public get visibleTiles(): Tile[] {
    return [
      ...this.self.hand,
      ...this.players.flatMap((player) =>
        player.calls.flatMap((call) => call.tiles)
      ),
      ...this.players.flatMap((player) => player.pond),
      ...this.doraIndicators,
    ];
  }

  public get config() {
    assert(this._config, 'Game uninitialized!');
    return this._config;
  }

  public isEastMatch() {
    assert(this.config.mode, 'config mode not found');
    assert(this.config.mode.mode, 'config mode not found');
    return this.config.mode.mode % 10 === 1;
  }

  public getRankedRoom() {
    return this.config.meta?.mode_id;
  }

  constructor(
    public readonly accountId: number,
    public readonly uuid: string,
    public readonly token: string
  ) {
    super();
    this.agent = new NetAgent(NetAgent.gameGateway, { throwErrors: true });
    this.FastTest = this.agent.proxyService('FastTest');
  }

  public async init() {
    this.agent.notify.on('ActionNewRound', this.handleNewRound.bind(this));
    this.agent.notify.on('ActionDealTile', this.handleDealTile.bind(this));
    this.agent.notify.on(
      'ActionDiscardTile',
      this.handleDiscardTile.bind(this)
    );
    this.agent.notify.on('ActionChiPengGang', this.handleCalledTile.bind(this));
    this.agent.notify.on(
      'ActionAnGangAddGang',
      this.handleClosedOrAddedKan.bind(this)
    );
    this.agent.notify.on('ActionBaBei', this.handleKita.bind(this));

    assert(
      this.agent.readyState !== this.agent.CLOSED &&
        this.agent.readyState !== this.agent.CLOSING,
      'agent could not be initialized: already closed or closing'
    );
    if (this.agent.readyState !== this.agent.OPEN)
      await this.agent.waitForOpen();
    const interval = setInterval(
      () => void this.FastTest.checkNetworkDelay(),
      2000
    );

    this.agent.addEventListener('close', async () => {
      clearInterval(interval);
      if (!this.ended) {
        // reconnect
        this.agent = new NetAgent(NetAgent.gameGateway, { throwErrors: true });
        this.FastTest = this.agent.proxyService('FastTest');
        await this.init();
      }
    });

    this.agent.notify.on('NotifyGameEndResult', (result) => {
      this.ended = true;
    });

    const { seat_list, game_config, is_game_start } =
      await this.FastTest.authGame({
        account_id: this.accountId,
        game_uuid: this.uuid,
        token: this.token,
        gift: this.generateGift(),
      });
    this._seat = seat_list.indexOf(this.accountId);
    this._players = seat_list.map(
      (id) => new Player(id, id === this.accountId)
    );

    assert(game_config, 'game_config undefined');
    this._config = game_config;

    if (is_game_start) {
      const { game_restore } = await this.FastTest.syncGame({
        round_id: '-1',
        step: 1000000,
      });
      // assert(game_restore?.actions, 'game_restore undefined');
      if (!game_restore?.actions) {
        await this.FastTest.enterGame();
        return;
      }
      this.syncing = true;
      for (const { name, data } of game_restore.actions) {
        assert(name && data);
        const actionName = name as TypeName;

        const notification = this.agent.codec.decode(actionName, data);

        this.agent.notify.emit(actionName, notification);
      }
      this.syncing = false;
      await this.FastTest.finishSyncGame();
    } else {
      await this.FastTest.enterGame();
    }
  }

  private generateGift() {
    const hmac = createHmac('sha256', 'damajiang');
    hmac.update(this.token + this.accountId + this.uuid);
    return hmac.digest('hex');
  }

  private handleNewRound(action: lq.ActionNewRound) {
    this._doraIndicators = action.doras!.map((tileStr) => Tile.parse(tileStr));
    this._tilesLeft = action.left_tile_count;

    this._players.forEach((player, i) => {
      player.reset();
      if (player.isSelf) {
        player.hand = action.tiles!.map((tileStr) => Tile.parse(tileStr));
      }
      player.score = action.scores![i];
    });
    this._round = action.chang;
    this._jun = action.ju;
    this._honba = action.ben;
    this.emit('newRound', action);
    this.emitOperation(action.operation);
  }

  private handleDealTile(action: lq.ActionDealTile) {
    this._tilesLeft = action.left_tile_count;
    const player = this._players[action.seat];

    if (action.tile) {
      assert(player.isSelf);
      player.hand.push(Tile.parse(action.tile));
    } else {
      assert(!player.isSelf);
      const { length } = player.hand;
      assert(player.hand.push() === length + 1);
    }

    this.emit('deal', action);
    this.emitOperation(action.operation);
  }

  private handleDiscardTile(action: lq.ActionDiscardTile) {
    const player = this._players[action.seat];
    const tile = player.removeFromHand(action.tile);
    player.pond.push(tile);
    player.discards.push(tile);

    if (action.is_liqi || (action.is_wliqi && !player.riichiTile)) {
      player.score -= 1000;
      player.riichiTile = tile;
    }

    if (action.doras)
      this._doraIndicators = action.doras.map((tile) => Tile.parse(tile));

    this.emit('discard', action);
    this.emitOperation(action.operation);
  }

  private handleCalledTile(action: lq.ActionChiPengGang) {
    const player = this._players[action.seat!];

    assert(
      action.type !== CallType.ClosedKan && action.type !== CallType.AddedKan,
      `unexpected ${CallType[action.type]} in handleCalledTile`
    );

    const tiles = zip(action.tiles, action.froms).map(([tileStr, fromSeat]) => {
      const tile =
        fromSeat === action.seat
          ? player.removeFromHand(tileStr)
          : this._players[fromSeat].pond.pop();
      assert(tile?.equals(tileStr), 'last tile was not the discarded tile');
      return tile!.called(fromSeat);
    });

    player.addCall({
      type: action.type!,
      tiles,
    });

    this.emit('call', action);
    this.emitOperation(action.operation);
  }

  private handleClosedOrAddedKan(action: lq.ActionAnGangAddGang) {
    const player = this._players[action.seat!];
    const tile = player.removeFromHand(action.tiles).called(action.seat);

    switch (action.type) {
      case ClosedOrAddedKan.AddedKan: {
        type Target = Extract<Call, { type: CallType.Pon | CallType.AddedKan }>;
        const call = player.calls.find(
          (call): call is Target =>
            call.type === CallType.Pon && tile.equals(call.tiles[0])
        );
        assert(call, "pon wasn't found for added kan");
        call.type = CallType.AddedKan;
        call.tiles.push(tile);
        break;
      }
      case ClosedOrAddedKan.ClosedKan: {
        const maybeAkadora = tile.clone({
          akadora: !tile.akadora && tile.index === 5,
        });
        const nonAkadora = tile.clone({ akadora: false });

        const otherTiles = [maybeAkadora, nonAkadora, nonAkadora]
          .map(player.removeFromHand.bind(player))
          .map((tile) => tile.called(action.seat));
        this.self.addCall({
          type: CallType.ClosedKan,
          tiles: [tile, ...otherTiles],
        });
        break;
      }
      default:
        throw new Error(
          `unexpected action type ${
            ClosedOrAddedKan[action.type]
          } in handleClosedOrAddedKan`
        );
    }

    this.emit('closedOrAddedKan', action);
    this.emitOperation(action.operation);
  }

  private handleKita(action: lq.ActionBaBei) {
    const player = this._players[action.seat!];
    player.kitas++;
    player.removeFromHand('4z');

    this.emit('kita', action);
    this.emitOperation(action.operation);
  }

  private emitOperation(operation?: lq.IOptionalOperationList | null) {
    if (!operation) return;
    if (this.syncing) return;
    this.emit('operation', operation);
  }
}
