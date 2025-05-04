import { styleText } from "node:util";

export interface ITile {
  index: number;
  type: number;
  dora?: boolean;
  doraValue?: number;
  valid?: boolean;
  from?: number;
  kan?: boolean;
  old?: boolean;
}

export enum Suit {
  p,
  m,
  s,
  z,
}

const emojis = [
  [styleText("red", "🀝"), "🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡"],
  [styleText("red", "🀋"), "🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏"],
  [styleText("red", "🀔"), "🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘"],
  ["", "🀀", "🀁", "🀂", "🀃", "🀆", "🀅", "🀄"],
];

export class Tile implements ITile {
  public index: number;
  public type: Suit;
  public dora: boolean;
  public doraValue?: number;
  public valid?: boolean;
  public from?: number;
  public kan?: boolean;
  public old?: boolean;

  constructor(str: string);
  constructor(tile: ITile);
  constructor(strOrTile: string | ITile) {
    if (typeof strOrTile === "string") {
      const index = Number.parseInt(strOrTile.charAt(0));
      this.dora = index === 0;
      this.index = this.dora ? 5 : index;
      const type = Suit[strOrTile.charAt(1) as keyof typeof Suit];
      if (type === undefined) throw new Error("Invalid tile type");
      this.type = type;
    } else {
      this.index = strOrTile.index;
      this.type = strOrTile.type;
      this.dora = strOrTile.dora ?? false;
      this.doraValue = strOrTile.doraValue;
      this.valid = strOrTile.valid;
      this.from = strOrTile.from;
      this.kan = strOrTile.kan;
      this.old = strOrTile.old;
    }
  }

  toString() {
    return `${this.dora ? 0 : this.index}${Suit[this.type]}`;
  }

  strictlyEquals(tile: ITile) {
    return this.equals(tile) && (this.dora ?? false) === (tile.dora ?? false);
  }

  equals(tileStr: string): boolean;
  equals(tile: ITile): boolean;
  equals(tile: ITile | string) {
    if (typeof tile === "string") return this.equals(new Tile(tile));
    return this.index === tile.index && this.type === tile.type;
  }

  clone() {
    return new Tile(this);
  }

  distance(tile: ITile) {
    if (tile.type !== this.type) return Number.POSITIVE_INFINITY;
    if (tile.type === 3)
      return this.index === tile.index ? 0 : Number.POSITIVE_INFINITY;
    return Math.abs(this.index - tile.index);
  }

  private afterIndex(threePlayer: boolean) {
    if (this.type === 3) {
      if (this.index === 4) {
        return 1;
      }
      return this.index === 7 ? 5 : this.index + 1;
    }
    if (threePlayer && this.index === 1 && this.type === 1) {
      return 9; // 3 player mode: 1 man indicator means 9 man is dora
    }
    return this.index === 9 ? 1 : this.index + 1;
  }

  after(threePlayer = false) {
    return new Tile({ type: this.type, index: this.afterIndex(threePlayer) });
  }

  emoji() {
    return emojis[this.type][this.dora ? 0 : this.index];
  }
}
