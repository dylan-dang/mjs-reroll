//################################
// AI DEFENSE
// Defensive part of the AI
//################################

import { type AlphaJong } from './bot';
import { Tile } from './tile';

export class Defense {
  totalPossibleWaits: { turn?: number; totalWaits?: number[] } = {};
  handChanges: number[] = [];
  handChangesAtDiscardedTile: Record<string, number[] | undefined>[] = [];

  constructor(private ai: AlphaJong) {
    ai.game.on('newRound', () => {
      for (let i = 0; i < this.ai.utils.getNumberOfPlayers(); i++) {
        this.handChanges[i] = 0;
        this.handChangesAtDiscardedTile[i] = {};
      }
    });
    ai.game.on('discard', ({ moqie, seat, tile }) => {
      if (!moqie) this.handChanges[seat!]++;
      this.handChangesAtDiscardedTile[seat!][tile!] = [...this.handChanges];
    });
    ai.game.on('call', ({ seat }) => this.handChanges[seat!]++);
    ai.game.on('closedOrAddedKan', ({ seat }) => this.handChanges[seat!]++);
    ai.game.on(
      'kita',
      ({ moqie, seat }) => !moqie && this.handChanges[seat!]++
    );
  }

  //Returns danger of tile for all players (from a specific players perspective, see second param) as a number from 0-100+
  //Takes into account Genbutsu (Furiten for opponents), Suji, Walls and general knowledge about remaining tiles.
  //From the perspective of playerPerspective parameter
  getTileDanger(tile: Tile, playerPerspective = 0) {
    var dangerPerPlayer = [0, 0, 0, 0];
    for (
      var player = 0;
      player < this.ai.utils.getNumberOfPlayers();
      player++
    ) {
      //Foreach Player
      if (player == playerPerspective) continue;

      dangerPerPlayer[player] = this.getDealInChanceForTileAndPlayer(
        player,
        tile,
        playerPerspective
      );

      if (playerPerspective == 0) {
        //Multiply with expected deal in value
        dangerPerPlayer[player] *= this.getExpectedDealInValue(player);
      }
    }

    var danger =
      dangerPerPlayer[0] +
      dangerPerPlayer[1] +
      dangerPerPlayer[2] +
      dangerPerPlayer[3];

    if (this.getCurrentDangerLevel() < 2500) {
      //Scale it down for low danger levels
      danger *= 1 - (2500 - this.getCurrentDangerLevel()) / 2500;
    }

    return danger;
  }

  //Return the Danger value for a specific tile and player
  getTileDangerForPlayer(tile: Tile, player: number, playerPerspective = 0) {
    var danger = 0;
    if (this.tileInDiscard(player, tile)) {
      // Check if tile in discard (Genbutsu)
      return 0;
    }

    danger = this.getWaitScoreForTileAndPlayer(
      player,
      tile,
      true,
      playerPerspective == 0
    ); //Suji, Walls and general knowledge about remaining tiles.

    if (danger <= 0) {
      return 0;
    }

    //Honor tiles are often a preferred wait
    if (tile.type == 3) {
      danger *= 1.3;
    }

    //Is Dora? -> 10% more dangerous
    danger *= 1 + this.ai.utils.getTileDoraValue(tile) / 10;

    //Is close to Dora? -> 5% more dangerous
    if (this.isTileCloseToDora(tile)) {
      danger *= 1.05;
    }

    //Is the player doing a flush of that type? -> More dangerous
    var honitsuChance = this.isDoingHonitsu(player, tile.type);
    var otherHonitsu = Math.max(
      this.isDoingHonitsu(player, 0) ||
        this.isDoingHonitsu(player, 1) ||
        this.isDoingHonitsu(player, 2)
    );
    if (honitsuChance > 0) {
      danger *= 1 + honitsuChance;
    } else if (otherHonitsu > 0) {
      //Is the player going for any other flush?
      if (tile.type == 3) {
        danger *= 1 + otherHonitsu; //Honor tiles are also dangerous
      } else {
        danger *= 1 - otherHonitsu; //Other tiles are less dangerous
      }
    }

    //Is the player doing a tanyao? Inner tiles are more dangerous, outer tiles are less dangerous
    if (tile.type != 3 && tile.index < 9 && tile.index > 1) {
      danger *= 1 + this.isDoingTanyao(player) / 10;
    } else {
      danger /= 1 + this.isDoingTanyao(player) / 10;
    }

    //Does the player have no yaku yet? Yakuhai is likely -> Honor tiles are 10% more dangerous
    if (!this.hasYaku(player)) {
      if (
        tile.type == 3 &&
        (tile.index > 4 ||
          tile.index == this.ai.api.getSeatWind(player) ||
          tile.index == this.ai.api.getRoundWind()) &&
        this.ai.utils.getNumberOfTilesAvailable(tile.type, tile.index) > 2
      ) {
        danger *= 1.1;
      }
    }

    //Is Tile close to the tile discarded on the riichi turn? -> 10% more dangerous
    const riichiTile = this.ai.game.players[player].riichiTile;
    if (riichiTile && this.isTileCloseToOtherTile(tile, riichiTile)) {
      danger *= 1.1;
    }

    //Is Tile close to an early discard (first row)? -> 10% less dangerous
    this.ai.game.players[player].pond.slice(0, 6).forEach((earlyDiscard) => {
      if (this.isTileCloseToOtherTile(tile, earlyDiscard)) {
        danger *= 0.9;
      }
    });

    //Danger is at least 5
    if (danger < 5) {
      danger = 5;
    }

    return danger;
  }

  //Percentage to deal in with a tile
  getDealInChanceForTileAndPlayer(
    player: number,
    tile: Tile,
    playerPerspective = 0
  ) {
    var total = 0;
    if (playerPerspective == 0) {
      if (
        typeof this.totalPossibleWaits.turn == 'undefined' ||
        this.totalPossibleWaits.turn != this.ai.game.tilesLeft
      ) {
        this.totalPossibleWaits = {
          turn: this.ai.game.tilesLeft,
          totalWaits: [0, 0, 0, 0],
        }; // Save it in a global variable to not calculate this expensive step multiple times per turn
        for (let pl = 1; pl < this.ai.utils.getNumberOfPlayers(); pl++) {
          this.totalPossibleWaits.totalWaits![pl] =
            this.getTotalPossibleWaits(pl);
        }
      }
      total = this.totalPossibleWaits.totalWaits![player];
    }
    if (playerPerspective != 0) {
      total = this.getTotalPossibleWaits(player);
    }
    return this.getTileDangerForPlayer(tile, player, playerPerspective) / total; //Then compare the given tile with it, this is our deal in percentage
  }

  //Total amount of waits possible
  getTotalPossibleWaits(player: number) {
    var total = 0;
    for (let i = 1; i <= 9; i++) {
      // Go through all tiles and check how many combinations there are overall for waits.
      for (let j = 0; j <= 3; j++) {
        if (j == 3 && i >= 8) {
          break;
        }
        total += this.getTileDangerForPlayer(
          new Tile({ index: i, type: j }),
          player
        );
      }
    }
    return total;
  }

  //Returns the expected deal in calue
  getExpectedDealInValue(player: number) {
    var tenpaiChance = this.isPlayerTenpai(player);

    var value = this.getExpectedHandValue(player);

    //DealInValue is probability of player being in tenpai multiplied by the value of the hand
    return tenpaiChance * value;
  }

  //Calculate the expected Han of the hand
  getExpectedHandValue(player: number) {
    var doraValue = this.ai.utils.getNumberOfDoras(this.ai.calls[player]); //Visible Dora (melds)

    doraValue += this.getExpectedDoraInHand(player); //Dora in hidden tiles (hand)

    //Kita (3 player mode only)
    if (this.ai.utils.getNumberOfPlayers() == 3) {
      doraValue +=
        this.ai.game.players[player].kitas *
        this.ai.utils.getTileDoraValue(new Tile({ index: 4, type: 3 })) *
        1;
    }

    var hanValue = 0;
    if (this.ai.game.players[player].riichiTile) {
      hanValue += 1;
    }

    //Yakus (only for open hands)
    hanValue +=
      Math.max(
        this.isDoingHonitsu(player, 0) * 2,
        this.isDoingHonitsu(player, 1) * 2,
        this.isDoingHonitsu(player, 2) * 2
      ) +
      this.isDoingToiToi(player) * 2 +
      this.isDoingTanyao(player) * 1 +
      this.isDoingYakuhai(player) * 1;

    //Expect some hidden Yaku when more tiles are unknown. 1.3 Yaku for a fully concealed hand, less for open hands
    if (this.ai.calls[player].length == 0) {
      hanValue += 1.3;
    } else {
      hanValue += this.ai.game.players[player].tileCount / 15;
    }

    hanValue = hanValue < 1 ? 1 : hanValue;

    return this.ai.utils.calculateScore(player, hanValue + doraValue);
  }

  //How many dora does the player have on average in his hidden tiles?
  getExpectedDoraInHand(player: number) {
    var uradora = 0;
    if (this.ai.game.players[player].riichiTile) {
      //amount of dora indicators multiplied by chance to hit uradora
      uradora = this.ai.utils.getUradoraChance();
    }
    return (
      ((this.ai.game.players[player].tileCount +
        this.ai.game.players[player].pond.length / 2) /
        this.ai.availableTiles.length) *
        this.ai.utils.getNumberOfDoras(this.ai.availableTiles) +
      uradora
    );
  }

  //Returns the current Danger level of the table
  getCurrentDangerLevel(forPlayer = 0) {
    //Most Dangerous Player counts extra
    var i = 1;
    var j = 2;
    var k = 3;
    if (forPlayer == 1) {
      i = 0;
    }
    if (forPlayer == 2) {
      j = 0;
    }
    if (forPlayer == 3) {
      k = 0;
    }
    if (this.ai.utils.getNumberOfPlayers() == 3) {
      return (
        (this.getExpectedDealInValue(i) +
          this.getExpectedDealInValue(j) +
          Math.max(
            this.getExpectedDealInValue(i),
            this.getExpectedDealInValue(j)
          )) /
        3
      );
    }
    return (
      (this.getExpectedDealInValue(i) +
        this.getExpectedDealInValue(j) +
        this.getExpectedDealInValue(k) +
        Math.max(
          this.getExpectedDealInValue(i),
          this.getExpectedDealInValue(j),
          this.getExpectedDealInValue(k)
        )) /
      4
    );
  }

  private getDeltaHandChangesFromDiscard(player: number, tile: Tile) {
    const savedHandChanges =
      this.handChangesAtDiscardedTile[player][tile.toString()];
    if (!savedHandChanges) return;
    return this.handChanges.map(
      (handChangeCount, i) => handChangeCount - savedHandChanges[i]
    );
  }

  //Returns the number of turns ago when the tile was most recently discarded
  getMostRecentDiscardDanger(
    tile: Tile,
    player: number,
    includeOthers: boolean
  ) {
    var danger = 99;
    for (var i = 0; i < this.ai.utils.getNumberOfPlayers(); i++) {
      const inDiscards = this.tileInDiscard(player, tile);
      const deltaHandChanges = this.getDeltaHandChangesFromDiscard(i, tile);
      if (player == i && inDiscards) {
        //Tile is in own discards
        return 0;
      }
      if (!includeOthers || player == 0) {
        continue;
      }
      if (inDiscards) {
        danger = deltaHandChanges?.[player] ?? 0;
      }
    }

    return danger;
  }

  //Returns the position of a tile in discards
  tileInDiscard(player: number, tile: Tile) {
    return this.ai.game.players[player].discards.some(tile.equals);
  }

  //Returns a number from 0 to 1 how likely it is that the player is tenpai
  isPlayerTenpai(player: number) {
    var numberOfCalls = Math.floor(this.ai.calls[player].length / 3);
    if (this.ai.game.players[player].riichiTile || numberOfCalls >= 4) {
      return 1;
    }

    //Based on: https://pathofhouou.blogspot.com/2021/04/analysis-tenpai-chance-by-tedashis-and.html
    //This is only accurate for high level games!
    var tenpaiChanceList: number[][] = [[], [], [], []];
    tenpaiChanceList[0] = [
      0, 0.1, 0.2, 0.5, 1, 1.8, 2.8, 4.2, 5.8, 7.6, 9.5, 11.5, 13.5, 15.5, 17.5,
      19.5, 21.7, 23.9, 25, 27, 29, 31, 33, 35, 37,
    ];
    tenpaiChanceList[1] = [
      0.2, 0.9, 2.3, 4.7, 8.3, 12.7, 17.9, 23.5, 29.2, 34.7, 39.7, 43.9, 47.4,
      50.3, 52.9, 55.2, 57.1, 59, 61, 63, 65, 67, 69,
    ];
    tenpaiChanceList[2] = [
      0, 5.1, 10.5, 17.2, 24.7, 32.3, 39.5, 46.1, 52, 57.2, 61.5, 65.1, 67.9,
      69.9, 71.4, 72.4, 73.3, 74.2, 75, 76, 77, 78, 79,
    ];
    tenpaiChanceList[3] = [
      0, 0, 41.9, 54.1, 63.7, 70.9, 76, 79.9, 83, 85.1, 86.7, 87.9, 88.7, 89.2,
      89.5, 89.4, 89.3, 89.2, 89.2, 89.2, 90, 90, 90,
    ];

    var numberOfDiscards = this.ai.game.players[player].pond.length;
    for (var i = 0; i < this.ai.utils.getNumberOfPlayers(); i++) {
      if (i == player) {
        continue;
      }
      for (let t of this.ai.calls[i]) {
        //Look through all melds and check where the tile came from
        if (t.from == this.ai.api.localPosition2Seat(player)) {
          numberOfDiscards++;
        }
      }
    }

    if (numberOfDiscards > 20) {
      numberOfDiscards = 20;
    }

    try {
      var tenpaiChance =
        tenpaiChanceList[numberOfCalls][numberOfDiscards] / 100;
    } catch {
      var tenpaiChance = 0.5;
    }

    tenpaiChance *= 1 + this.isPlayerPushing(player) / 5;

    //Player who is doing Honitsu starts discarding tiles of his own type => probably tenpai
    if (
      this.isDoingHonitsu(player, 0) &&
      this.ai.game.players[player].pond
        .slice(10)
        .filter((tile) => tile.type == 0).length > 0
    ) {
      tenpaiChance *= 1 + this.isDoingHonitsu(player, 0) / 1.5;
    }
    if (
      this.isDoingHonitsu(player, 1) &&
      this.ai.game.players[player].pond
        .slice(10)
        .filter((tile) => tile.type == 1).length > 0
    ) {
      tenpaiChance *= 1 + this.isDoingHonitsu(player, 1) / 1.5;
    }
    if (
      this.isDoingHonitsu(player, 2) &&
      this.ai.game.players[player].pond
        .slice(10)
        .filter((tile) => tile.type == 2).length > 0
    ) {
      tenpaiChance *= 1 + this.isDoingHonitsu(player, 2) / 1.5;
    }

    var room = this.ai.api.getCurrentRoom();
    if (room < 5 && room > 0) {
      //Below Throne Room: Less likely to be tenpai
      tenpaiChance *= 1 - (5 - room) * 0.1; //10% less likely for every rank lower than throne room to be tenpai
    }

    if (tenpaiChance > 1) {
      tenpaiChance = 1;
    } else if (tenpaiChance < 0) {
      tenpaiChance = 0;
    }

    return tenpaiChance;
  }

  //Returns a number from -1 (fold) to 1 (push).
  isPlayerPushing(player: number) {
    var lastDiscardSafety = this.ai.playerDiscardSafetyList[player]
      .slice(-3)
      .filter((v) => v >= 0); //Check safety of last three discards. If dangerous: Not folding.

    if (
      this.ai.playerDiscardSafetyList[player].length < 3 ||
      lastDiscardSafety.length == 0
    ) {
      return 0;
    }

    var pushValue =
      -1 +
      lastDiscardSafety.reduce((v1, v2) => v1 + v2 * 20, 0) /
        lastDiscardSafety.length;
    if (pushValue > 1) {
      pushValue = 1;
    }
    return pushValue;
  }

  //Is the player doing any of the most common yaku?
  hasYaku(player: number) {
    return (
      this.isDoingHonitsu(player, 0) > 0 ||
      this.isDoingHonitsu(player, 1) > 0 ||
      this.isDoingHonitsu(player, 2) > 0 ||
      this.isDoingToiToi(player) > 0 ||
      this.isDoingTanyao(player) > 0 ||
      this.isDoingYakuhai(player) > 0
    );
  }

  //Return a confidence between 0 and 1 for how predictable the strategy of another player is (many calls -> very predictable)
  getConfidenceInYakuPrediction(player: number) {
    var confidence =
      Math.pow(Math.floor(this.ai.calls[player].length / 3), 2) / 10;
    if (confidence > 1) {
      confidence = 1;
    }
    return confidence;
  }

  //Returns a value between 0 and 1 for how likely the player could be doing honitsu
  isDoingHonitsu(player: number, type: number) {
    if (
      Math.floor(this.ai.calls[player].length) == 0 ||
      this.ai.calls[player].some((tile) => tile.type != type && tile.type != 3)
    ) {
      //Calls of different type -> false
      return 0;
    }
    if (Math.floor(this.ai.calls[player].length / 3) == 4) {
      return 1;
    }
    var percentageOfDiscards =
      this.ai.game.players[player].pond
        .slice(0, 10)
        .filter((tile) => tile.type == type).length /
      this.ai.game.players[player].pond.slice(0, 10).length;
    if (
      percentageOfDiscards > 0.2 ||
      this.ai.game.players[player].pond.slice(0, 10).length == 0
    ) {
      return 0;
    }
    var confidence =
      Math.pow(Math.floor(this.ai.calls[player].length / 3), 2) / 10 -
      percentageOfDiscards +
      0.1;
    if (confidence > 1) {
      confidence = 1;
    }
    return confidence;
  }

  //Returns a value between 0 and 1 for how likely the player could be doing toitoi
  isDoingToiToi(player: number) {
    if (
      Math.floor(this.ai.calls[player].length) > 0 &&
      this.ai.utils.getSequences(this.ai.calls[player]).length == 0
    ) {
      //Only triplets called
      return this.getConfidenceInYakuPrediction(player) - 0.1;
    }
    return 0;
  }

  //Returns a value between 0 and 1 for how likely the player could be doing tanyao
  isDoingTanyao(player: number) {
    if (
      Math.floor(this.ai.calls[player].length) > 0 &&
      this.ai.calls[player].filter(
        (tile) => tile.type == 3 || tile.index == 1 || tile.index == 9
      ).length == 0 &&
      this.ai.game.players[player].pond
        .slice(0, 5)
        .filter((tile) => tile.type == 3 || tile.index == 1 || tile.index == 9)
        .length /
        this.ai.game.players[player].pond.slice(0, 5).length >=
        0.6
    ) {
      //only inner tiles called and lots of terminal/honor discards
      return this.getConfidenceInYakuPrediction(player);
    }
    return 0;
  }

  //Returns how many Yakuhai the player has
  isDoingYakuhai(player: number) {
    var yakuhai = Math.floor(
      this.ai.calls[player].filter(
        (tile) =>
          tile.type == 3 &&
          (tile.index > 4 ||
            tile.index == this.ai.api.getSeatWind(player) ||
            tile.index == this.ai.roundWind)
      ).length / 3
    );
    yakuhai += Math.floor(
      this.ai.calls[player].filter(
        (tile) =>
          tile.type == 3 &&
          tile.index == this.ai.api.getSeatWind(player) &&
          tile.index == this.ai.roundWind
      ).length / 3
    );
    return yakuhai;
  }

  //Returns a score how likely this tile can form the last triple/pair for a player
  //Suji, Walls and general knowledge about remaining tiles.
  //If "includeOthers" parameter is set to true it will also check if other players recently discarded relevant tiles
  getWaitScoreForTileAndPlayer(
    player: number,
    tile: Tile,
    includeOthers: boolean,
    useKnowledgeOfOwnHand = true
  ) {
    var tile0 = this.ai.utils.getNumberOfTilesAvailable(tile.index, tile.type);
    var tile0Public =
      tile0 +
      this.ai.utils.getNumberOfTilesInTileArray(
        this.ai.game.hand,
        tile.index,
        tile.type
      );
    if (!useKnowledgeOfOwnHand) {
      tile0 = tile0Public;
    }
    var furitenFactor = this.getFuritenValue(player, tile, includeOthers);

    if (furitenFactor == 0) {
      return 0;
    }

    //Less priority on Ryanmen and Bridge Wait when player is doing Toitoi
    var toitoiFactor = 1 - this.isDoingToiToi(player) / 3;

    var score = 0;

    //Same tile
    score += tile0 * tile0Public * furitenFactor * 2 * (2 - toitoiFactor);

    if (this.ai.game.players[player].tileCount == 1 || tile.type == 3) {
      return score;
    }

    var tileL3Public =
      this.ai.utils.getNumberOfTilesAvailable(tile.index - 3, tile.type) +
      this.ai.utils.getNumberOfTilesInTileArray(
        this.ai.game.hand,
        tile.index - 3,
        tile.type
      );
    var tileU3Public =
      this.ai.utils.getNumberOfTilesAvailable(tile.index + 3, tile.type) +
      this.ai.utils.getNumberOfTilesInTileArray(
        this.ai.game.hand,
        tile.index + 3,
        tile.type
      );

    var tileL2 = this.ai.utils.getNumberOfTilesAvailable(
      tile.index - 2,
      tile.type
    );
    var tileL1 = this.ai.utils.getNumberOfTilesAvailable(
      tile.index - 1,
      tile.type
    );
    var tileU1 = this.ai.utils.getNumberOfTilesAvailable(
      tile.index + 1,
      tile.type
    );
    var tileU2 = this.ai.utils.getNumberOfTilesAvailable(
      tile.index + 2,
      tile.type
    );

    if (!useKnowledgeOfOwnHand) {
      tileL2 += this.ai.utils.getNumberOfTilesInTileArray(
        this.ai.game.hand,
        tile.index - 2,
        tile.type
      );
      tileL1 += this.ai.utils.getNumberOfTilesInTileArray(
        this.ai.game.hand,
        tile.index - 1,
        tile.type
      );
      tileU1 += this.ai.utils.getNumberOfTilesInTileArray(
        this.ai.game.hand,
        tile.index + 1,
        tile.type
      );
      tileU2 += this.ai.utils.getNumberOfTilesInTileArray(
        this.ai.game.hand,
        tile.index + 2,
        tile.type
      );
    }

    var furitenFactorL = this.getFuritenValue(
      player,
      new Tile({ index: tile.index - 3, type: tile.type }),
      includeOthers
    );
    var furitenFactorU = this.getFuritenValue(
      player,
      new Tile({ index: tile.index + 3, type: tile.type }),
      includeOthers
    );

    //Ryanmen Waits
    score +=
      tileL1 *
      tileL2 *
      (tile0Public + tileL3Public) *
      furitenFactorL *
      toitoiFactor;
    score +=
      tileU1 *
      tileU2 *
      (tile0Public + tileU3Public) *
      furitenFactorU *
      toitoiFactor;

    //Bridge Wait
    score += tileL1 * tileU1 * tile0Public * furitenFactor * toitoiFactor;

    return score;
  }

  //Returns 0 if tile is 100% furiten, 1 if not. Value between 0-1 is returned if furiten tile was not called some turns ago.
  getFuritenValue(player: number, tile: Tile, includeOthers: boolean) {
    var danger = this.getMostRecentDiscardDanger(tile, player, includeOthers);
    if (danger == 0) {
      return 0;
    } else if (danger == 1) {
      if (this.ai.calls[player].length > 0) {
        return 0.5;
      }
      return 0.95;
    } else if (danger == 2) {
      if (this.ai.calls[player].length > 0) {
        return 0.8;
      }
    }
    return 1;
  }

  //Returns a value which indicates how important it is to sakigiri the tile now
  getSakigiriValue(hand: Tile[], tile: Tile) {
    var sakigiri = 0;
    for (
      let player = 1;
      player < this.ai.utils.getNumberOfPlayers();
      player++
    ) {
      if (this.ai.game.players[player].pond.length < 3) {
        // Not many discards yet (very early) => ignore Sakigiri
        continue;
      }

      if (this.getExpectedDealInValue(player) > 150) {
        // Obviously don't sakigiri when the player could already be in tenpai
        continue;
      }

      if (this.isSafeTile(player, tile)) {
        // Tile is safe
        continue;
      }

      var safeTiles = 0;
      for (let t of hand) {
        // How many safe tiles do we currently have?
        if (this.isSafeTile(player, t)) {
          safeTiles++;
        }
      }

      var saki = (3 - safeTiles) * (this.ai.SAKIGIRI * 4);
      if (saki <= 0) {
        // 3 or more safe tiles: Sakigiri not necessary
        continue;
      }

      if (this.ai.api.getSeatWind(player) == 1) {
        // Player is dealer
        saki *= 1.5;
      }
      sakigiri += saki;
    }
    return sakigiri;
  }

  //Returns true when the given tile is safe for a given player
  isSafeTile(player: number, tile: Tile) {
    return (
      this.getWaitScoreForTileAndPlayer(player, tile, false) < 20 ||
      (tile.type == 3 &&
        this.ai.availableTiles.filter((t) => t.equals(tile)).length <= 2)
    );
  }

  //Check if the tile is close to another tile
  isTileCloseToOtherTile(tile: Tile, otherTile: Tile) {
    if (tile.type != 3 && tile.type == otherTile.type) {
      return (
        tile.index >= otherTile.index - 3 && tile.index <= otherTile.index + 3
      );
    }
  }

  //Check if the tile is close to dora
  isTileCloseToDora(tile: Tile) {
    for (let indicator of this.ai.game.doraIndicators!) {
      const dora = indicator.after();
      if (tile.distance(dora) <= 2) return true;
    }
    return false;
  }
}
