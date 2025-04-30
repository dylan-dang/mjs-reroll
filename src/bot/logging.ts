//################################
// LOGGING
// Contains logging functions
//################################

import type { TilePriority } from './ai_offense';
import type { AlphaJong } from './bot';
import { Tile } from './tile';

export class Logger {
  constructor(private ai: AlphaJong) {}

  //Print string to HTML or console
  log(t: any) {
    console.log(t);
  }

  //Print all tiles in hand
  printHand(hand: Tile[]) {
    var handString = this.getStringForTiles(hand);
    this.log('Hand:' + handString);
  }

  //Get String for array of tiles
  getStringForTiles(tiles: Tile[]) {
    var tilesString = '';
    var oldType = '';
    tiles.forEach((tile) => {
      if (this.getNameForType(tile.type) != oldType) {
        tilesString += oldType;
        oldType = this.getNameForType(tile.type);
      }
      if (tile.dora) {
        tilesString += '0';
      } else {
        tilesString += tile.index;
      }
    });
    tilesString += oldType;
    return tilesString;
  }

  //Print tile name
  printTile(tile: Tile) {
    this.log(this.getTileName(tile, false));
  }

  //Print given tile priorities
  printTilePriority(tiles: TilePriority[]) {
    this.log(
      'Overall: Value Open: <' +
        Number(tiles[0].score.open).toFixed(0) +
        '> Closed Value: <' +
        Number(tiles[0].score.closed).toFixed(0) +
        '> Riichi Value: <' +
        Number(tiles[0].score.riichi).toFixed(0) +
        '> Shanten: <' +
        Number(tiles[0].shanten).toFixed(0) +
        '>'
    );
    for (var i = 0; i < tiles.length && i < this.ai.LOG_AMOUNT; i++) {
      this.log(
        this.getTileName(tiles[i].tile, false) +
          ': Priority: <' +
          Number(tiles[i].priority).toFixed(3) +
          '> Efficiency: <' +
          Number(tiles[i].efficiency).toFixed(3) +
          '> Yaku Open: <' +
          Number(tiles[i].yaku.open).toFixed(3) +
          '> Yaku Closed: <' +
          Number(tiles[i].yaku.closed).toFixed(3) +
          '> Dora: <' +
          Number(tiles[i].dora).toFixed(3) +
          '> Waits: <' +
          Number(tiles[i].waits).toFixed(3) +
          '> Danger: <' +
          Number(tiles[i].danger).toFixed(2) +
          '>'
      );
    }
  }

  //Input string to get an array of tiles (e.g. "123m456p789s1z")
  getTilesFromString(inputString: string) {
    var numbers = [];
    var tiles: Tile[] = [];
    for (let input of inputString) {
      var type = 4;
      switch (input) {
        case 'p':
          type = 0;
          break;
        case 'm':
          type = 1;
          break;
        case 's':
          type = 2;
          break;
        case 'z':
          type = 3;
          break;
        default:
          numbers.push(input);
          break;
      }
      if (type != 4) {
        for (let number of numbers) {
          if (parseInt(number) == 0) {
            tiles.push(
              new Tile({
                index: 5,
                type: type,
                dora: true,
                doraValue: 1,
                valid: true,
              })
            );
          } else {
            tiles.push(
              new Tile({
                index: parseInt(number),
                type: type,
                dora: false,
                doraValue: 0,
                valid: true,
              })
            );
          }
        }
        numbers = [];
      }
    }
    return tiles;
  }

  //Returns the name for a tile
  getTileName(tile: Tile, useRaw = true) {
    let name = '';
    if (tile.dora == true) {
      name = '0' + this.getNameForType(tile.type);
    } else {
      name = tile.index + this.getNameForType(tile.type);
    }

    if (!useRaw && this.ai.USE_EMOJI) {
      return `${tile.emoji()}: ${name}`;
    } else {
      return name;
    }
  }

  //Returns the corresponding char for a type
  getNameForType(type: Tile['type']) {
    switch (type) {
      case 0:
        return 'p';
      case 1:
        return 'm';
      case 2:
        return 's';
      case 3:
        return 'z';
      default:
        return '?';
    }
  }

  //returns a string for the current state of the game
  getDebugString() {
    var debugString = '';
    debugString += this.getStringForTiles(this.ai.game.doraIndicators!) + '|';
    debugString += this.getStringForTiles(this.ai.game.hand) + '|';
    debugString += this.getStringForTiles(this.ai.calls[0]) + '|';
    debugString += this.getStringForTiles(this.ai.calls[1]) + '|';
    debugString += this.getStringForTiles(this.ai.calls[2]) + '|';
    if (this.ai.utils.getNumberOfPlayers() == 4) {
      debugString += this.getStringForTiles(this.ai.calls[3]) + '|';
    }
    debugString += this.getStringForTiles(this.ai.game.players[0].pond) + '|';
    debugString += this.getStringForTiles(this.ai.game.players[1].pond) + '|';
    debugString += this.getStringForTiles(this.ai.game.players[2].pond) + '|';
    if (this.ai.utils.getNumberOfPlayers() == 4) {
      debugString += this.getStringForTiles(this.ai.game.players[3].pond) + '|';
    }
    debugString += this.ai.game.players
      .map((player) => Number(!!player.riichiTile))
      .join(', ');
    debugString += '|';
    debugString += this.ai.seatWind + '|';
    debugString += this.ai.roundWind + '|';
    debugString += this.ai.game.tilesLeft;
    return debugString;
  }
}
