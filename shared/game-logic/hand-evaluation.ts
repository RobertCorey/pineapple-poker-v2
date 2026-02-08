import {
  type Card,
  type HandEvaluation,
  HandRank,
  Rank,
  type ThreeCardHandEvaluation,
  ThreeCardHandRank,
} from '../core/types';

// ---- Helpers ----

/** Sort ranks descending. */
function sortedRanks(cards: Card[]): number[] {
  return cards.map((c) => c.rank as number).sort((a, b) => b - a);
}

/** Count occurrences of each rank. Returns map of rank -> count. */
function rankCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const c of cards) {
    counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  }
  return counts;
}

/** Check if all cards share the same suit. */
function isFlush(cards: Card[]): boolean {
  return cards.every((c) => c.suit === cards[0].suit);
}

/**
 * Check if the sorted ranks form a straight. Returns the high card rank
 * of the straight, or 0 if not a straight.
 *
 * Handles the special case of A-2-3-4-5 (wheel) where ace plays low.
 */
function straightHighCard(ranks: number[]): number {
  // ranks are sorted descending
  // Normal straight check: each card is exactly 1 less than the previous
  let isStraight = true;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i - 1] - ranks[i] !== 1) {
      isStraight = false;
      break;
    }
  }
  if (isStraight) return ranks[0];

  // Check for wheel: A-5-4-3-2 (sorted: 14,5,4,3,2)
  if (
    ranks.length === 5 &&
    ranks[0] === Rank.Ace &&
    ranks[1] === Rank.Five &&
    ranks[2] === Rank.Four &&
    ranks[3] === Rank.Three &&
    ranks[4] === Rank.Two
  ) {
    return Rank.Five; // 5-high straight
  }

  return 0;
}

// ---- 5-card hand evaluation ----

/**
 * Evaluate a 5-card poker hand. Cards must be exactly 5.
 *
 * Returns { handRank, kickers } where kickers encode the hand strength
 * for tiebreaking within the same handRank.
 */
export function evaluate5CardHand(cards: Card[]): HandEvaluation {
  if (cards.length !== 5) {
    throw new Error(`Expected 5 cards, got ${cards.length}`);
  }

  const ranks = sortedRanks(cards);
  const counts = rankCounts(cards);
  const flush = isFlush(cards);
  const strHigh = straightHighCard(ranks);
  const straight = strHigh > 0;

  // Group ranks by count for classification
  const groups = Array.from(counts.entries()).sort((a, b) => {
    // Sort by count descending, then by rank descending
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Royal Flush: A-K-Q-J-10 all same suit
  if (flush && straight && strHigh === Rank.Ace && ranks[4] === Rank.Ten) {
    return { handRank: HandRank.RoyalFlush, kickers: [Rank.Ace] };
  }

  // Straight Flush
  if (flush && straight) {
    return { handRank: HandRank.StraightFlush, kickers: [strHigh] };
  }

  // Four of a Kind
  if (groups[0][1] === 4) {
    const quadRank = groups[0][0];
    const kicker = groups[1][0];
    return { handRank: HandRank.FourOfAKind, kickers: [quadRank, kicker] };
  }

  // Full House: three of a kind + pair
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return {
      handRank: HandRank.FullHouse,
      kickers: [groups[0][0], groups[1][0]],
    };
  }

  // Flush
  if (flush) {
    return { handRank: HandRank.Flush, kickers: ranks };
  }

  // Straight
  if (straight) {
    return { handRank: HandRank.Straight, kickers: [strHigh] };
  }

  // Three of a Kind
  if (groups[0][1] === 3) {
    const tripRank = groups[0][0];
    const kickers = groups
      .slice(1)
      .map((g) => g[0])
      .sort((a, b) => b - a);
    return {
      handRank: HandRank.ThreeOfAKind,
      kickers: [tripRank, ...kickers],
    };
  }

  // Two Pair
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2][0];
    return {
      handRank: HandRank.TwoPair,
      kickers: [highPair, lowPair, kicker],
    };
  }

  // One Pair
  if (groups[0][1] === 2) {
    const pairRank = groups[0][0];
    const kickers = groups
      .slice(1)
      .map((g) => g[0])
      .sort((a, b) => b - a);
    return { handRank: HandRank.Pair, kickers: [pairRank, ...kickers] };
  }

  // High Card
  return { handRank: HandRank.HighCard, kickers: ranks };
}

// ---- 3-card hand evaluation (top row) ----

/**
 * Evaluate a 3-card hand for the top row.
 * Only High Card, Pair, and Three of a Kind are possible with 3 cards.
 */
export function evaluate3CardHand(cards: Card[]): ThreeCardHandEvaluation {
  if (cards.length !== 3) {
    throw new Error(`Expected 3 cards, got ${cards.length}`);
  }

  const ranks = sortedRanks(cards);
  const counts = rankCounts(cards);

  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Three of a Kind
  if (groups[0][1] === 3) {
    return {
      handRank: ThreeCardHandRank.ThreeOfAKind,
      kickers: [groups[0][0]],
    };
  }

  // Pair
  if (groups[0][1] === 2) {
    const pairRank = groups[0][0];
    const kicker = groups[1][0];
    return {
      handRank: ThreeCardHandRank.Pair,
      kickers: [pairRank, kicker],
    };
  }

  // High Card
  return { handRank: ThreeCardHandRank.HighCard, kickers: ranks };
}

// ---- Comparison ----

/**
 * Compare two hands of the same type (both 5-card or both 3-card).
 * Returns:
 *   1  if hand A wins
 *   -1 if hand B wins
 *   0  if tied
 */
export function compareHands(
  a: { handRank: number; kickers: number[] },
  b: { handRank: number; kickers: number[] },
): -1 | 0 | 1 {
  // Higher hand rank wins
  if (a.handRank > b.handRank) return 1;
  if (a.handRank < b.handRank) return -1;

  // Same hand rank: compare kickers
  const len = Math.min(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    if (a.kickers[i] > b.kickers[i]) return 1;
    if (a.kickers[i] < b.kickers[i]) return -1;
  }

  return 0;
}

/**
 * Compare two 5-card hands directly from cards.
 * Returns 1 if A wins, -1 if B wins, 0 if tie.
 */
export function compare5CardHands(a: Card[], b: Card[]): -1 | 0 | 1 {
  return compareHands(evaluate5CardHand(a), evaluate5CardHand(b));
}

/**
 * Compare two 3-card hands directly from cards.
 * Returns 1 if A wins, -1 if B wins, 0 if tie.
 */
export function compare3CardHands(a: Card[], b: Card[]): -1 | 0 | 1 {
  return compareHands(evaluate3CardHand(a), evaluate3CardHand(b));
}

/**
 * Compare two rows from a board. Uses 3-card eval for top row, 5-card for others.
 * Returns 1 if A wins, -1 if B wins, 0 if tie.
 */
export function compareRows(
  a: Card[],
  b: Card[],
  isTopRow: boolean,
): -1 | 0 | 1 {
  if (isTopRow) return compare3CardHands(a, b);
  return compare5CardHands(a, b);
}
