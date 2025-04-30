//################################
// API (MAHJONG SOUL)
// Returns data from Mahjong Souls Javascript
//################################

import { AlphaJong } from './bot';

declare global {
  const GameMgr: any;
  const view: any;
  const app: any;
  const uiscript: any;
  const mjcore: any;
  const cfg: any;
  const game: any;
}

export class Api {
  constructor(private ai: AlphaJong) {}

  getOperationList() {
    return view.DesktopMgr.Inst.oplist;
  }

  localPosition2Seat(player: number) {
    player = this.ai.utils.getCorrectPlayerNumber(player);
    return view.DesktopMgr.Inst.localPosition2Seat(player);
  }

  seat2LocalPosition(playerSeat: number) {
    return view.DesktopMgr.Inst.seat2LocalPosition(playerSeat);
  }

  getSeatWind(player: number) {
    if (this.ai.utils.getNumberOfPlayers() == 3) {
      return (
        ((3 + this.localPosition2Seat(player) - view.DesktopMgr.Inst.index_ju) %
          3) +
        1
      );
    } else {
      return (
        ((4 + this.localPosition2Seat(player) - view.DesktopMgr.Inst.index_ju) %
          4) +
        1
      );
    }
  }

  getRound() {
    return view.DesktopMgr.Inst.index_ju + 1;
  }

  getRoundWind() {
    return view.DesktopMgr.Inst.index_change + 1;
  }

  setAutoCallWin(win: boolean) {
    view.DesktopMgr.Inst.setAutoHule(win);
    //view.DesktopMgr.Inst.setAutoNoFulu(true) //Auto No Chi/Pon/Kan
    try {
      uiscript.UI_DesktopInfo.Inst.refreshFuncBtnShow(
        uiscript.UI_DesktopInfo.Inst._container_fun.getChildByName(
          'btn_autohu'
        ),
        view.DesktopMgr.Inst.auto_hule
      ); //Refresh GUI Button
    } catch {
      return;
    }
  }

  getTileForCall() {
    if (view.DesktopMgr.Inst.lastqipai == null) {
      return { index: 0, type: 0, dora: false, doraValue: 0 };
    }
    var tile = view.DesktopMgr.Inst.lastqipai.val;
    tile.doraValue = this.ai.utils.getTileDoraValue(tile);
    return tile;
  }

  makeCall(type: number) {
    app.NetAgent.sendReq2MJ('FastTest', 'inputChiPengGang', {
      type: type,
      index: 0,
      timeuse: Math.random() * 2 + 1,
    });
    view.DesktopMgr.Inst.WhenDoOperation();
  }

  makeCallWithOption(type: number, option) {
    app.NetAgent.sendReq2MJ('FastTest', 'inputChiPengGang', {
      type: type,
      index: option,
      timeuse: Math.random() * 2 + 1,
    });
    view.DesktopMgr.Inst.WhenDoOperation();
  }

  declineCall(operation) {
    try {
      if (operation == getOperationList()[getOperationList().length - 1].type) {
        //Is last operation -> Send decline Command
        app.NetAgent.sendReq2MJ('FastTest', 'inputChiPengGang', {
          cancel_operation: true,
          timeuse: 2,
        });
        view.DesktopMgr.Inst.WhenDoOperation();
      }
    } catch {
      this.ai.logger.log(
        'Failed to decline the Call. Maybe someone else was faster?'
      );
    }
  }

  sendRiichiCall(tile: string, moqie: boolean) {
    app.NetAgent.sendReq2MJ('FastTest', 'inputOperation', {
      type: mjcore.E_PlayOperation.liqi,
      tile: tile,
      moqie: moqie,
      timeuse: Math.random() * 2 + 1,
    }); //Moqie: Throwing last drawn tile (Riichi -> false)
  }

  sendKitaCall() {
    var moqie = view.DesktopMgr.Inst.mainrole.last_tile.val.toString() == '4z';
    app.NetAgent.sendReq2MJ('FastTest', 'inputOperation', {
      type: mjcore.E_PlayOperation.babei,
      moqie: moqie,
      timeuse: Math.random() * 2 + 1,
    });
    view.DesktopMgr.Inst.WhenDoOperation();
  }

  sendAbortiveDrawCall() {
    app.NetAgent.sendReq2MJ('FastTest', 'inputOperation', {
      type: mjcore.E_PlayOperation.jiuzhongjiupai,
      index: 0,
      timeuse: Math.random() * 2 + 1,
    });
    view.DesktopMgr.Inst.WhenDoOperation();
  }

  callDiscard(tileNumber: number) {
    try {
      if (view.DesktopMgr.Inst.players[0].hand[tileNumber].valid) {
        view.DesktopMgr.Inst.players[0]._choose_pai =
          view.DesktopMgr.Inst.players[0].hand[tileNumber];
        view.DesktopMgr.Inst.players[0].DoDiscardTile();
      }
    } catch {
      this.ai.logger.log('Failed to discard the tile.');
    }
  }

  isEastRound() {
    return view.DesktopMgr.Inst.game_config.mode.mode % 10 == 1;
  }

  // Returns the room of the current game as a number: Bronze = 1, Silver = 2 etc.
  getCurrentRoom() {
    return 1;
  }

  //How much seconds left for a turn (base value, 20 at start)
  getOverallTimeLeft() {
    try {
      return uiscript.UI_DesktopInfo.Inst._timecd._add;
    } catch {
      return 20;
    }
  }

  //How much time was left in the last turn?
  getLastTurnTimeLeft() {
    try {
      return uiscript.UI_DesktopInfo.Inst._timecd._pre_sec;
    } catch {
      return 25;
    }
  }

  // Extend some internal MJSoul functions with additional code
  // extendMJSoulFunctions() {
  // 	if (this.ai.functionsExtended) {
  // 		return;
  // 	}
  // 	this.trackDiscardTiles();
  // 	this.ai.functionsExtended = true;
  // }

  // Track which tiles the players discarded (for push/fold judgement and tracking the riichi tile)
  // trackDiscardTiles() {
  // 	for (var i = 1; i < this.ai.utils.getNumberOfPlayers(); i++) {
  // 		var player = this.ai.utils.getCorrectPlayerNumber(i);
  // 		view.DesktopMgr.Inst.players[player].container_qipai.AddQiPai = (function (_super) { // Extend the MJ-Soul Discard function
  // 			return function () {
  // 				if (arguments[1]) { // Contains true when Riichi
  // 					this.ai.riichiTiles[seat2LocalPosition(this.player.seat)] = arguments[0]; // Track tile in riichiTiles Variable
  // 				}
  // 				setData(false);
  // 				this.ai.visibleTiles.push(arguments[0]);
  // 				var danger = this.ai.defense.getTileDanger(arguments[0], seat2LocalPosition(this.player.seat));
  // 				if (arguments[2] && danger < 0.01) { // Ignore Tsumogiri of a safetile, set it to average danger
  // 					danger = 0.05;
  // 				}
  // 				arguments[0].tsumogiri = arguments[2];
  // 				this.ai.playerDiscardSafetyList[seat2LocalPosition(this.player.seat)].push(danger);
  // 				return _super.apply(this, arguments); // Call original function
  // 			};
  // 		})(view.DesktopMgr.Inst.players[player].container_qipai.AddQiPai);
  // 	}
  // }
}
