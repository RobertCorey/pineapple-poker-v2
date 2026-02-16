// ---- Value constants (using 'as const' objects instead of enums for erasableSyntaxOnly) ----

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

export const GamePhase = {
  Lobby: 'lobby',
  InitialDeal: 'initial_deal',
  Street2: 'street_2',
  Street3: 'street_3',
  Street4: 'street_4',
  Street5: 'street_5',
  Scoring: 'scoring',
  Complete: 'complete',
  MatchComplete: 'match_complete',
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export const Row = {
  Top: 'top',
  Middle: 'middle',
  Bottom: 'bottom',
} as const;
export type Row = (typeof Row)[keyof typeof Row];

// ---- Core types ----

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

// ---- Game state types ----

export interface PlayerState {
  uid: string;
  displayName: string;
  board: Board;
  deck: Card[];          // remaining cards in this player's personal deck
  currentHand: Card[];   // cards currently in hand (to be placed)
  disconnected: boolean;
  fouled: boolean;
  score: number;
}

export interface RoundResult {
  netScore: number;
  fouled: boolean;
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  players: Record<string, PlayerState>;
  playerOrder: string[];   // uid list for turn order
  street: number;          // 1-5
  round: number;           // 1-based current round (0 = pre-match lobby)
  totalRounds: number;     // rounds per match (always 3)
  hostUid: string;         // uid of match creator
  roundResults?: Record<string, RoundResult>;
  createdAt: number;
  updatedAt: number;
  phaseDeadline: number | null;  // Unix timestamp when phase expires
}

// ---- Scoring types ----

export interface PairwiseResult {
  playerA: string;
  playerB: string;
  rowPoints: number;
  scoopBonus: number;
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
