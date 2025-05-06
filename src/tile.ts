import { styleText } from "node:util";
import type { Game } from "./api/game";

export interface ITile {
  index: number;
  type: number;
  akadora?: boolean;
  from?: number;
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

export type CalledTile = Tile & { from: number };
export class Tile implements ITile {
  public index: number;
  public type: Suit;
  public akadora: boolean;
  public doraValue?: number;
  public from?: number;

  constructor(tile: ITile) {
    this.index = tile.index;
    this.type = tile.type;
    this.akadora = tile.akadora ?? false;
    this.from = tile.from;
  }

  static parse(tileStr: string): Tile {
    const firstChar = Number.parseInt(tileStr.charAt(0));
    const akadora = firstChar === 0;
    const type = Suit[tileStr.charAt(1) as keyof typeof Suit];
    if (type === undefined) throw new Error("Invalid tile type");
    return new Tile({
      akadora,
      index: akadora ? 5 : firstChar,
      type,
    });
  }

  called(from: number): CalledTile {
    this.from = from;
    return this as CalledTile;
  }

  toString() {
    return `${this.akadora ? 0 : this.index}${Suit[this.type]}`;
  }

  strictlyEquals(tile: ITile | string): boolean {
    if (typeof tile === "string") return this.strictlyEquals(Tile.parse(tile));
    const matchesAkadora = (this.akadora ?? false) === (tile.akadora ?? false);
    return this.equals(tile) && matchesAkadora;
  }

  equals(tile: ITile | string): boolean {
    if (typeof tile === "string") return this.equals(Tile.parse(tile));
    return this.index === tile.index && this.type === tile.type;
  }

  clone(partial: Partial<ITile> = {}) {
    return new Tile({ ...this, ...partial });
  }

  distance(tile?: ITile | null) {
    if (!tile || tile.type !== this.type) return Number.POSITIVE_INFINITY;
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
    return emojis[this.type][this.akadora ? 0 : this.index];
  }

  isSeatWind(seat: number) {
    return this.type === Suit.z && this.index === seat + 1;
  }

  isRoundWind(game: Game) {
    return this.type === Suit.z && this.index === game.round + 1;
  }
}
