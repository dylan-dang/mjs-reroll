import { Operation, type Game, type GameEventMap } from '../game';
import { Defense } from './ai_defense';
import { Offense } from './ai_offense';
import { Api } from './api';
import { Logger } from './logging';
import { Utilities } from './utils';
import { Tile } from './tile';

export enum Strategy {
  General,
  Chiitoitsu,
  Fold,
  ThirteenOrphans,
}

export class AlphaJong {
  PERFORMANCE_MODE = 3;

  //HAND EVALUATION CONSTANTS
  EFFICIENCY = 1.0; // Lower: Slower and more expensive hands. Higher: Faster and cheaper hands. Default: 1.0, Minimum: 0
  SAFETY = 1.0; // Lower: The bot will not pay much attention to safety. Higher: The bot will try to play safer. Default: 1.0, Minimum: 0
  SAKIGIRI = 1.0; //Lower: Don't place much importance on Sakigiri. Higher: Try to Sakigiri more often. Default: 1.0, Minimum: 0

  //CALL CONSTANTS
  CALL_PON_CHI = 1.0; //Lower: Call Pon/Chi less often. Higher: Call Pon/Chi more often. Default: 1.0, Minimum: 0
  CALL_KAN = 1.0; //Lower: Call Kan less often. Higher: Call Kan more often. Default: 1.0, Minimum: 0

  //STRATEGY CONSTANTS
  RIICHI = 1.0; //Lower: Call Riichi less often. Higher: Call Riichi more often. Default: 1.0, Minimum: 0
  CHIITOITSU = 5; //Number of Pairs in Hand to go for chiitoitsu. Default: 5
  THIRTEEN_ORPHANS = 10; //Number of Honor/Terminals in hand to go for 13 orphans. Default: 10
  KEEP_SAFETILE = false; //If set to true the bot will keep 1 safetile

  //MISC
  MARK_TSUMOGIRI = false; // Mark the tsumogiri tiles of opponents with grey color
  CHANGE_RECOMMEND_TILE_COLOR = true; // change recommended tile color in help mode
  USE_EMOJI = true; //use EMOJI to show tile
  LOG_AMOUNT = 3; //Amount of Messages to log for Tile Priorities
  DEBUG_BUTTON = false; //Display a Debug Button in the GUI

  strategy = Strategy.General; //Current strategy
  strategyAllowsCalls = true; //Does the current strategy allow calls?
  isClosed = true; //Is own hand closed?
  calls: Tile[][] = []; //Calls/Melds of each player
  availableTiles: Tile[] = []; //Tiles that are available
  seatWind = 1; //1: East,... 4: North
  roundWind = 1; //1: East,... 4: North
  visibleTiles: Tile[] = []; //Tiles that are visible
  errorCounter = 0; //Counter to check if bot is working
  lastTilesLeft = 0; //Counter to check if bot is working
  isConsideringCall = false;
  functionsExtended = false;
  playerDiscardSafetyList: number[][] = [[], [], [], []];
  timeSave = 0;
  showingStrategy = false; //Current in own turn?
  wallSize = 70;

  //LOCAL STORAGE
  AUTORUN = true;

  ROOM = 1;

  offense = new Offense(this);
  defense = new Defense(this);
  utils = new Utilities(this);
  logger = new Logger(this);
  api = new Api(this);

  oldOps = [];

  constructor(public game: Game) {
    game.on('newRound', ({ left_tile_count }) => {
      this.strategy = Strategy.General;
      this.strategyAllowsCalls = true;
      this.playerDiscardSafetyList = [[], [], [], []];
      this.wallSize = left_tile_count! + 1;
    });
    game.on('operation', this.handleOperation.bind(this));
  }

  async handleOperation(operation: GameEventMap['operation'][0]) {
    const operations = operation.operation_list!;

    this.logger.log('##### OWN TURN #####');
    this.logger.log('Debug String: ' + this.logger.getDebugString());

    if (this.utils.getNumberOfPlayers() == 3) {
      this.logger.log(
        'Right Player Tenpai Chance: ' +
          Number(this.defense.isPlayerTenpai(1) * 100).toFixed(1) +
          '%, Expected Hand Value: ' +
          Number(this.defense.getExpectedHandValue(1).toFixed(0))
      );
      this.logger.log(
        'Left Player Tenpai Chance: ' +
          Number(this.defense.isPlayerTenpai(2) * 100).toFixed(1) +
          '%, Expected Hand Value: ' +
          Number(this.defense.getExpectedHandValue(2).toFixed(0))
      );
    } else {
      this.logger.log(
        'Shimocha Tenpai Chance: ' +
          Number(this.defense.isPlayerTenpai(1) * 100).toFixed(1) +
          '%, Expected Hand Value: ' +
          Number(this.defense.getExpectedHandValue(1).toFixed(0))
      );
      this.logger.log(
        'Toimen Tenpai Chance: ' +
          Number(this.defense.isPlayerTenpai(2) * 100).toFixed(1) +
          '%, Expected Hand Value: ' +
          Number(this.defense.getExpectedHandValue(2).toFixed(0))
      );
      this.logger.log(
        'Kamicha Tenpai Chance: ' +
          Number(this.defense.isPlayerTenpai(3) * 100).toFixed(1) +
          '%, Expected Hand Value: ' +
          Number(this.defense.getExpectedHandValue(3).toFixed(0))
      );
    }

    this.offense.determineStrategy(); //Get the Strategy for the current situation. After calls so it does not reset folds

    this.isConsideringCall = true;

    // Priority Operations
    for (const operation of operations) {
      switch (operation.type) {
        case Operation.ClosedKan:
          this.offense.evalAnkan(operation.combination!);
          break;
        case Operation.AddedKan:
          this.offense.evalShouminkan();
          break;
        case Operation.Tsumo:
          this.offense.callTsumo();
          break;
        case Operation.Ron:
          this.offense.callRon();
          break;
        case Operation.Kita:
          this.offense.evalKita();
          break;
        case Operation.Jiuzhongjiupai:
          this.offense.evalAbortiveDraw();
          break;
      }
    }

    for (let operation of operations) {
      switch (operation.type) {
        case Operation.Riichi:
        case Operation.Discard:
          this.isConsideringCall = false;
          await this.offense.discard(operation);
          break;
        case Operation.Chii:
          await this.offense.evalTriple(operation.combination!, Operation.Chii);
          break;
        case Operation.Pon:
          await this.offense.evalTriple(operation.combination!, Operation.Pon);
          break;
        case Operation.OpenKan:
          this.offense.evalDaiminkan();
          break;
      }
    }

    // this.logger.log(" ");

    // if ((this.api.getOverallTimeLeft() < 8 && this.api.getLastTurnTimeLeft() - this.api.getOverallTimeLeft() <= 0) || //Not much overall time left and last turn took longer than the 5 second increment
    // 	(this.api.getOverallTimeLeft() < 4 && this.api.getLastTurnTimeLeft() - this.api.getOverallTimeLeft() <= 1)) {
    // 	this.timeSave++;
    // 	this.logger.log("Low performance! Activating time save mode level: " + this.timeSave);
    // }
    // if (this.api.getOverallTimeLeft() > 15) { //Much time left (new round)
    // 	this.timeSave = 0;
    // }
  }

  //Set Data from real Game
  updateState(mainUpdate = true) {
    this.calls = [];

    if (!this.utils.isDebug()) {
      this.seatWind = this.api.getSeatWind(0);
      this.roundWind = this.api.getRoundWind();
    }

    this.utils.updateAvailableTiles();
  }
}
