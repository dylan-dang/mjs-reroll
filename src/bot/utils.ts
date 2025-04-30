//################################
// UTILS
// Contains utility functions
//################################

import { Operation } from '../game';
import type { lq } from '../liqi';
import type { TilePriority } from './ai_offense';
import { Strategy, type AlphaJong } from './bot';
import { Tile, type ITile } from './tile';

export var tileEmojiList = [
  ['red🀝', '🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡'],
  ['red🀋', '🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏'],
  ['red🀔', '🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘'],
  ['', '🀀', '🀁', '🀂', '🀃', '🀆', '🀅', '🀄'],
];

type Mentsu = { tile1: Tile; tile2: Tile; tile3: Tile };
type Pair = { tile1: Tile; tile2: Tile };

export class Utilities {
  constructor(private ai: AlphaJong) {}

  /**
   * @returns number of players in game (3 or 4)
   */
  getNumberOfPlayers() {
    return this.ai.game.players.length;
  }

  //Return number of doras in tiles
  getNumberOfDoras(tiles: Tile[]) {
    var dr = 0;
    for (let tile of tiles) {
      dr += tile.doraValue!;
    }
    return dr;
  }

  //Pairs in tiles
  getPairs(tiles: Tile[]) {
    var sortedTiles = this.sortTiles(tiles);

    var pairs: Pair[] = [];
    var oldIndex = 0;
    var oldType = 0;
    sortedTiles.forEach((tile) => {
      if (oldIndex != tile.index || oldType != tile.type) {
        var ts = this.getTilesInTileArray(sortedTiles, tile.index, tile.type);
        if (ts.length >= 2) {
          pairs.push({ tile1: ts[0], tile2: ts[1] }); //Grabs highest dora tiles first
        }
        oldIndex = tile.index;
        oldType = tile.type;
      }
    });
    return pairs;
  }

  //Pairs in tiles as array
  getPairsAsArray(tiles: Tile[]) {
    var pairs = this.getPairs(tiles);
    var pairList: Tile[] = [];
    pairs.forEach(function (pair) {
      pairList.push(pair.tile1);
      pairList.push(pair.tile2);
    });
    return pairList;
  }

  //Return doubles in tiles
  getDoubles(tiles: Tile[]) {
    tiles = this.sortTiles(tiles);
    var doubles = [];
    for (let i = 0; i < tiles.length - 1; i++) {
      if (
        tiles[i].type == tiles[i + 1].type &&
        (tiles[i].index == tiles[i + 1].index ||
          (tiles[i].type != 3 && tiles[i].index + 2 >= tiles[i + 1].index))
      ) {
        doubles.push(tiles[i]);
        doubles.push(tiles[i + 1]);
        i++;
      }
    }
    return doubles;
  }

  //Return all triplets/3-sequences and pairs as a tile array
  getTriplesAndPairs(tiles: Tile[]) {
    var sequences = this.getSequences(tiles);
    var triplets = this.getTriplets(tiles);
    var pairs = this.getPairs(tiles);
    return this.getBestCombinationOfTiles(
      tiles,
      [...sequences, ...triplets, ...pairs],
      { triples: [], pairs: [], shanten: 8 }
    );
  }

  //Return all triplets/3-tile-sequences as a tile array
  getTriples(tiles: Tile[]) {
    var sequences = this.getSequences(tiles);
    var triplets = this.getTriplets(tiles);
    return this.getBestCombinationOfTiles(tiles, sequences.concat(triplets), {
      triples: [],
      pairs: [],
      shanten: 8,
    }).triples;
  }

  //Return all triplets in tile array
  getTriplets(tiles: Tile[]) {
    var sortedTiles = this.sortTiles(tiles);

    var triples: Mentsu[] = [];
    var oldIndex = 0;
    var oldType = 0;
    sortedTiles.forEach((tile) => {
      if (oldIndex != tile.index || oldType != tile.type) {
        var ts = this.getTilesInTileArray(sortedTiles, tile.index, tile.type);
        if (ts.length >= 3) {
          triples.push({ tile1: ts[0], tile2: ts[1], tile3: ts[2] }); //Grabs highest dora tiles first because of sorting
        }
        oldIndex = tile.index;
        oldType = tile.type;
      }
    });
    return triples;
  }

  //Triplets in tiles as array
  getTripletsAsArray(tiles: Tile[]) {
    var triplets = this.getTriplets(tiles);
    var tripletsList: Tile[] = [];
    triplets.forEach((triplet) => {
      tripletsList.push(triplet.tile1);
      tripletsList.push(triplet.tile2);
      tripletsList.push(triplet.tile3);
    });
    return tripletsList;
  }

  //Returns the best combination of sequences.
  //Small Bug: Can return red dora tiles multiple times, but doesn't matter for the current use cases
  getBestSequenceCombination(inputHand: Tile[]) {
    return this.getBestCombinationOfTiles(
      inputHand,
      this.getSequences(inputHand),
      { triples: [], pairs: [], shanten: 8 }
    ).triples;
  }

  //Check if there is already a red dora tile in the tiles array.
  //More or less a workaround for a problem with the getBestCombinationOfTiles function...
  pushTileAndCheckDora(tiles: Tile[], arrayToPush: Tile[], tile: Tile) {
    if (tile.dora && tiles.some((t) => t.type == tile.type && t.dora)) {
      var nonDoraTile = tile.clone();
      nonDoraTile.dora = false;
      nonDoraTile.doraValue = this.getTileDoraValue(nonDoraTile);
      arrayToPush.push(nonDoraTile);
      return nonDoraTile;
    }
    arrayToPush.push(tile);
    return tile;
  }

  //Return the best combination of 3-tile Sequences, Triplets and pairs in array of tiles
  //Recursive Function, weird code that can probably be optimized
  getBestCombinationOfTiles(
    inputTiles: Tile[],
    possibleCombinations: (Mentsu | Pair)[],
    chosenCombinations: { triples: Tile[]; pairs: Tile[]; shanten: number }
  ) {
    var originalC = {
      triples: [...chosenCombinations.triples],
      pairs: [...chosenCombinations.pairs],
      shanten: chosenCombinations.shanten,
    };
    for (var i = 0; i < possibleCombinations.length; i++) {
      var cs = {
        triples: [...originalC.triples],
        pairs: [...originalC.pairs],
        shanten: originalC.shanten,
      };
      var tiles = possibleCombinations[i];
      var hand = [...inputTiles];
      if (!('tile3' in tiles)) {
        // Pairs
        if (
          tiles.tile1.index == tiles.tile2.index &&
          this.getNumberOfTilesInTileArray(
            hand,
            tiles.tile1.index,
            tiles.tile1.type
          ) < 2
        ) {
          continue;
        }
      } else if (
        this.getNumberOfTilesInTileArray(
          hand,
          tiles.tile1.index,
          tiles.tile1.type
        ) == 0 ||
        this.getNumberOfTilesInTileArray(
          hand,
          tiles.tile2.index,
          tiles.tile2.type
        ) == 0 ||
        this.getNumberOfTilesInTileArray(
          hand,
          tiles.tile3.index,
          tiles.tile3.type
        ) == 0 ||
        (tiles.tile1.index == tiles.tile2.index &&
          this.getNumberOfTilesInTileArray(
            hand,
            tiles.tile1.index,
            tiles.tile1.type
          ) < 3)
      ) {
        continue;
      }
      if ('tile3' in tiles) {
        var tt = this.pushTileAndCheckDora(
          cs.pairs.concat(cs.triples),
          cs.triples,
          tiles.tile1
        );
        hand = this.removeTilesFromTileArray(hand, [tt]);
        tt = this.pushTileAndCheckDora(
          cs.pairs.concat(cs.triples),
          cs.triples,
          tiles.tile2
        );
        hand = this.removeTilesFromTileArray(hand, [tt]);
        tt = this.pushTileAndCheckDora(
          cs.pairs.concat(cs.triples),
          cs.triples,
          tiles.tile3
        );
        hand = this.removeTilesFromTileArray(hand, [tt]);
      } else {
        var tt = this.pushTileAndCheckDora(
          cs.pairs.concat(cs.triples),
          cs.pairs,
          tiles.tile1
        );
        hand = this.removeTilesFromTileArray(hand, [tt]);
        tt = this.pushTileAndCheckDora(
          cs.pairs.concat(cs.triples),
          cs.pairs,
          tiles.tile2
        );
        hand = this.removeTilesFromTileArray(hand, [tt]);
      }

      if (this.ai.PERFORMANCE_MODE - this.ai.timeSave <= 3) {
        var anotherChoice = this.getBestCombinationOfTiles(
          hand,
          possibleCombinations.slice(i + 1),
          cs
        );
        if (
          anotherChoice.triples.length > chosenCombinations.triples.length ||
          (anotherChoice.triples.length == chosenCombinations.triples.length &&
            anotherChoice.pairs.length > chosenCombinations.pairs.length) ||
          (anotherChoice.triples.length == chosenCombinations.triples.length &&
            anotherChoice.pairs.length == chosenCombinations.pairs.length &&
            this.getNumberOfDoras(
              anotherChoice.triples.concat(anotherChoice.pairs)
            ) >
              this.getNumberOfDoras(
                chosenCombinations.triples.concat(chosenCombinations.pairs)
              ))
        ) {
          chosenCombinations = anotherChoice;
        }
      } else {
        if (cs.triples.length >= chosenCombinations.triples.length) {
          var doubles = this.getDoubles(hand); //This is costly, so only do it when performance mode is at maximum
          cs.shanten = this.calculateShanten(
            Math.floor(cs.triples.length / 3),
            Math.floor(cs.pairs.length / 2),
            Math.floor(doubles.length / 2)
          );
        } else {
          cs.shanten = 8;
        }

        var anotherChoice = this.getBestCombinationOfTiles(
          hand,
          possibleCombinations.slice(i + 1),
          cs
        );
        if (
          anotherChoice.shanten < chosenCombinations.shanten ||
          (anotherChoice.shanten == chosenCombinations.shanten &&
            (anotherChoice.triples.length > chosenCombinations.triples.length ||
              (anotherChoice.triples.length ==
                chosenCombinations.triples.length &&
                anotherChoice.pairs.length > chosenCombinations.pairs.length) ||
              (anotherChoice.triples.length ==
                chosenCombinations.triples.length &&
                anotherChoice.pairs.length == chosenCombinations.pairs.length &&
                this.getNumberOfDoras(
                  anotherChoice.triples.concat(anotherChoice.pairs)
                ) >
                  this.getNumberOfDoras(
                    chosenCombinations.triples.concat(chosenCombinations.pairs)
                  ))))
        ) {
          chosenCombinations = anotherChoice;
        }
      }
    }

    return chosenCombinations;
  }

  //Return all 3-tile Sequences in tile array
  getSequences(tiles: Tile[]) {
    var sortedTiles = this.sortTiles(tiles);
    var sequences: Mentsu[] = [];
    for (var index = 0; index <= 7; index++) {
      for (var type = 0; type <= 2; type++) {
        var tiles1 = this.getTilesInTileArray(sortedTiles, index, type);
        var tiles2 = this.getTilesInTileArray(sortedTiles, index + 1, type);
        var tiles3 = this.getTilesInTileArray(sortedTiles, index + 2, type);

        var i = 0;
        while (tiles1.length > i && tiles2.length > i && tiles3.length > i) {
          sequences.push({
            tile1: tiles1[i],
            tile2: tiles2[i],
            tile3: tiles3[i],
          });
          i++;
        }
      }
    }
    return sequences;
  }

  //Return tile array without given tiles
  removeTilesFromTileArray(inputTiles: Tile[], tiles: Tile[]) {
    var tileArray = [...inputTiles];

    for (let tile of tiles) {
      for (var j = 0; j < tileArray.length; j++) {
        if (tile.equals(tileArray[j])) {
          tileArray.splice(j, 1);
          break;
        }
      }
    }

    return tileArray;
  }

  //Sort tiles
  sortTiles(inputTiles: Tile[]) {
    var tiles = [...inputTiles];
    tiles = tiles.sort(function (p1, p2) {
      //Sort dora value descending
      return p2.doraValue! - p1.doraValue!;
    });
    tiles = tiles.sort(function (p1, p2) {
      //Sort index ascending
      return p1.index - p2.index;
    });
    tiles = tiles.sort(function (p1, p2) {
      //Sort type ascending
      return p1.type - p2.type;
    });
    return tiles;
  }

  //Return number of specific tiles available
  getNumberOfTilesAvailable(index: Tile['index'], type: Tile['type']) {
    if (
      index < 1 ||
      index > 9 ||
      type < 0 ||
      type > 3 ||
      (type == 3 && index > 7)
    ) {
      return 0;
    }
    if (this.getNumberOfPlayers() == 3 && index > 1 && index < 9 && type == 1) {
      return 0;
    }

    return (
      4 -
      this.ai.visibleTiles.filter(
        (tile) => tile.index == index && tile.type == type
      ).length
    );
  }

  //Return if a tile is furiten
  isTileFuriten(index: Tile['index'], type: Tile['type']) {
    for (var i = 1; i < this.getNumberOfPlayers(); i++) {
      //Check if melds from other player contain discarded tiles of player 0
      if (
        this.ai.calls[i].some(
          (tile) =>
            tile.index == index &&
            tile.type == type &&
            tile.from == this.ai.api.localPosition2Seat(0)
        )
      ) {
        return true;
      }
    }
    return this.ai.game.players[0].pond.some(
      (tile) => tile.index == index && tile.type == type
    );
  }

  //Return number of specific non furiten tiles available
  getNumberOfNonFuritenTilesAvailable(
    index: Tile['index'],
    type: Tile['type']
  ) {
    if (this.isTileFuriten(index, type)) {
      return 0;
    }
    return this.getNumberOfTilesAvailable(index, type);
  }

  //Return number of specific tile in tile array
  getNumberOfTilesInTileArray(
    tileArray: Tile[],
    index: Tile['index'],
    type: Tile['type']
  ) {
    return this.getTilesInTileArray(tileArray, index, type).length;
  }

  //Return specific tiles in tile array
  getTilesInTileArray(
    tileArray: Tile[],
    index: Tile['index'],
    type: Tile['type']
  ) {
    return tileArray.filter((tile) => tile.index == index && tile.type == type);
  }

  //Update the available tile pool
  updateAvailableTiles() {
    this.ai.visibleTiles = this.ai.game.doraIndicators!.concat(
      this.ai.game.hand,
      this.ai.game.players[0].pond,
      this.ai.game.players[1].pond,
      this.ai.game.players[2].pond,
      this.ai.game.players[3].pond,
      this.ai.calls[0],
      this.ai.calls[1],
      this.ai.calls[2],
      this.ai.calls[3]
    );
    this.ai.visibleTiles = this.ai.visibleTiles.filter(
      (tile) => typeof tile != 'undefined'
    );
    this.ai.availableTiles = [];
    for (var i = 0; i <= 3; i++) {
      for (var j = 1; j <= 9; j++) {
        if (i == 3 && j == 8) {
          break;
        }
        for (var k = 1; k <= this.getNumberOfTilesAvailable(j, i); k++) {
          var isRed =
            j == 5 &&
            i != 3 &&
            this.ai.visibleTiles
              .concat(this.ai.availableTiles)
              .filter((tile) => tile.type == i && tile.dora).length == 0
              ? true
              : false;
          this.ai.availableTiles.push(
            new Tile({
              index: j,
              type: i,
              dora: isRed,
              doraValue: this.getTileDoraValue({
                index: j,
                type: i,
                dora: isRed,
              }),
            })
          );
        }
      }
    }
    for (let vis of this.ai.visibleTiles) {
      vis.doraValue = this.getTileDoraValue(vis);
    }
  }

  //Return sum of red dora/dora indicators for tile
  getTileDoraValue(tile: ITile) {
    var dr = 0;

    if (this.getNumberOfPlayers() == 3) {
      if (tile.type == 3 && tile.index == 4) {
        //North Tiles
        dr = 1;
      }
    }

    for (let indicator of this.ai.game.doraIndicators!) {
      if (indicator.after(this.getNumberOfPlayers() === 3).equals(tile)) {
        dr++;
      }
    }

    if (tile.dora) {
      return dr + 1;
    }
    return dr;
  }

  //Returns true if DEBUG flag is set
  isDebug() {
    // return typeof DEBUG != 'undefined';
    return false;
  }

  //Adds calls of player 0 to the hand
  getHandWithCalls(inputHand: Tile[]) {
    return inputHand.concat(this.ai.calls[0]);
  }

  //Adds a tile if not in array
  pushTileIfNotExists(tiles: Tile[], index: Tile['index'], type: Tile['type']) {
    if (tiles.findIndex((t) => t.index == index && t.type == type) === -1) {
      var tile: Tile = new Tile({ index, type, dora: false });
      tile.doraValue = this.getTileDoraValue(tile);
      tiles.push(tile);
    }
  }

  getUradoraChance() {
    if (this.getNumberOfPlayers() == 4) {
      return this.ai.game.doraIndicators!.length * 0.4;
    } else {
      return this.ai.game.doraIndicators!.length * 0.5;
    }
  }

  //Returns tiles that can form a triple in one turn for a given tile array
  getUsefulTilesForTriple(tileArray: Tile[]) {
    var tiles: Tile[] = [];
    for (let tile of tileArray) {
      var amount = this.getNumberOfTilesInTileArray(
        tileArray,
        tile.index,
        tile.type
      );
      if (tile.type == 3 && amount >= 2) {
        this.pushTileIfNotExists(tiles, tile.index, tile.type);
        continue;
      }

      if (amount >= 2) {
        this.pushTileIfNotExists(tiles, tile.index, tile.type);
      }

      var amountLower = this.getNumberOfTilesInTileArray(
        tileArray,
        tile.index - 1,
        tile.type
      );
      var amountLower2 = this.getNumberOfTilesInTileArray(
        tileArray,
        tile.index - 2,
        tile.type
      );
      var amountUpper = this.getNumberOfTilesInTileArray(
        tileArray,
        tile.index + 1,
        tile.type
      );
      var amountUpper2 = this.getNumberOfTilesInTileArray(
        tileArray,
        tile.index + 2,
        tile.type
      );
      if (
        tile.index > 1 &&
        amount == amountLower + 1 &&
        (amountUpper > 0 || amountLower2 > 0)
      ) {
        //No need to check if index in bounds
        this.pushTileIfNotExists(tiles, tile.index - 1, tile.type);
      }

      if (
        tile.index < 9 &&
        amount == amountUpper + 1 &&
        (amountLower > 0 || amountUpper2 > 0)
      ) {
        this.pushTileIfNotExists(tiles, tile.index + 1, tile.type);
      }
    }
    return tiles;
  }

  //Returns tiles that can form at least a double in one turn for a given tile array
  getUsefulTilesForDouble(tileArray: Tile[]) {
    var tiles: Tile[] = [];
    for (let tile of tileArray) {
      this.pushTileIfNotExists(tiles, tile.index, tile.type);
      if (tile.type == 3) {
        continue;
      }

      if (tile.index - 1 >= 1) {
        this.pushTileIfNotExists(tiles, tile.index - 1, tile.type);
      }
      if (tile.index + 1 <= 9) {
        this.pushTileIfNotExists(tiles, tile.index + 1, tile.type);
      }

      if (this.ai.PERFORMANCE_MODE - this.ai.timeSave <= 2) {
        continue;
      }
      if (tile.index - 2 >= 1) {
        this.pushTileIfNotExists(tiles, tile.index - 2, tile.type);
      }
      if (tile.index + 2 <= 9) {
        this.pushTileIfNotExists(tiles, tile.index + 2, tile.type);
      }
    }
    return tiles;
  }

  // Returns Tile[], where all are terminal/honors.
  getAllTerminalHonorFromHand(hand: Tile[]) {
    return hand.filter((tile) => this.isTerminalOrHonor(tile));
  }

  //Honor tile or index 1/9
  isTerminalOrHonor(tile: Tile) {
    // Honor tiles
    if (tile.type == 3) {
      return true;
    }

    // 1 or 9.
    if (tile.index == 1 || tile.index == 9) {
      return true;
    }

    return false;
  }

  // Returns a number how "good" the wait is. An average wait is 1, a bad wait (like a middle tile) is lower, a good wait (like an honor tile) is higher.
  getWaitQuality(tile: Tile) {
    var quality =
      1.3 - this.ai.defense.getDealInChanceForTileAndPlayer(0, tile, 1) * 5;
    quality = quality < 0.7 ? 0.7 : quality;
    return quality;
  }

  //Calculate the shanten number. Based on this: https://www.youtube.com/watch?v=69Xhu-OzwHM
  //Fast and accurate, but original hand needs to have 14 or more tiles.
  calculateShanten(triples: number, pairs: number, doubles: number) {
    if (this.isWinningHand(triples, pairs)) {
      return -1;
    }
    if (triples * 3 + pairs * 2 + doubles * 2 > 14) {
      doubles = Math.floor((13 - (triples * 3 + pairs * 2)) / 2);
    }
    var shanten = 8 - 2 * triples - (pairs + doubles);
    if (triples + pairs + doubles >= 5 && pairs == 0) {
      shanten++;
    }
    if (triples + pairs + doubles >= 6) {
      shanten += triples + pairs + doubles - 5;
    }
    if (shanten < 0) {
      return 0;
    }
    return shanten;
  }

  // Calculate Score for given han and fu. For higher han values the score is "fluid" to better account for situations where the exact han value is unknown
  // (like when an opponent has around 5.5 han => 10k)
  calculateScore(player: number, han: number, fu = 30) {
    var score = fu * Math.pow(2, 2 + han) * 4;

    if (han > 4) {
      score = 8000;
    }

    if (han > 5) {
      score = 8000 + (han - 5) * 4000;
    }
    if (han > 6) {
      score = 12000 + (han - 6) * 2000;
    }
    if (han > 8) {
      score = 16000 + (han - 8) * 2666;
    }
    if (han > 11) {
      score = 24000 + (han - 11) * 4000;
    }
    if (han >= 13) {
      score = 32000;
    }

    if (this.ai.api.getSeatWind(player) == 1) {
      //Is Dealer
      score *= 1.5;
    }

    if (this.getNumberOfPlayers() == 3) {
      score *= 0.75;
    }

    return score;
  }

  //Calculate the Fu Value for given parameters. Not 100% accurate, but good enough
  calculateFu(
    triples: Tile[],
    openTiles: Tile[],
    pair: Tile[],
    waitTiles: Tile[],
    winningTile: Tile,
    ron = true
  ) {
    var fu = 20;

    var sequences = this.getSequences(triples);
    var closedTriplets = this.getTriplets(triples);
    var openTriplets = this.getTriplets(openTiles);

    var kans = this.removeTilesFromTileArray(
      openTiles,
      this.getTriples(openTiles)
    );

    closedTriplets.forEach((t) => {
      if (this.isTerminalOrHonor(t.tile1)) {
        if (!t.tile1.equals(winningTile)) {
          fu += 8;
        } else {
          //Ron on that tile: counts as open
          fu += 4;
        }
      } else {
        if (!t.tile1.equals(winningTile)) {
          fu += 4;
        } else {
          //Ron on that tile: counts as open
          fu += 2;
        }
      }
    });

    openTriplets.forEach((t) => {
      if (this.isTerminalOrHonor(t.tile1)) {
        fu += 4;
      } else {
        fu += 2;
      }
    });

    //Kans: Add to existing fu of pon
    kans.forEach((tile) => {
      if (
        openTiles.filter(
          (t) => t.equals(tile) && t.from != this.ai.api.localPosition2Seat(0)
        ).length > 0
      ) {
        //Is open
        if (this.isTerminalOrHonor(tile)) {
          fu += 12;
        } else {
          fu += 6;
        }
      } else {
        //Closed Kans
        if (this.isTerminalOrHonor(tile)) {
          fu += 28;
        } else {
          fu += 14;
        }
      }
    });

    if (typeof pair[0] != 'undefined' && this.isValueTile(pair[0])) {
      fu += 2;
      if (
        pair[0].index == this.ai.seatWind &&
        this.ai.seatWind == this.ai.roundWind
      ) {
        fu += 2;
      }
    }

    if (
      fu == 20 &&
      sequences.findIndex((t) => {
        //Is there a way to interpret the wait as ryanmen when at 20 fu? -> dont add fu
        return (
          (t.tile1.equals(winningTile) && t.tile3.index < 9) ||
          (t.tile3.equals(winningTile) && t.tile1.index > 1)
        );
      }) >= 0
    ) {
      fu += 0;
    } //if we are at more than 20 fu: check if the wait can be interpreted in other ways to add more fu
    else if (
      waitTiles.length != 2 ||
      waitTiles[0].type != waitTiles[1].type ||
      Math.abs(waitTiles[0].index - waitTiles[1].index) != 1
    ) {
      if (
        closedTriplets.findIndex((t) => {
          return t.tile1.equals(winningTile);
        }) < 0
      ) {
        // 0 fu for shanpon
        fu += 2;
      }
    }

    if (ron && this.ai.isClosed) {
      fu += 10;
    }

    return Math.ceil(fu / 10) * 10;
  }

  //Is the tile a dragon or valuable wind?
  isValueTile(tile: Tile) {
    return (
      tile.type == 3 &&
      (tile.index > 4 ||
        tile.index == this.ai.seatWind ||
        tile.index == this.ai.roundWind)
    );
  }

  //Return a danger value which is the threshold for folding (danger higher than this value -> fold)
  getFoldThreshold(tilePrio: TilePriority, hand: Tile[]) {
    var handScore = tilePrio.score.open * 1.3; // Raise this value a bit so open hands dont get folded too quickly
    if (this.ai.isClosed) {
      handScore = tilePrio.score.riichi;
    }

    var waits = tilePrio.waits;
    var shape = tilePrio.shape;

    // Formulas are based on this table: https://docs.google.com/spreadsheets/d/172LFySNLUtboZUiDguf8I3QpmFT-TApUfjOs5iRy3os/edit#gid=212618921
    // TODO: Maybe switch to this: https://riichi-mahjong.com/2020/01/28/mahjong-strategy-push-or-fold-4-maximizing-game-ev/
    if (tilePrio.shanten == 0) {
      var foldValue = ((waits + shape) * handScore) / 38;
      if (this.ai.game.tilesLeft < 8) {
        //Try to avoid no ten penalty
        foldValue += 200 - Math.floor(this.ai.game.tilesLeft / 4) * 100;
      }
    } else if (tilePrio.shanten == 1 && this.ai.strategy == Strategy.General) {
      shape = shape < 0.4 ? (shape = 0.4) : shape;
      shape = shape > 2 ? (shape = 2) : shape;
      var foldValue = (shape * handScore) / 45;
    } else {
      if (
        this.ai.defense.getCurrentDangerLevel() > 3000 &&
        this.ai.strategy == Strategy.General
      ) {
        return 0;
      }
      var foldValue =
        ((6 - (tilePrio.shanten - tilePrio.efficiency)) * 2000 + handScore) /
        500;
    }

    if (this.isLastGame()) {
      //Fold earlier when first/later when last in last game
      if (this.getDistanceToLast() > 0) {
        foldValue *= 1.3; //Last Place -> Later Fold
      } else if (this.getDistanceToFirst() < 0) {
        var dist =
          this.getDistanceToFirst() / 30000 > -0.5
            ? this.getDistanceToFirst() / 30000
            : -0.5;
        foldValue *= 1 + dist; //First Place -> Easier Fold
      }
    }

    foldValue *=
      1 -
      (this.ai.wallSize / 2 - this.ai.game.tilesLeft) / (this.ai.wallSize * 2); // up to 25% more/less fold when early/lategame.

    foldValue *= this.ai.seatWind == 1 ? 1.2 : 1; //Push more as dealer (it's already in the handScore, but because of Tsumo Malus pushing is even better)

    var safeTiles = 0;
    for (let tile of hand) {
      // How many safe tiles do we currently have?
      if (this.ai.defense.getTileDanger(tile) < 20) {
        safeTiles++;
      }
      if (safeTiles == 2) {
        break;
      }
    }
    foldValue *= 1 + (0.5 - safeTiles / 4); // 25% less likely to fold when only 1 safetile, or 50% when 0 safetiles

    foldValue *= 2 - hand.length / 14; // Less likely to fold when fewer tiles in hand (harder to defend)

    foldValue /= this.ai.SAFETY;

    foldValue = foldValue < 0 ? 0 : foldValue;

    return Number(Number(foldValue).toFixed(2));
  }

  //Return true if danger is too high in relation to the value of the hand
  shouldFold(tile: TilePriority, highestPrio = false) {
    if (tile.shanten * 4 > this.ai.game.tilesLeft) {
      if (highestPrio) {
        this.ai.logger.log(
          'Hand is too far from tenpai before end of game. Fold!'
        );
        this.ai.strategy = Strategy.Fold;
        this.ai.strategyAllowsCalls = false;
      }
      return true;
    }

    var foldThreshold = this.getFoldThreshold(tile, this.ai.game.hand);
    if (highestPrio) {
      this.ai.logger.log(
        'Would fold this hand above ' +
          foldThreshold +
          ' danger for ' +
          this.ai.logger.getTileName(tile.tile) +
          ' discard.'
      );
    }

    if (tile.danger > foldThreshold) {
      if (highestPrio) {
        this.ai.logger.log(
          'Tile Danger ' +
            Number(tile.danger).toFixed(2) +
            ' of ' +
            this.ai.logger.getTileName(tile.tile, false) +
            ' is too dangerous.'
        );
        this.ai.strategyAllowsCalls = false; //Don't set the strategy to full fold, but prevent calls
      }
      return true;
    }
    return false;
  }

  //Decide whether to call Riichi
  //Based on: https://mahjong.guide/2018/01/28/mahjong-fundamentals-5-riichi/
  shouldRiichi(tilePrio: TilePriority) {
    var badWait = tilePrio.waits < 5 - this.ai.RIICHI;
    var lotsOfDoraIndicators = tilePrio.dora >= 3;

    //Chiitoitsu
    if (this.ai.strategy == Strategy.Chiitoitsu) {
      if (tilePrio.shape == 0) {
        this.ai.logger.log(
          'Decline Riichi because of chiitoitsu wait that can be improved!'
        );
        return false;
      }
      badWait = tilePrio.waits < 3 - this.ai.RIICHI;
    }

    //Thirteen Orphans
    if (this.ai.strategy == Strategy.ThirteenOrphans) {
      this.ai.logger.log('Decline Riichi because of Thirteen Orphan strategy.');
      return false;
    }

    //Close to end of game
    if (this.ai.game.tilesLeft <= 7 - this.ai.RIICHI) {
      this.ai.logger.log('Decline Riichi because close to end of game.');
      return false;
    }

    //No waits
    if (tilePrio.waits < 1) {
      this.ai.logger.log('Decline Riichi because of no waits.');
      return false;
    }

    // Last Place (in last game) and Riichi is enough to get third
    if (
      this.isLastGame() &&
      this.getDistanceToLast() > 0 &&
      this.getDistanceToLast() < tilePrio.score.riichi
    ) {
      this.ai.logger.log('Accept Riichi because of last place in last game.');
      return true;
    }

    // Decline if last game and first place (either with 10000 points advantage or with a closed yaku)
    if (
      this.isLastGame() &&
      (this.getDistanceToFirst() < -10000 ||
        (tilePrio.yaku.closed >= 1 && this.getDistanceToFirst() < 0))
    ) {
      this.ai.logger.log('Decline Riichi because of huge lead in last game.');
      return false;
    }

    // Not Dealer & bad Wait & Riichi is only yaku
    if (
      this.ai.seatWind != 1 &&
      badWait &&
      tilePrio.score.riichi < 4000 - this.ai.RIICHI * 1000 &&
      !lotsOfDoraIndicators &&
      tilePrio.shape > 0.4
    ) {
      this.ai.logger.log(
        'Decline Riichi because of worthless hand, bad waits and not dealer.'
      );
      return false;
    }

    // High Danger and hand not worth much or bad wait
    if (
      tilePrio.score.riichi <
      (this.ai.defense.getCurrentDangerLevel() - this.ai.RIICHI * 1000) *
        (1 + Number(badWait))
    ) {
      this.ai.logger.log(
        'Decline Riichi because of worthless hand and high danger.'
      );
      return false;
    }

    // Hand already has enough yaku and high value (Around 6000+ depending on the wait)
    if (
      tilePrio.yaku.closed >= 1 &&
      tilePrio.score.closed / (this.ai.seatWind == 1 ? 1.5 : 1) >
        4000 + this.ai.RIICHI * 1000 + tilePrio.waits * 500
    ) {
      this.ai.logger.log(
        'Decline Riichi because of high value hand with enough yaku.'
      );
      return false;
    }

    // Hand already has high value and no yaku
    if (
      tilePrio.yaku.closed < 0.9 &&
      tilePrio.score.riichi > 5000 - this.ai.RIICHI * 1000
    ) {
      this.ai.logger.log(
        'Accept Riichi because of high value hand without yaku.'
      );
      return true;
    }

    // Number of Kans(Dora Indicators) -> more are higher chance for uradora
    if (lotsOfDoraIndicators) {
      this.ai.logger.log('Accept Riichi because of multiple dora indicators.');
      return true;
    }

    // Don't Riichi when: Last round with bad waits & would lose place with -1000
    if (
      this.isLastGame() &&
      badWait &&
      this.getOtherPlayers().some(
        (other) =>
          this.ai.game.self.score >= other.score &&
          this.ai.game.self.score - 1000 <= other.score
      )
    ) {
      this.ai.logger.log(
        'Decline Riichi because distance to next player is < 1000 in last game.'
      );
      return false;
    }

    // Default: Just do it.
    this.ai.logger.log('Accept Riichi by default.');
    return true;
  }

  getOtherPlayers() {
    return this.ai.game.players.filter((player) => !player.isSelf);
  }

  getOtherScores() {
    return this.getOtherPlayers().map((player) => player.score);
  }

  //Negative number: Distance to second
  //Positive number: Distance to first
  getDistanceToFirst() {
    return Math.max(...this.getOtherScores()) - this.ai.game.self.score;
  }

  //Negative number: Distance to last
  //Positive number: Distance to third
  getDistanceToLast() {
    return Math.min(...this.getOtherScores()) - this.ai.game.self.score;
  }

  //Check if "All Last"
  isLastGame() {
    if (this.ai.api.isEastRound()) {
      return (
        this.ai.api.getRound() == this.getNumberOfPlayers() ||
        this.ai.api.getRoundWind() > 1
      ); //East 4(3) or South X
    }
    return (
      (this.ai.api.getRound() == this.getNumberOfPlayers() &&
        this.ai.api.getRoundWind() == 2) ||
      this.ai.api.getRoundWind() > 2
    ); //South 4(3) or West X
  }

  //Check if Hand is complete
  isWinningHand(numberOfTriples: number, numberOfPairs: number) {
    if (this.ai.strategy == Strategy.Chiitoitsu) {
      return numberOfPairs == 7;
    }
    return numberOfTriples == 4 && numberOfPairs == 1;
  }
}
