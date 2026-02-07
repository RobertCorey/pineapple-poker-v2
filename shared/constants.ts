import { HandRank, Rank, ThreeCardHandRank } from './types';

// ---- Bottom row royalties (5-card hand) ----
export const BOTTOM_ROYALTIES: Partial<Record<number, number>> = {
  [HandRank.Straight]: 2,
  [HandRank.Flush]: 4,
  [HandRank.FullHouse]: 6,
  [HandRank.FourOfAKind]: 10,
  [HandRank.StraightFlush]: 15,
  [HandRank.RoyalFlush]: 25,
};

// ---- Middle row royalties (5-card hand, doubled vs bottom) ----
export const MIDDLE_ROYALTIES: Partial<Record<number, number>> = {
  [HandRank.ThreeOfAKind]: 2,
  [HandRank.Straight]: 4,
  [HandRank.Flush]: 8,
  [HandRank.FullHouse]: 12,
  [HandRank.FourOfAKind]: 20,
  [HandRank.StraightFlush]: 30,
  [HandRank.RoyalFlush]: 50,
};

// ---- Top row royalties (3-card hand) ----

/**
 * Top row pair royalties: pair of 66 = 1, 77 = 2, ... AA = 9
 * Only pairs of 6 or higher earn royalties.
 */
export const TOP_PAIR_ROYALTIES: Partial<Record<number, number>> = {
  [Rank.Six]: 1,
  [Rank.Seven]: 2,
  [Rank.Eight]: 3,
  [Rank.Nine]: 4,
  [Rank.Ten]: 5,
  [Rank.Jack]: 6,
  [Rank.Queen]: 7,
  [Rank.King]: 8,
  [Rank.Ace]: 9,
};

/**
 * Top row trips royalties: 222 = 10, 333 = 11, ... AAA = 22
 */
export const TOP_TRIPS_ROYALTIES: Record<number, number> = {
  [Rank.Two]: 10,
  [Rank.Three]: 11,
  [Rank.Four]: 12,
  [Rank.Five]: 13,
  [Rank.Six]: 14,
  [Rank.Seven]: 15,
  [Rank.Eight]: 16,
  [Rank.Nine]: 17,
  [Rank.Ten]: 18,
  [Rank.Jack]: 19,
  [Rank.Queen]: 20,
  [Rank.King]: 21,
  [Rank.Ace]: 22,
};

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
