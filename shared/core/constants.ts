import { HandRank, Rank, ThreeCardHandRank } from './types';

/** Points deducted per opponent when fouled. */
export const FOUL_PENALTY = 6;

/** Bonus for winning all 3 rows against an opponent. */
export const SCOOP_BONUS = 3;

/** Number of cards dealt on the initial street. */
export const INITIAL_DEAL_COUNT = 5;

/** Number of cards dealt on streets 2-5. */
export const STREET_DEAL_COUNT = 3;

/** Number of cards to place on streets 2-5 (discard 1). */
export const STREET_PLACE_COUNT = 2;

/** Total streets in a game. */
export const TOTAL_STREETS = 5;

/** Turn timeout durations in milliseconds */
export const INITIAL_DEAL_TIMEOUT_MS = 30_000;  // 30 seconds
export const STREET_TIMEOUT_MS = 20_000;         // 20 seconds

/** Delay between rounds before auto-starting next */
export const INTER_ROUND_DELAY_MS = 5_000;       // 5 seconds

/** Top row size. */
export const TOP_ROW_SIZE = 3;

/** Middle and bottom row size. */
export const FIVE_CARD_ROW_SIZE = 5;

/** Human-readable rank names for display. */
export const RANK_NAMES: Record<number, string> = {
  [Rank.Two]: '2',
  [Rank.Three]: '3',
  [Rank.Four]: '4',
  [Rank.Five]: '5',
  [Rank.Six]: '6',
  [Rank.Seven]: '7',
  [Rank.Eight]: '8',
  [Rank.Nine]: '9',
  [Rank.Ten]: 'T',
  [Rank.Jack]: 'J',
  [Rank.Queen]: 'Q',
  [Rank.King]: 'K',
  [Rank.Ace]: 'A',
};

export const SUIT_NAMES: Record<string, string> = {
  c: 'Clubs',
  d: 'Diamonds',
  h: 'Hearts',
  s: 'Spades',
};

/** Hand rank display names (5-card). */
export const HAND_RANK_NAMES: Record<number, string> = {
  [HandRank.HighCard]: 'High Card',
  [HandRank.Pair]: 'Pair',
  [HandRank.TwoPair]: 'Two Pair',
  [HandRank.ThreeOfAKind]: 'Three of a Kind',
  [HandRank.Straight]: 'Straight',
  [HandRank.Flush]: 'Flush',
  [HandRank.FullHouse]: 'Full House',
  [HandRank.FourOfAKind]: 'Four of a Kind',
  [HandRank.StraightFlush]: 'Straight Flush',
  [HandRank.RoyalFlush]: 'Royal Flush',
};

export const THREE_CARD_HAND_RANK_NAMES: Record<number, string> = {
  [ThreeCardHandRank.HighCard]: 'High Card',
  [ThreeCardHandRank.Pair]: 'Pair',
  [ThreeCardHandRank.ThreeOfAKind]: 'Three of a Kind',
};
