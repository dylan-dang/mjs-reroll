//################################
// AI OFFENSE
// Offensive part of the AI
//################################

import { Operation } from '../game';
import type { lq } from '../liqi';
import { Strategy, type AlphaJong } from './bot';
import { Tile } from './tile';
import { Yaku } from './yaku';
import assert from 'assert';

export type TilePriority = {
  tile: Tile;
  valid?: boolean;
  safe?: boolean;
  priority: any;
  riichiPriority: any;
  shanten: number;
  efficiency: number;
  score: {
    open: number;
    closed: number;
    riichi: number;
  };
  dora: number;
  yaku: {
    open: number;
    closed: number;
  };
  waits: number;
  shape: number;
  danger: number;
  fu: number;
};

export class Offense {
  yaku: Yaku;

  constructor(private ai: AlphaJong) {
    this.yaku = new Yaku(ai);
  }

  //Look at Hand etc. and decide for a strategy.
  determineStrategy() {
    if (this.ai.strategy != Strategy.Fold) {
      var handTriples = Math.floor(
        this.ai.utils.getTriples(
          this.ai.utils.getHandWithCalls(this.ai.game.hand)
        ).length / 3
      );
      var pairs = this.ai.utils.getPairsAsArray(this.ai.game.hand).length / 2;

      if (
        (pairs == 6 || (pairs >= this.ai.CHIITOITSU && handTriples < 2)) &&
        this.ai.isClosed
      ) {
        this.ai.strategy = Strategy.Chiitoitsu;
        this.ai.strategyAllowsCalls = false;
      } else if (this.canDoThirteenOrphans()) {
        this.ai.strategy = Strategy.ThirteenOrphans;
        this.ai.strategyAllowsCalls = false;
      } else {
        if (
          this.ai.strategy == Strategy.ThirteenOrphans ||
          this.ai.strategy == Strategy.Chiitoitsu
        ) {
          this.ai.strategyAllowsCalls = true; //Don't reset this value when bot is playing defensively without a full fold
        }
        this.ai.strategy = Strategy.General;
      }
    }
    this.ai.logger.log('Strategy: ' + this.ai.strategy);
  }

  //Call a Chi/Pon
  //combination example: Array ["6s|7s", "7s|9s"]
  async evalTriple(combinations: string[], operation: number) {
    this.ai.logger.log(
      'Consider call on ' +
        this.ai.logger.getTileName(this.ai.api.getTileForCall())
    );

    var handValue = this.getHandValues(this.ai.game.hand);

    if (
      !this.ai.strategyAllowsCalls &&
      (this.ai.game.tilesLeft > 4 || handValue.shanten > 1)
    ) {
      //No Calls allowed
      this.ai.logger.log('Strategy allows no calls! Declined!');
      this.ai.api.declineCall(operation);
      return false;
    }

    //Find best Combination
    var comb = -1;
    var bestCombShanten = 9;
    var bestDora = 0;

    for (var i = 0; i < combinations.length; i++) {
      const callTilesString = combinations[i].split('|');
      const callTiles = callTilesString.map((t) => new Tile(t)!);

      var newHand = this.ai.utils.removeTilesFromTileArray(
        this.ai.game.hand,
        callTiles
      );
      var newHandTriples = this.ai.utils.getTriplesAndPairs(newHand);
      var doubles = this.ai.utils.getDoubles(
        this.ai.utils.removeTilesFromTileArray(
          newHand,
          newHandTriples.triples.concat(newHandTriples.pairs)
        )
      );
      var shanten = this.ai.utils.calculateShanten(
        Math.floor(newHandTriples.triples.length / 3),
        Math.floor(newHandTriples.pairs.length / 2),
        Math.floor(doubles.length / 2)
      );

      if (
        shanten < bestCombShanten ||
        (shanten == bestCombShanten &&
          this.ai.utils.getNumberOfDoras(callTiles) > bestDora)
      ) {
        comb = i;
        bestDora = this.ai.utils.getNumberOfDoras(callTiles);
        bestCombShanten = shanten;
      }
    }

    this.ai.logger.log('Best Combination: ' + combinations[comb]);

    const callTilesString = combinations[comb].split('|');
    const callTiles = callTilesString.map((t: string) => new Tile(t));

    var wasClosed = this.ai.isClosed;
    const simulatedCalls = [...this.ai.game.self.calls];

    simulatedCalls.push(callTiles[0]); //Simulate "Call" for hand value calculation
    simulatedCalls.push(callTiles[1]);
    simulatedCalls.push(this.ai.api.getTileForCall());
    this.ai.isClosed = false;

    newHand = this.ai.utils.removeTilesFromTileArray(
      this.ai.game.hand,
      callTiles
    ); //Remove called tiles from hand
    var tilePrios = await this.getTilePriorities(newHand);
    tilePrios = this.sortOutUnsafeTiles(tilePrios);
    var nextDiscard = this.getDiscardTile(tilePrios); //Calculate next discard
    newHand = this.ai.utils.removeTilesFromTileArray(newHand, [nextDiscard]); //Remove discard from hand
    var newHandValue = this.getHandValues(newHand, nextDiscard); //Get Value of that hand
    newHandTriples = this.ai.utils.getTriplesAndPairs(newHand); //Get Triples, to see if discard would make the hand worse

    this.ai.calls[0].pop();
    this.ai.calls[0].pop();
    this.ai.calls[0].pop();

    this.ai.isClosed = wasClosed;

    var newHonorPairs =
      newHandTriples.pairs.filter((t) => t.type == 3).length / 2;
    var newPairs = newHandTriples.pairs.length / 2;

    if (
      nextDiscard.equals(this.ai.api.getTileForCall()) ||
      (callTiles[0].index == this.ai.api.getTileForCall().index - 2 &&
        nextDiscard.equals({
          index: callTiles[0].index - 1,
          type: callTiles[0].type,
        })) ||
      (callTiles[1].index == this.ai.api.getTileForCall().index + 2 &&
        nextDiscard.equals({
          index: callTiles[1].index + 1,
          type: callTiles[1].type,
        }))
    ) {
      this.ai.api.declineCall(operation);
      this.ai.logger.log('Next discard would be the same tile. Call declined!');
      return false;
    }

    if (
      this.ai.strategy == Strategy.Fold ||
      tilePrios.filter((t) => t.safe).length == 0
    ) {
      this.ai.logger.log('Would fold next discard! Declined!');
      this.ai.api.declineCall(operation);
      return false;
    }

    if (
      this.ai.game.tilesLeft <= 4 &&
      handValue.shanten == 1 &&
      newHandValue.shanten == 0
    ) {
      //Call to get tenpai at end of game
      this.ai.logger.log('Accept call to be tenpai at end of game!');
      this.ai.api.makeCallWithOption(operation, comb);
      return true;
    }

    if (
      newHandValue.yaku.open < 0.15 && //Yaku chance is too bad
      newHandTriples.pairs.filter(
        (t) =>
          this.ai.utils.isValueTile(t) &&
          this.ai.utils.getNumberOfTilesAvailable(t.index, t.type) >= 2
      ).length < 2
    ) {
      //And no value honor pair
      this.ai.logger.log(
        'Not enough Yaku! Declined! ' + newHandValue.yaku.open + ' < 0.15'
      );
      this.ai.api.declineCall(operation);
      return false;
    }

    if (handValue.waits > 0 && newHandValue.waits < handValue.waits + 1) {
      //Call results in worse waits
      this.ai.logger.log('Call would result in less waits! Declined!');
      this.ai.api.declineCall(operation);
      return false;
    }

    if (
      this.ai.isClosed &&
      newHandValue.score.open < 1500 - this.ai.CALL_PON_CHI * 200 &&
      newHandValue.shanten >= 2 + this.ai.CALL_PON_CHI &&
      this.ai.seatWind != 1 && // Hand is worthless and slow and not dealer. Should prevent cheap yakuhai or tanyao calls
      !(newHonorPairs >= 1 && newPairs >= 2)
    ) {
      this.ai.logger.log('Hand is cheap and slow! Declined!');
      this.ai.api.declineCall(operation);
      return false;
    }

    if (this.ai.seatWind == 1) {
      //Remove dealer bonus for the following checks
      handValue.score.closed /= 1.5;
      handValue.score.open /= 1.5;
      newHandValue.score.open /= 1.5;
    }

    if (newHandValue.shanten > handValue.shanten) {
      //Call would make shanten worse
      this.ai.logger.log('Call would increase shanten! Declined!');
      this.ai.api.declineCall(operation);
      return false;
    } else if (newHandValue.shanten == handValue.shanten) {
      //When it does not improve shanten
      if (
        !this.ai.isClosed &&
        newHandValue.priority > handValue.priority * 1.5
      ) {
        //When the call improves the hand
        this.ai.logger.log(
          'Call accepted because hand is already open and it improves the hand!'
        );
      } else {
        this.ai.api.declineCall(operation);
        this.ai.logger.log(
          'Call declined because it does not benefit the hand!'
        );
        return false;
      }
    } else {
      //When it improves shanten
      var isBadWait =
        callTiles[0].index == callTiles[1].index ||
        Math.abs(callTiles[0].index - callTiles[1].index) == 2 || // Pon or Kanchan
        (callTiles[0].index >= 8 && callTiles[1].index >= 8) ||
        (callTiles[0].index <= 2 && callTiles[1].index <= 2); //Penchan

      if (
        handValue.shanten >= 5 - this.ai.CALL_PON_CHI &&
        this.ai.seatWind == 1
      ) {
        //Very slow hand & dealer? -> Go for a fast win
        this.ai.logger.log(
          'Call accepted because of slow hand and dealer position!'
        );
      } else if (
        !this.ai.isClosed &&
        newHandValue.score.open > handValue.score.open * 0.9
      ) {
        //Hand is already open and it reduces shanten while not much value is lost
        this.ai.logger.log('Call accepted because hand is already open!');
      } else if (
        newHandValue.score.open >= 4500 - this.ai.CALL_PON_CHI * 500 &&
        newHandValue.score.open > handValue.score.closed * 0.7
      ) {
        //High value hand? -> Go for a fast win
        this.ai.logger.log('Call accepted because of high value hand!');
      } else if (
        newHandValue.score.open >= handValue.score.closed * 1.75 && //Call gives additional value to hand
        (newHandValue.score.open >=
          2000 -
            this.ai.CALL_PON_CHI * 200 -
            (3 - newHandValue.shanten) * 200 || //And either hand is not extremely cheap...
          newHonorPairs >= 1)
      ) {
        //Or there are some honor pairs in hand (=can be called easily or act as safe discards)
        this.ai.logger.log(
          'Call accepted because it boosts the value of the hand!'
        );
      } else if (
        newHandValue.score.open > handValue.score.open * 0.9 && //Call loses not much value
        newHandValue.score.open > handValue.score.closed * 0.7 &&
        ((isBadWait &&
          newHandValue.score.open >=
            1000 -
              this.ai.CALL_PON_CHI * 100 -
              (3 - newHandValue.shanten) * 100) || // And it's a bad wait while the hand is not extremely cheap
          (!isBadWait &&
            newHandValue.score.open >=
              2000 -
                this.ai.CALL_PON_CHI * 200 -
                (3 - newHandValue.shanten) * 200) || //Or it was a good wait and the hand is at least a bit valuable
          newHonorPairs >= 2) && //Or multiple honor pairs
        newHandTriples.pairs.filter(
          (t) =>
            this.ai.utils.isValueTile(t) &&
            this.ai.utils.getNumberOfTilesAvailable(t.index, t.type) >= 1
        ).length >= 2 &&
        (newPairs >= 2 || newHandValue.shanten > 1)
      ) {
        //And would open hand anyway with honor call
        this.ai.logger.log('Call accepted because it reduces shanten!');
      } else if (
        newHandValue.shanten == 0 &&
        newHandValue.score.open > handValue.score.closed * 0.9 &&
        newHandValue.waits > 2 &&
        isBadWait
      ) {
        // Make hand ready and eliminate a bad wait
        this.ai.logger.log(
          'Call accepted because it eliminates a bad wait and makes the hand ready!'
        );
      } else if (
        0.5 -
          this.ai.game.tilesLeft / this.ai.wallSize +
          (0.25 - newHandValue.shanten / 4) +
          (newHandValue.shanten > 0
            ? (newPairs - newHandValue.shanten - 0.5) / 2
            : 0) +
          (newHandValue.score.open / 3000 - 0.5) +
          ((newHandValue.score.open / handValue.score.closed) * 0.75 - 0.75) +
          (Number(isBadWait) / 2 - 0.25) >=
        1 - this.ai.CALL_PON_CHI / 2
      ) {
        //The call is good in multiple aspects
        this.ai.logger.log(
          "Call accepted because it's good in multiple aspects"
        );
      } else {
        //Decline
        this.ai.api.declineCall(operation);
        this.ai.logger.log(
          'Call declined because it does not benefit the hand!'
        );
        return false;
      }
    }

    this.ai.api.makeCallWithOption(operation, comb);
    return true;
  }

  //Call Tile for Kan
  evalDaiminkan() {
    if (!this.ai.isClosed) {
      this.callKan(Operation.OpenKan, this.ai.api.getTileForCall());
    } else {
      //Always decline with closed hand
      this.ai.api.declineCall(Operation.OpenKan);
    }
  }

  //Add from Hand to existing Pon
  evalShouminkan() {
    this.callKan(Operation.AddedKan, this.ai.api.getTileForCall());
  }

  //Closed Kan
  evalAnkan(combination: string[]) {
    this.callKan(Operation.ClosedKan, new Tile(combination[0])!);
  }

  //Needs a semi good hand to call Kans and other players are not dangerous
  callKan(operation: number, tileForCall: Tile) {
    this.ai.logger.log('Consider Kan.');
    var tiles = this.getHandValues(
      this.ai.utils.getHandWithCalls(this.ai.game.hand)
    );

    var newTiles = this.getHandValues(
      this.ai.utils.getHandWithCalls(
        this.ai.utils.removeTilesFromTileArray(this.ai.game.hand, [tileForCall])
      )
    ); //Check if efficiency goes down without additional tile

    if (
      this.ai.game.self.riichiTile ||
      (this.ai.strategyAllowsCalls &&
        tiles.shanten <=
          this.ai.game.tilesLeft / (this.ai.wallSize / 2) + this.ai.CALL_KAN &&
        this.ai.defense.getCurrentDangerLevel() <
          1000 + this.ai.CALL_KAN * 500 &&
        tiles.shanten >= newTiles.shanten &&
        tiles.efficiency * 0.9 <= newTiles.efficiency)
    ) {
      this.ai.api.makeCall(operation);
      this.ai.logger.log('Kan accepted!');
    } else {
      if (operation == Operation.OpenKan) {
        // Decline call for closed/added Kans is not working, just skip it and discard normally
        this.ai.api.declineCall(operation);
      }
      this.ai.logger.log('Kan declined!');
    }
  }

  callRon() {
    this.ai.api.makeCall(Operation.Ron);
  }

  callTsumo() {
    this.ai.api.makeCall(Operation.Tsumo);
  }

  evalKita() {
    // 3 player only
    if (
      this.ai.strategy != Strategy.ThirteenOrphans &&
      this.ai.strategy != Strategy.Fold
    ) {
      if (
        this.ai.utils.getNumberOfTilesInTileArray(this.ai.game.hand, 4, 3) > 1
      ) {
        //More than one north tile: Check if it's okay to call kita
        var handValue = this.getHandValues(this.ai.game.hand);
        var newHandValue = this.getHandValues(
          this.ai.utils.removeTilesFromTileArray(this.ai.game.hand, [
            new Tile({ index: 4, type: 3, dora: false }),
          ])
        );
        if (
          handValue.shanten <= 1 &&
          newHandValue.shanten > handValue.shanten
        ) {
          return false;
        }
      }
      this.ai.api.sendKitaCall();
      return true;
    }
    return false;
  }

  evalAbortiveDraw() {
    // Kyuushu Kyuuhai, 9 Honors or Terminals in starting Hand
    if (this.canDoThirteenOrphans()) {
      return;
    }
    var handValue = this.getHandValues(this.ai.game.hand);
    if (handValue.shanten >= 4) {
      //Hand is bad -> abort game
      this.ai.api.sendAbortiveDrawCall();
    }
  }

  evalRiichi(op: lq.IOptionalOperation, tilePrios: TilePriority[]) {
    this.ai.logger.log(JSON.stringify(op.combination));
    assert(op.combination);
    const combination = [
      ...op.combination,
      ...op.combination
        .filter((comb) => comb.charAt(0) === '0')
        .map((comb) => `5${comb.charAt(1)}`),
    ];

    for (let tilePrio of tilePrios) {
      for (let comb of combination) {
        if (tilePrio.tile.equals(comb)) {
          if (!this.ai.utils.shouldRiichi(tilePrio)) return false;

          const moqie = tilePrio.tile.equals(this.ai.game.hand.at(-1)!);
          this.ai.logger.log(`Riichi Discard: ${tilePrio.tile}`);
          this.ai.api.sendRiichiCall(comb, moqie);
          this.ai.game.FastTest.inputOperation({
            type: Operation.Riichi,
            tile: comb,
            moqie,
            timeuse: Math.random() * 2 + 1,
          });
          return true;
        }
      }
    }

    this.ai.logger.log('Riichi declined because Combination not found!');
    return false;
  }

  //Discard the safest tile, but consider slightly riskier tiles with same shanten
  discardFold(tiles: TilePriority[]) {
    if (this.ai.strategy != Strategy.Fold) {
      //Not in full Fold mode yet: Discard a relatively safe tile with high priority
      for (let tile of tiles) {
        var foldThreshold = this.ai.utils.getFoldThreshold(
          tile,
          this.ai.game.hand
        );
        if (
          tile.shanten == Math.min(...tiles.map((t) => t.shanten)) && //If next tile same shanten as the best tile
          tile.danger < Math.min(...tiles.map((t) => t.danger)) * 1.1 && //And the tile is not much more dangerous than the safest tile
          tile.danger <= foldThreshold * 2
        ) {
          this.ai.logger.log('Tile Priorities: ');
          this.ai.logger.printTilePriority(tiles);
          this.discardTile(tile.tile);
          return tile.tile;
        }
      }
      // No safe tile with good shanten found: Full Fold.
      this.ai.logger.log('Hand is very dangerous, full fold.');
      this.ai.strategyAllowsCalls = false;
    }

    tiles.sort(function (p1, p2) {
      return p1.danger - p2.danger;
    });
    this.ai.logger.log('Fold Tile Priorities: ');
    this.ai.logger.printTilePriority(tiles);

    this.discardTile(tiles[0].tile);
    return tiles[0].tile;
  }

  //Remove the given Tile from Hand
  discardTile(tile: Tile) {
    if (!tile.valid) {
      return;
    }
    this.ai.logger.log('Discard: ' + this.ai.logger.getTileName(tile, false));
    for (var i = this.ai.game.hand.length - 1; i >= 0; i--) {
      if (this.ai.game.hand[i].strictlyEquals(tile)) {
        this.ai.game.players[0].pond.push(this.ai.game.hand[i]);
        if (!this.ai.utils.isDebug()) {
          this.ai.api.callDiscard(i);
        } else {
          this.ai.game.hand.splice(i, 1);
        }
        break;
      }
    }
  }

  //Simulates discarding every tile and calculates hand value.
  //Asynchronous to give the browser time to "breath"
  async getTilePriorities(inputHand: Tile[]) {
    if (this.ai.utils.isDebug()) {
      this.ai.logger.log(
        'Dora: ' +
          this.ai.logger.getTileName(this.ai.game.doraIndicators![0], false)
      );
      this.ai.logger.printHand(inputHand);
    }

    var tiles: TilePriority[] = [];
    if (this.ai.strategy == Strategy.Chiitoitsu) {
      tiles = this.chiitoitsuPriorities();
    } else if (this.ai.strategy == Strategy.ThirteenOrphans) {
      tiles = this.thirteenOrphansPriorities();
    } else {
      for (var i = 0; i < inputHand.length; i++) {
        //Create 13 Tile hands

        var hand = [...inputHand];
        hand.splice(i, 1);

        if (
          tiles.filter((t) => t.tile.strictlyEquals(inputHand[i])).length > 0
        ) {
          //Skip same tiles in hand
          continue;
        }

        tiles.push(this.getHandValues(hand, inputHand[i]));

        await new Promise((r) => setTimeout(r, 10)); //Sleep a short amount of time to not completely block the browser
      }
    }

    tiles.sort(function (p1, p2) {
      return p2.priority - p1.priority;
    });
    return Promise.resolve(tiles);
  }

  /*
	Calculates Values for all tiles in the hand.
	As the Core of the AI this function is really complex. The simple explanation:
	It simulates the next two turns, calculates all the important stuff (shanten, dora, yaku, waits etc.) and produces a priority for each tile based on the expected value/shanten in two turns.

	In reality it would take far too much time to calculate all the possibilites (availableTiles * (availableTiles - 1) * 2 which can be up to 30000 possibilities).
	Therefore most of the complexity comes from tricks to reduce the runtime:
	At first all the tiles are computed that could improve the hand in the next two turns (which is usually less than 1000).
	Duplicates (for example 3m -> 4m and 4m -> 3m) are marked and will only be computed once, but with twice the value.
	The rest is some math to produce the same result which would result in actually simulating everything (like adding the original value of the hand for all the useless combinations).
	*/
  getHandValues(hand: Tile[], discardedTile?: Tile): TilePriority {
    var shanten = 8; //No check for Chiitoitsu in this function, so this is maximum

    var callTriples = Math.floor(
      this.ai.utils.getTriples(this.ai.calls[0]).length / 3
    );

    var triplesAndPairs = this.ai.utils.getTriplesAndPairs(hand);

    var triples = triplesAndPairs.triples;
    var pairs = triplesAndPairs.pairs;
    var doubles = this.ai.utils.getDoubles(
      this.ai.utils.removeTilesFromTileArray(hand, triples.concat(pairs))
    );

    var baseShanten = this.ai.utils.calculateShanten(
      Math.floor(triples.length / 3) + callTriples,
      Math.floor(pairs.length / 2),
      Math.floor(doubles.length / 2)
    );

    if (typeof discardedTile != 'undefined') {
      //When deciding whether to call for a tile there is no discarded tile in the evaluation
      hand.push(discardedTile); //Calculate original values
      var originalCombinations = this.ai.utils.getTriplesAndPairs(hand);
      var originalTriples = originalCombinations.triples;
      var originalPairs = originalCombinations.pairs;
      var originalDoubles = this.ai.utils.getDoubles(
        this.ai.utils.removeTilesFromTileArray(
          hand,
          originalTriples.concat(originalPairs)
        )
      );

      var originalShanten = this.ai.utils.calculateShanten(
        Math.floor(originalTriples.length / 3) + callTriples,
        Math.floor(originalPairs.length / 2),
        Math.floor(originalDoubles.length / 2)
      );
      hand.pop();
    } else {
      var originalShanten = baseShanten;
    }

    var expectedScore = { open: 0, closed: 0, riichi: 0 }; //For the expected score (only looking at hands that improve the current hand)
    var yaku = { open: 0, closed: 0 }; //Expected Yaku
    var doraValue = 0; //Expected Dora
    var waits = 0; //Waits when in Tenpai
    var shape = 0; //When 1 shanten: Contains a value that indicates how good the shape of the hand is
    var fu = 0;

    var kita = 0;
    if (this.ai.utils.getNumberOfPlayers() == 3) {
      kita =
        this.ai.game.self.kitas *
        this.ai.utils.getTileDoraValue({ index: 4, type: 3 });
    }

    var waitTiles = [];
    var tileCombinations: {
      tile1: Tile;
      tiles2: {
        tile2: Tile;
        winning: boolean;
        furiten: boolean;
        triplesAndPairs: {
          triples: Tile[];
          pairs: Tile[];
          shanten: number;
        } | null;
        duplicate: boolean;
        skip: boolean;
      }[];
      winning: boolean;
      furiten: boolean;
      triplesAndPairs: {
        triples: Tile[];
        pairs: Tile[];
        shanten: number;
      } | null;
      triplesAndPairs3?: {
        triples: Tile[];
        pairs: Tile[];
        shanten: number;
      } | null;
    }[] = []; //List of combinations for second step to save calculation time

    // STEP 1: Create List of combinations of tiles that can improve the hand
    var newTiles1 = this.ai.utils.getUsefulTilesForDouble(hand); //For every tile: Find tiles that make them doubles or triples
    for (let newTile of newTiles1) {
      var numberOfTiles1 = this.ai.utils.getNumberOfTilesAvailable(
        newTile.index,
        newTile.type
      );
      if (numberOfTiles1 <= 0) {
        //Skip if tile is dead
        continue;
      }

      hand.push(newTile);
      var newTiles2 = this.ai.utils
        .getUsefulTilesForDouble(hand)
        .filter(
          (t) => this.ai.utils.getNumberOfTilesAvailable(t.index, t.type) > 0
        );
      if (this.ai.PERFORMANCE_MODE - this.ai.timeSave <= 1) {
        //In Low Spec Mode: Ignore some combinations that are unlikely to improve the hand -> Less calculation time
        newTiles2 = this.ai.utils
          .getUsefulTilesForTriple(hand)
          .filter(
            (t) => this.ai.utils.getNumberOfTilesAvailable(t.index, t.type) > 0
          );
        if (this.ai.PERFORMANCE_MODE - this.ai.timeSave <= 0) {
          //Ignore even more tiles for extremenly low spec...
          newTiles2 = newTiles2.filter((t) => t.type == newTile.type);
        }
      }

      var newTiles2Objects = [];
      for (let t of newTiles2) {
        var dupl1 = tileCombinations.find((tc) => tc.tile1.equals(t)); //Check if combination is already in the array
        var skip = false;
        if (typeof dupl1 != 'undefined') {
          var duplicateCombination = dupl1.tiles2.find((t2) =>
            t2.tile2.equals(newTile)
          );
          if (typeof duplicateCombination != 'undefined') {
            //If already exists: Set flag to count it twice and set flag to skip the current one
            duplicateCombination.duplicate = true;
            skip = true;
          }
        }
        newTiles2Objects.push({
          tile2: t,
          winning: false,
          furiten: false,
          triplesAndPairs: null,
          duplicate: false,
          skip: skip,
        });
      }

      tileCombinations.push({
        tile1: newTile,
        tiles2: newTiles2Objects,
        winning: false,
        furiten: false,
        triplesAndPairs: null,
      });
      hand.pop();
    }

    //STEP 2: Check if some of these tiles or combinations are winning or in furiten. We need to know this in advance for Step 3
    for (let tileCombination of tileCombinations) {
      //Simulate only the first tile drawn for now
      var tile1 = tileCombination.tile1;
      hand.push(tile1);

      var triplesAndPairs2 = this.ai.utils.getTriplesAndPairs(hand);

      var winning = this.ai.utils.isWinningHand(
        Math.floor(triplesAndPairs2.triples.length / 3) + callTriples,
        triplesAndPairs2.pairs.length / 2
      );
      if (winning) {
        waitTiles.push(tile1);
        //Mark this tile in other combinations as not duplicate and no skip
        for (let tc of tileCombinations) {
          tc.tiles2.forEach((t2) => {
            if (tile1.equals(t2.tile2)) {
              t2.duplicate = false;
              t2.skip = false;
            }
          });
        }
      }
      var furiten =
        winning &&
        (this.ai.utils.isTileFuriten(tile1.index, tile1.type) ||
          discardedTile!.equals(tile1));
      tileCombination.winning = winning;
      tileCombination.furiten = furiten;
      tileCombination.triplesAndPairs = triplesAndPairs2; //The triplesAndPairs function is really slow, so save this result for later

      hand.pop();
    }

    var tile1Furiten = tileCombinations.filter((t) => t.furiten).length > 0;
    for (let tileCombination of tileCombinations) {
      //Now again go through all the first tiles, but also the second tiles
      hand.push(tileCombination.tile1);
      for (let tile2Data of tileCombination.tiles2) {
        if (tile2Data.skip || (tileCombination.winning && !tile1Furiten)) {
          //Ignore second tile if marked as skip(is a duplicate) or already winning with tile 1
          continue;
        }
        hand.push(tile2Data.tile2);

        var triplesAndPairs3 = this.ai.utils.getTriplesAndPairs(hand);

        var winning2 = this.ai.utils.isWinningHand(
          Math.floor(triplesAndPairs3.triples.length / 3) + callTriples,
          triplesAndPairs3.pairs.length / 2
        );
        var furiten2 =
          winning2 &&
          (this.ai.utils.isTileFuriten(
            tile2Data.tile2.index,
            tile2Data.tile2.type
          ) ||
            discardedTile!.equals(tile2Data.tile2));
        tile2Data.winning = winning2;
        tile2Data.furiten = furiten2;
        tile2Data.triplesAndPairs = triplesAndPairs3;

        hand.pop();
      }
      hand.pop();
    }

    var numberOfTotalCombinations = 0;
    var numberOfTotalWaitCombinations = 0;

    //STEP 3: Check the values when these tiles are drawn.
    for (let tileCombination of tileCombinations) {
      var tile1 = tileCombination.tile1;
      var numberOfTiles1 = this.ai.utils.getNumberOfTilesAvailable(
        tile1.index,
        tile1.type
      );

      //Simulate only the first tile drawn for now
      hand.push(tile1);

      var triplesAndPairs2 = tileCombination.triplesAndPairs!;
      var triples2 = triplesAndPairs2.triples;
      var pairs2 = triplesAndPairs2.pairs;

      if (
        !this.ai.isClosed &&
        !tileCombination.winning &&
        this.ai.utils.getNumberOfTilesInTileArray(
          triples2,
          tile1.index,
          tile1.type
        ) == 3
      ) {
        numberOfTiles1 *= 2; //More value to possible triples when hand is open (can call pons from all players)
      }

      var factor;
      var thisShanten = 8;
      if (tileCombination.winning && !tile1Furiten) {
        //Hand is winning: Add the values of the hand for most possible ways to draw this:
        factor = numberOfTiles1 * (this.ai.availableTiles.length - 1); //Number of ways to draw this tile first and then any of the other tiles
        //Number of ways to draw a random tile which we don't have in the array and then the winning tile. We only look at the "good tile -> winning tile" combination later.
        factor +=
          (this.ai.availableTiles.length -
            tileCombinations.reduce(
              (pv, cv) =>
                pv +
                this.ai.utils.getNumberOfTilesAvailable(
                  cv.tile1.index,
                  cv.tile1.type
                ),
              0
            )) *
          numberOfTiles1;
        thisShanten = -1 - baseShanten;
      } else {
        // This tile is not winning
        // For all the tiles we don't consider as a second draw (because they're useless): The shanten value for this tile -> useless tile is just the value after the first draw
        var doubles2 = this.ai.utils.getDoubles(
          this.ai.utils.removeTilesFromTileArray(hand, triples2.concat(pairs2))
        );
        factor =
          numberOfTiles1 *
          (this.ai.availableTiles.length -
            1 -
            tileCombination.tiles2.reduce((pv, cv) => {
              // availableTiles - useful tiles (which we will check later)
              if (tile1.equals(cv.tile2)) {
                return (
                  pv +
                  this.ai.utils.getNumberOfTilesAvailable(
                    cv.tile2.index,
                    cv.tile2.type
                  ) -
                  1
                );
              }
              return (
                pv +
                this.ai.utils.getNumberOfTilesAvailable(
                  cv.tile2.index,
                  cv.tile2.type
                )
              );
            }, 0));
        if (tile1Furiten) {
          thisShanten = 0 - baseShanten;
        } else {
          thisShanten =
            this.ai.utils.calculateShanten(
              Math.floor(triples2.length / 3) + callTriples,
              Math.floor(pairs2.length / 2),
              Math.floor(doubles2.length / 2)
            ) - baseShanten;
        }
      }

      shanten += thisShanten * factor;

      if (tileCombination.winning) {
        //For winning tiles: Add waits, fu and the Riichi value
        var thisDora = this.ai.utils.getNumberOfDoras(
          triples2.concat(pairs2, this.ai.calls[0])
        );
        var thisYaku = this.yaku.getYaku(
          hand,
          this.ai.calls[0],
          triplesAndPairs2
        );
        var thisWait = numberOfTiles1 * this.ai.utils.getWaitQuality(tile1);
        var thisFu = this.ai.utils.calculateFu(
          triples2,
          this.ai.calls[0],
          pairs2,
          this.ai.utils.removeTilesFromTileArray(
            hand,
            triples.concat(pairs).concat(tile1)
          ),
          tile1
        );
        if (
          this.ai.isClosed ||
          thisYaku.open >= 1 ||
          this.ai.game.tilesLeft <= 4
        ) {
          if (tile1Furiten && this.ai.game.tilesLeft > 4) {
            thisWait = numberOfTiles1 / 6;
          }
          waits += thisWait;
          fu += thisFu * thisWait * factor;
          if (thisFu == 30 && this.ai.isClosed) {
            thisYaku.closed += 1;
          }
          doraValue += thisDora * factor;
          yaku.open += thisYaku.open * factor;
          yaku.closed += thisYaku.closed * factor;
          expectedScore.open +=
            this.ai.utils.calculateScore(
              0,
              thisYaku.open + thisDora + kita,
              thisFu
            ) * factor;
          expectedScore.closed +=
            this.ai.utils.calculateScore(
              0,
              thisYaku.closed + thisDora + kita,
              thisFu
            ) * factor;
          numberOfTotalCombinations += factor;
        }

        expectedScore.riichi +=
          this.ai.utils.calculateScore(
            0,
            thisYaku.closed +
              thisDora +
              kita +
              1 +
              0.2 +
              this.ai.utils.getUradoraChance(),
            thisFu
          ) *
          thisWait *
          factor;
        numberOfTotalWaitCombinations += factor * thisWait;
        if (!tile1Furiten) {
          hand.pop();
          continue; //No need to check this tile in combination with any of the other tiles, if this is drawn first and already wins
        }
      }

      var tile2Furiten =
        tileCombination.tiles2.filter((t) => t.furiten).length > 0;

      for (let tile2Data of tileCombination.tiles2) {
        //Look at second tiles if not already winning
        var tile2 = tile2Data.tile2;
        var numberOfTiles2 = this.ai.utils.getNumberOfTilesAvailable(
          tile2.index,
          tile2.type
        );
        if (tile1.equals(tile2)) {
          if (numberOfTiles2 == 1) {
            continue;
          }
          numberOfTiles2--;
        }

        if (tile2Data.skip) {
          continue;
        }

        var combFactor = numberOfTiles1 * numberOfTiles2; //Number of ways to draw tile 1 first and then tile 2
        if (tile2Data.duplicate) {
          combFactor *= 2;
        }

        hand.push(tile2); //Simulate second draw

        var triplesAndPairs3 = tile2Data.triplesAndPairs!;
        var triples3 = triplesAndPairs3.triples;
        var pairs3 = triplesAndPairs3.pairs;

        var thisShanten = 8;
        var winning = this.ai.utils.isWinningHand(
          Math.floor(triples3.length / 3) + callTriples,
          pairs3.length / 2
        );

        var thisDora = this.ai.utils.getNumberOfDoras(
          triples3.concat(pairs3, this.ai.calls[0])
        );
        var thisYaku = this.yaku.getYaku(
          hand,
          this.ai.calls[0],
          triplesAndPairs3
        );

        if (
          !this.ai.isClosed &&
          (!winning || tile2Furiten) &&
          this.ai.utils.getNumberOfTilesInTileArray(
            triples3,
            tile2.index,
            tile2.type
          ) == 3
        ) {
          combFactor *= 2; //More value to possible triples when hand is open (can call pons from all players)
        }

        if (winning && !tile2Furiten) {
          //If this tile combination wins in 2 turns: calculate shape etc.
          thisShanten = -1 - baseShanten;
          if (waitTiles.filter((t) => t.equals(tile2)).length == 0) {
            var newShape =
              numberOfTiles2 *
              this.ai.utils.getWaitQuality(tile2) *
              (numberOfTiles1 / this.ai.availableTiles.length);
            if (tile2Data.duplicate) {
              newShape +=
                numberOfTiles1 *
                this.ai.utils.getWaitQuality(tile1) *
                (numberOfTiles2 / this.ai.availableTiles.length);
            }
            shape += newShape;
          }

          var secondDiscard = this.ai.utils.removeTilesFromTileArray(
            hand,
            triples3.concat(pairs3)
          )[0];
          if (!tile2Data.duplicate) {
            var newFu = this.ai.utils.calculateFu(
              triples3,
              this.ai.calls[0],
              pairs3,
              this.ai.utils.removeTilesFromTileArray(
                hand,
                triples.concat(pairs).concat(tile2).concat(secondDiscard)
              ),
              tile2
            );
            if (newFu == 30 && this.ai.isClosed) {
              thisYaku.closed += 1;
            }
          } else {
            //Calculate Fu for drawing both tiles in different orders
            var newFu = this.ai.utils.calculateFu(
              triples3,
              this.ai.calls[0],
              pairs3,
              this.ai.utils.removeTilesFromTileArray(
                hand,
                triples.concat(pairs).concat(tile2).concat(secondDiscard)
              ),
              tile2
            );
            var newFu2 = this.ai.utils.calculateFu(
              triples3,
              this.ai.calls[0],
              pairs3,
              this.ai.utils.removeTilesFromTileArray(
                hand,
                triples.concat(pairs).concat(tile1).concat(secondDiscard)
              ),
              tile1
            );
            if (newFu == 30 && this.ai.isClosed) {
              thisYaku.closed += 0.5;
            }
            if (newFu2 == 30 && this.ai.isClosed) {
              thisYaku.closed += 0.5;
            }
          }
        } else {
          //Not winning? Calculate shanten correctly
          if (
            winning &&
            (tile2Furiten || (!this.ai.isClosed && thisYaku.open < 1))
          ) {
            //Furiten/No Yaku: We are 0 shanten
            thisShanten = 0 - baseShanten;
          } else {
            var numberOfDoubles = this.ai.utils.getDoubles(
              this.ai.utils.removeTilesFromTileArray(
                hand,
                triples3.concat(pairs3)
              )
            ).length;
            var numberOfPairs = pairs3.length;
            thisShanten =
              this.ai.utils.calculateShanten(
                Math.floor(triples3.length / 3) + callTriples,
                Math.floor(numberOfPairs / 2),
                Math.floor(numberOfDoubles / 2)
              ) - baseShanten;
            if (thisShanten == -1) {
              //Give less prio to tile combinations that only improve the hand by 1 shanten in two turns.
              thisShanten = -0.5;
            }
          }
        }
        shanten += thisShanten * combFactor;

        if (winning || thisShanten < 0) {
          doraValue += thisDora * combFactor;
          yaku.open += thisYaku.open * combFactor;
          yaku.closed += thisYaku.closed * combFactor;
          expectedScore.open +=
            this.ai.utils.calculateScore(0, thisYaku.open + thisDora + kita) *
            combFactor;
          expectedScore.closed +=
            this.ai.utils.calculateScore(0, thisYaku.closed + thisDora + kita) *
            combFactor;
          numberOfTotalCombinations += combFactor;
        }

        hand.pop();
      }

      hand.pop();
    }

    var allCombinations =
      this.ai.availableTiles.length * (this.ai.availableTiles.length - 1);
    shanten /= allCombinations; //Divide by total amount of possible draw combinations

    if (numberOfTotalCombinations > 0) {
      expectedScore.open /= numberOfTotalCombinations; //Divide by the total combinations we checked, to get the average expected value
      expectedScore.closed /= numberOfTotalCombinations;
      doraValue /= numberOfTotalCombinations;
      yaku.open /= numberOfTotalCombinations;
      yaku.closed /= numberOfTotalCombinations;
    }
    if (numberOfTotalWaitCombinations > 0) {
      expectedScore.riichi /= numberOfTotalWaitCombinations;
      fu /= numberOfTotalWaitCombinations;
    }
    if (waitTiles.length > 0) {
      waits *= waitTiles.length * 0.15 + 0.75; //Waiting on multiple tiles is better
    }

    fu = fu <= 30 ? 30 : fu;
    fu = fu > 110 ? 30 : fu;

    var efficiency = (shanten + (baseShanten - originalShanten)) * -1; //Percent Number that indicates how big the chance is to improve the hand (in regards to efficiency). Negative for increasing shanten with the discard
    if (originalShanten == 0) {
      //Already in Tenpai: Look at waits instead
      if (baseShanten == 0) {
        efficiency = (waits + shape) / 10;
      } else {
        efficiency = (shanten / 1.7) * -1;
      }
    }

    if (baseShanten > 0) {
      //When not tenpai
      expectedScore.riichi = this.ai.utils.calculateScore(
        0,
        yaku.closed +
          doraValue +
          kita +
          1 +
          0.2 +
          this.ai.utils.getUradoraChance()
      );
    }

    var danger = 0;
    var sakigiri = 0;
    if (typeof discardedTile != 'undefined') {
      //When deciding whether to call for a tile there is no discarded tile in the evaluation
      danger = this.ai.defense.getTileDanger(discardedTile);
      sakigiri = this.ai.defense.getSakigiriValue(hand, discardedTile);
    }

    var priority = this.calculateTilePriority(
      efficiency,
      expectedScore,
      danger - sakigiri
    );

    var riichiPriority = 0;
    if (originalShanten == 0) {
      //Already in Tenpai: Look at waits instead
      riichiPriority = this.calculateTilePriority(
        waits / 10,
        expectedScore,
        danger - sakigiri
      );
    }

    return {
      tile: discardedTile!,
      priority: priority,
      riichiPriority: riichiPriority,
      shanten: baseShanten,
      efficiency: efficiency,
      score: expectedScore,
      dora: doraValue,
      yaku: yaku,
      waits: waits,
      shape: shape,
      danger: danger,
      fu: fu,
    };
  }

  //Calculates a relative priority based on how "good" the given values are.
  //The resulting priority value is useless as an absolute value, only use it relatively to compare with other values of the same hand.
  calculateTilePriority(
    efficiency: number,
    expectedScore: {
      open: number;
      closed: number;
      riichi: number;
    },
    danger: number
  ) {
    var score = expectedScore.open;
    if (this.ai.isClosed) {
      score = expectedScore.closed;
    }

    var placementFactor = 1;

    if (this.ai.utils.isLastGame() && this.ai.utils.getDistanceToFirst() < 0) {
      //First Place in last game:
      placementFactor = 1.5;
    }

    //Basically the formula should be efficiency multiplied by score (=expected value of the hand)
    //But it's generally better to just win even with a small score to prevent others from winning (and no-ten penalty)
    //That's why efficiency is weighted a bit higher with Math.pow.
    var weightedEfficiency = Math.pow(
      Math.abs(efficiency),
      0.3 + this.ai.EFFICIENCY * placementFactor
    );
    weightedEfficiency =
      efficiency < 0 ? -weightedEfficiency : weightedEfficiency;

    score -= danger * 2 * this.ai.SAFETY;

    if (weightedEfficiency < 0) {
      //Hotfix for negative efficiency (increasing shanten)
      score = 50000 - score;
    }

    return weightedEfficiency * score;
  }

  //Get Chiitoitsu Priorities -> Look for Pairs
  chiitoitsuPriorities() {
    var tiles: TilePriority[] = [];

    var originalPairs = this.ai.utils.getPairsAsArray(this.ai.game.hand);

    var originalShanten = 6 - originalPairs.length / 2;

    for (var i = 0; i < this.ai.game.hand.length; i++) {
      //Create 13 Tile hands, check for pairs
      var newHand = [...this.ai.game.hand];
      newHand.splice(i, 1);
      var pairs = this.ai.utils.getPairsAsArray(newHand);
      var pairsValue = pairs.length / 2;
      var handWithoutPairs = this.ai.utils.removeTilesFromTileArray(
        newHand,
        pairs
      );

      var baseDora = this.ai.utils.getNumberOfDoras(pairs);
      var doraValue = 0;
      var baseShanten = 6 - pairsValue;

      var waits = 0;
      var shanten = 0;

      var baseYaku = this.yaku.getYaku(newHand, this.ai.calls[0]);
      var yaku = { open: 0, closed: 0 };

      var shape = 0;

      //Possible Value, Yaku and Dora after Draw
      handWithoutPairs.forEach((tile) => {
        var currentHand = [...handWithoutPairs];
        currentHand.push(tile);
        var numberOfTiles = this.ai.utils.getNumberOfNonFuritenTilesAvailable(
          tile.index,
          tile.type
        );
        var chance =
          (numberOfTiles + this.ai.utils.getWaitQuality(tile) / 10) /
          this.ai.availableTiles.length;
        var pairs2 = this.ai.utils.getPairsAsArray(currentHand);
        if (pairs2.length > 0) {
          //If the tiles improves the hand: Calculate the expected values
          shanten +=
            (6 - (pairsValue + pairs2.length / 2) - baseShanten) * chance;
          doraValue += this.ai.utils.getNumberOfDoras(pairs2) * chance;
          var y2 = this.yaku.getYaku(
            currentHand.concat(pairs),
            this.ai.calls[0]
          );
          yaku.open += (y2.open - baseYaku.open) * chance;
          yaku.closed += (y2.closed - baseYaku.closed) * chance;
          if (pairsValue + pairs2.length / 2 == 7) {
            //Winning hand
            waits = numberOfTiles * this.ai.utils.getWaitQuality(tile);
            doraValue = this.ai.utils.getNumberOfDoras(pairs2);
            if (
              tile.index < 3 ||
              tile.index > 7 ||
              tile.doraValue! > 0 ||
              this.ai.utils.getWaitQuality(tile) > 1.1 || //Good Wait
              currentHand.filter(
                (tile) => tile.type == 3 || tile.index == 1 || tile.index == 9
              ).length == 0
            ) {
              //Or Tanyao
              shape = 1;
            }
          }
        }
      });
      doraValue += baseDora;
      yaku.open += baseYaku.open;
      yaku.closed += baseYaku.closed + 2; //Add Chiitoitsu manually
      if (this.ai.utils.getNumberOfPlayers() == 3) {
        doraValue +=
          this.ai.game.self.kitas *
          this.ai.utils.getTileDoraValue({ index: 4, type: 3 });
      }

      var expectedScore = {
        open: 1000,
        closed: this.ai.utils.calculateScore(0, yaku.closed + doraValue, 25),
        riichi: this.ai.utils.calculateScore(
          0,
          yaku.closed + doraValue + 1 + 0.2 + this.ai.utils.getUradoraChance(),
          25
        ),
      };

      var efficiency = (shanten + (baseShanten - originalShanten)) * -1;
      if (originalShanten == 0) {
        //Already in Tenpai: Look at waits instead
        efficiency = waits / 10;
      }
      var danger = this.ai.defense.getTileDanger(this.ai.game.hand[i]);

      var sakigiri = this.ai.defense.getSakigiriValue(
        newHand,
        this.ai.game.hand[i]
      );

      var priority = this.calculateTilePriority(
        efficiency,
        expectedScore,
        danger - sakigiri
      );
      tiles.push({
        tile: this.ai.game.hand[i],
        priority: priority,
        riichiPriority: priority,
        shanten: baseShanten,
        efficiency: efficiency,
        score: expectedScore,
        dora: doraValue,
        yaku: yaku,
        waits: waits,
        shape: shape,
        danger: danger,
        fu: 25,
      });
    }

    return tiles;
  }

  //Get Thirteen Orphans Priorities -> Look for Honors/1/9
  //Returns Array of tiles with priorities (value, danger etc.)
  thirteenOrphansPriorities() {
    var originalOwnTerminalHonors = this.ai.utils.getAllTerminalHonorFromHand(
      this.ai.game.hand
    );
    // Filter out all duplicate terminal/honors
    var originalUniqueTerminalHonors: Tile[] = [];
    originalOwnTerminalHonors.forEach((tile) => {
      if (
        !originalUniqueTerminalHonors.some((otherTile) =>
          tile.equals(otherTile)
        )
      ) {
        originalUniqueTerminalHonors.push(tile);
      }
    });
    var originalShanten = 13 - originalUniqueTerminalHonors.length;
    if (
      originalOwnTerminalHonors.length > originalUniqueTerminalHonors.length
    ) {
      //At least one terminal/honor twice
      originalShanten -= 1;
    }

    var tiles = [];
    for (var i = 0; i < this.ai.game.hand.length; i++) {
      //Simulate discard of every tile

      var hand = [...this.ai.game.hand];
      hand.splice(i, 1);

      var ownTerminalHonors = this.ai.utils.getAllTerminalHonorFromHand(hand);
      // Filter out all duplicate terminal/honors
      var uniqueTerminalHonors: Tile[] = [];
      ownTerminalHonors.forEach((tile) => {
        if (!uniqueTerminalHonors.some((otherTile) => tile.equals(otherTile))) {
          uniqueTerminalHonors.push(tile);
        }
      });
      var shanten = 13 - uniqueTerminalHonors.length;
      if (ownTerminalHonors.length > uniqueTerminalHonors.length) {
        //At least one terminal/honor twice
        shanten -= 1;
      }
      var doraValue = this.ai.utils.getNumberOfDoras(hand);
      var yaku = { open: 13, closed: 13 };
      var waits = 0;
      if (shanten == 0) {
        var missingTile =
          this.getMissingTilesForThirteenOrphans(uniqueTerminalHonors)[0];
        waits = this.ai.utils.getNumberOfNonFuritenTilesAvailable(
          missingTile.index,
          missingTile.type
        );
      }

      var efficiency = shanten == originalShanten ? 1 : 0;
      var danger = this.ai.defense.getTileDanger(this.ai.game.hand[i]);
      var sakigiri = this.ai.defense.getSakigiriValue(
        hand,
        this.ai.game.hand[i]
      );
      var yakuman = this.ai.utils.calculateScore(0, 13);
      var expectedScore = { open: 0, closed: yakuman, riichi: yakuman };
      var priority = this.calculateTilePriority(
        efficiency,
        expectedScore,
        danger - sakigiri
      );

      tiles.push({
        tile: this.ai.game.hand[i],
        priority: priority,
        riichiPriority: priority,
        shanten: shanten,
        efficiency: efficiency,
        score: expectedScore,
        dora: doraValue,
        yaku: yaku,
        waits: waits,
        shape: 0,
        danger: danger,
        fu: 30,
      });
    }

    return tiles;
  }

  // Used during the match to see if its still viable to go for thirteen orphans.
  canDoThirteenOrphans() {
    // PARAMETERS
    var max_missing_orphans_count = 2; // If an orphan has been discarded more than this time (and is not in hand), we don't go for thirteen orphan.
    // Ie. 'Red Dragon' is not in hand, but been discarded 3-times on field. We stop going for thirteen orphan.

    if (!this.ai.isClosed) {
      //Already called some tiles? Can't do thirteen orphans
      return false;
    }

    var ownTerminalHonors = this.ai.utils.getAllTerminalHonorFromHand(
      this.ai.game.hand
    );

    // Filter out all duplicate terminal/honors
    var uniqueTerminalHonors: Tile[] = [];
    ownTerminalHonors.forEach((tile) => {
      if (!uniqueTerminalHonors.some((otherTile) => tile.equals(otherTile))) {
        uniqueTerminalHonors.push(tile);
      }
    });

    // Fails if we do not have enough unique orphans.
    if (uniqueTerminalHonors.length < this.ai.THIRTEEN_ORPHANS) {
      return false;
    }

    // Get list of missing orphans.
    var missingOrphans =
      this.getMissingTilesForThirteenOrphans(uniqueTerminalHonors);

    if (missingOrphans.length == 1) {
      max_missing_orphans_count = 3;
    }

    // Check if there are enough required orphans in the pool.
    for (let uniqueOrphan of missingOrphans) {
      if (
        4 -
          this.ai.utils.getNumberOfNonFuritenTilesAvailable(
            uniqueOrphan.index,
            uniqueOrphan.type
          ) >
        max_missing_orphans_count
      ) {
        return false;
      }
    }

    return true;
  }

  //Return a list of missing tiles for thirteen orphans
  getMissingTilesForThirteenOrphans(uniqueTerminalHonors: Tile[]) {
    var thirteen_orphans_set = '19m19p19s1234567z';
    var thirteenOrphansTiles =
      this.ai.logger.getTilesFromString(thirteen_orphans_set);
    return thirteenOrphansTiles.filter(
      (tile) =>
        !uniqueTerminalHonors.some((otherTile) => tile.equals(otherTile))
    );
  }

  //Discards the "best" tile
  async discard(operation: lq.IOptionalOperation) {
    var tiles = await this.getTilePriorities(this.ai.game.hand);
    tiles = this.sortOutUnsafeTiles(tiles);

    if (this.ai.KEEP_SAFETILE) {
      tiles = this.keepSafetile(tiles);
    }

    if (
      this.ai.strategy == Strategy.Fold ||
      tiles.filter((t) => t.safe).length == 0
    ) {
      return this.discardFold(tiles);
    }

    this.ai.logger.log('Tile Priorities: ');
    this.ai.logger.printTilePriority(tiles);

    var tile = this.getDiscardTile(tiles);

    var riichi = false;
    if (operation.type === Operation.Riichi) {
      tiles.sort((p1, p2) => {
        return p2.riichiPriority - p1.riichiPriority;
      });
      riichi = this.evalRiichi(operation, tiles);
    }
    if (!riichi) {
      this.discardTile(tile);
    }

    return tile;
  }

  //Check all tiles for enough safety
  sortOutUnsafeTiles(
    tiles: Awaited<ReturnType<typeof this.getTilePriorities>>
  ) {
    for (let tile of tiles) {
      if (tile == tiles[0]) {
        var highestPrio = true;
      } else {
        var highestPrio = false;
      }
      if (this.ai.utils.shouldFold(tile, highestPrio)) {
        tile.safe = false;
      } else {
        tile.safe = true;
      }
    }
    tiles = tiles.sort(function (p1, p2) {
      return Number(p2.safe) - Number(p1.safe);
    });
    return tiles;
  }

  //If there is only 1 safetile in hand, don't discard it.
  keepSafetile(tiles: TilePriority[]) {
    if (
      this.ai.defense.getCurrentDangerLevel() > 2000 ||
      tiles[0].shanten <= 1
    ) {
      //Don't keep a safetile when it's too dangerous or hand is close to tenpai
      return tiles;
    }
    var safeTiles = 0;
    for (let t of tiles) {
      if (
        this.ai.defense.isSafeTile(1, t.tile) &&
        this.ai.defense.isSafeTile(2, t.tile) &&
        (this.ai.utils.getNumberOfPlayers() == 3 ||
          this.ai.defense.isSafeTile(3, t.tile))
      ) {
        safeTiles++;
      }
    }
    if (safeTiles > 1) {
      return tiles;
    }

    if (this.ai.utils.getNumberOfPlayers() == 3) {
      var tilesSafety = tiles.map(
        (t) =>
          this.ai.defense.getWaitScoreForTileAndPlayer(1, t.tile, false) +
          this.ai.defense.getWaitScoreForTileAndPlayer(2, t.tile, false)
      );
    } else {
      var tilesSafety = tiles.map(
        (t) =>
          this.ai.defense.getWaitScoreForTileAndPlayer(1, t.tile, false) +
          this.ai.defense.getWaitScoreForTileAndPlayer(2, t.tile, false) +
          this.ai.defense.getWaitScoreForTileAndPlayer(3, t.tile, false)
      );
    }

    var safetileIndex = tilesSafety.indexOf(Math.min(...tilesSafety));

    tiles.push(tiles.splice(safetileIndex, 1)[0]);

    return tiles;
  }

  //Input: Tile Priority List
  //Output: Best Tile to discard. Usually the first tile in the list, but for open hands a valid yaku is taken into account
  getDiscardTile(tiles: TilePriority[]) {
    var tile = tiles[0].tile;

    if (
      tiles[0].valid &&
      (tiles[0].yaku.open >= 1 ||
        this.ai.isClosed ||
        this.ai.game.tilesLeft <= 4)
    ) {
      return tile;
    }

    var highestYaku = -1;
    for (let t of tiles) {
      var foldThreshold = this.ai.utils.getFoldThreshold(t, this.ai.game.hand);
      if (
        t.valid &&
        t.yaku.open > highestYaku + 0.01 &&
        t.yaku.open / 3.5 > highestYaku &&
        t.danger <= foldThreshold
      ) {
        tile = t.tile;
        highestYaku = t.yaku.open;
        if (t.yaku.open >= 1) {
          break;
        }
      }
    }
    if (
      this.ai.logger.getTileName(tile) !=
      this.ai.logger.getTileName(tiles[0].tile)
    ) {
      this.ai.logger.log('Hand is open, trying to keep at least 1 Yaku.');
    }
    return tile;
  }
}
