/**
 * VENDORED from shared/core/types.ts for the single-player Saloon mode.
 *
 * The Saloon (Frontier Trail) mode is deliberately decoupled from the
 * multiplayer stack — it runs entirely client-side with no Firebase. Keep
 * this copy self-contained; do not import from @shared here.
 */

export const Suit = {
  Clubs: 'c',
  Diamonds: 'd',
  Hearts: 'h',
  Spades: 's',
} as const;
export type Suit = (typeof Suit)[keyof typeof Suit];

export const Rank = {
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5,
  Six: 6,
  Seven: 7,
  Eight: 8,
  Nine: 9,
  Ten: 10,
  Jack: 11,
  Queen: 12,
  King: 13,
  Ace: 14,
} as const;
export type Rank = (typeof Rank)[keyof typeof Rank];

export const HandRank = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
  RoyalFlush: 9,
} as const;
export type HandRank = (typeof HandRank)[keyof typeof HandRank];

/** For 3-card top row, only these ranks are possible. */
export const ThreeCardHandRank = {
  HighCard: 0,
  Pair: 1,
  ThreeOfAKind: 2,
} as const;
export type ThreeCardHandRank =
  (typeof ThreeCardHandRank)[keyof typeof ThreeCardHandRank];

export const Row = {
  Top: 'top',
  Middle: 'middle',
  Bottom: 'bottom',
} as const;
export type Row = (typeof Row)[keyof typeof Row];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Board {
  top: Card[];    // max 3
  middle: Card[]; // max 5
  bottom: Card[]; // max 5
}

export interface HandEvaluation {
  handRank: HandRank;
  /** Kickers sorted for tiebreaking (meaning depends on hand type). */
  kickers: number[];
}

export interface ThreeCardHandEvaluation {
  handRank: ThreeCardHandRank;
  kickers: number[];
}

// ---- Scoring types ----

export interface PairwiseResult {
  playerA: string;
  playerB: string;
  rowPoints: number;
  scoopBonus: number;
  royalties: number;   // net royalty differential (A's total - B's total)
  total: number;
}

export interface PlayerScore {
  uid: string;
  fouled: boolean;
  netScore: number;
  pairwise: PairwiseResult[];
}

export interface ScoringResult {
  players: PlayerScore[];
}
