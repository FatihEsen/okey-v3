/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Color {
  RED = "red",
  YELLOW = "yellow",
  BLACK = "black",
  BLUE = "blue",
  JOKER = "joker",
}

export interface Tile {
  id: string;
  number: number; // 1-13
  color: Color;
  isOkey: boolean;
  isIndicator: boolean;
}

export type CombinationType = "run" | "group" | "pair";

export interface Combination {
  tiles: Tile[];
  type: CombinationType;
  score: number;
}

export type TileSet = Combination;

export interface Player {
  id: string;
  name: string;
  hand: (Tile | null)[];
  openedSets: Combination[];
  openedPairs: Tile[][];
  score: number; // Penalty points (running total)
  isAI: boolean;
  hasOpened: boolean;
  openedWithType: 'sets' | 'pairs' | null;
  openedWithPairs: boolean; // UI compatibility
  lastOpenScore: number;
  lastDiscardedTile?: Tile | null;
  mustOpen?: boolean;
  drawnFromDiscardTile?: Tile | null;
  lastDrawnTileId?: string | null;
  canUndoOpen: boolean; 
  hasUndoneThisRound: boolean; 
  // Bu sırada (turda) açılan taşların id'leri — geri al sadece bunları geri alır.
  currentTurnOpenedTileIds: string[];
  // Bu turda ilk kez el açıldıysa true — elden bitirme tespiti için.
  openedThisTurn: boolean;
}

export enum GameMode {
  STANDARD = "standard",
  FOLDING = "folding",
  PARTNER = "partner",
}

export enum GamePhase {
  WAITING = "waiting",
  PLAYING = "playing",
  DRAWING = "drawing",
  DISCARDING = "discarding",
  FINISHED = "finished",
}

export interface GameState {
  mode: GameMode;
  players: Player[];
  currentPlayerIndex: number;
  deck: Tile[];
  discardPile: Tile[];
  indicator: Tile | null;
  okeyTile: { number: number; color: Color } | null;
  phase: GamePhase;
  lastOpeningScore: number;
  lastOpeningPairs: number;
  currentOpenScore: number;
  currentOpenPairs: number;
  winnerId: string | null;
  logs: string[];
  // Katlama sistemi için
  hasDoubleOpen: boolean; // Çift açan varsa
  hasOkeyDiscard: boolean; // Okey atılmışsa
  hasContinuationDiscard: boolean; // Devam atılmışsa (aynı sayıda farklı renk)
  hasHandFinish: boolean; // Elden bitmişse (hiç taş işlememiş)
  noOneOpened: boolean; // Kimse açmadan el bittiyse
  roundNumber: number; // Kaçıncı el
  cumulativeScores: { [playerId: string]: number }; // Kümülatif skor
  turnSnapshot?: string | null; // Tur başındaki (taş çektikten hemen sonraki) state yedeği
}

export type GameAction =
  | { type: 'START_GAME'; mode: GameMode }
  | { type: 'DRAW_TILE' }
  | { type: 'TAKE_DISCARD' }
  | { type: 'DISCARD_TILE'; tileId: string }
  | { type: 'OPEN_HAND'; combinations: Combination[]; openType: 'sets' | 'pairs' }
  | { type: 'ADD_TO_TABLE'; targetPlayerId: string; combinationIndex: number; tiles: Tile[] }
  | { type: 'REORDER_HAND'; newHand: (Tile | null)[] };
