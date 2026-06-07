/**
 * Bot card placement strategy.
 *
 * Greedy per-street placement scored by `scoreBoard`, whose dominant term is
 * FOUL AVOIDANCE: a completed foul is catastrophic, and during building a higher
 * row out-ranking a lower one (by made-hand tier, and by real hand comparison
 * once rows are complete) is heavily penalized so strength stays in the bottom.
 * Secondary rewards: pairs/flush draws (weighted toward the bottom), high cards
 * low. Streets 2-5 brute-force all (discard, row-assignment) options.
 *
 * Not game-theory-optimal, but fouls ~11% of games (vs ~56% for naive avg-rank
 * routing) — see bot-strategy.test.ts.
 */
import type { Card, Board, Row } from '../../shared/core/types';
import { TOP_ROW_SIZE, FIVE_CARD_ROW_SIZE } from '../../shared/core/constants';
import { isFoul } from '../../shared/game-logic/scoring';
import { compareRows } from '../../shared/game-logic/hand-evaluation';

export interface BotPlacement {
  card: Card;
  row: Row;
}

export interface BotDecision {
  placements: BotPlacement[];
  discard?: Card;
}

const ROW_MAX: Record<Row, number> = {
  top: TOP_ROW_SIZE,
  middle: FIVE_CARD_ROW_SIZE,
  bottom: FIVE_CARD_ROW_SIZE,
};

const ROWS: Row[] = ['bottom', 'middle', 'top'];

function rowSpace(board: Board, row: Row): number {
  return ROW_MAX[row] - board[row].length;
}

/** Average rank of cards in a row (0 if empty). */
function avgRank(cards: Card[]): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, c) => sum + c.rank, 0) / cards.length;
}

/** Count how many cards in the row share a rank with the given card. */
function pairCount(card: Card, rowCards: Card[]): number {
  return rowCards.filter((c) => c.rank === card.rank).length;
}

/** Count how many cards in the row share a suit with the given card. */
function suitCount(card: Card, rowCards: Card[]): number {
  return rowCards.filter((c) => c.suit === card.suit).length;
}

/**
 * Rough made-hand tier from rank multiplicity (works on partial rows), aligned
 * with HandRank ordering: high card 0, pair 1, two pair 2, trips 3, full house
 * 6, quads 7. A complete 5-card flush counts as 5. Straights/flush draws are
 * ignored — pairs in the wrong row are the dominant foul driver this guards.
 */
function madeTier(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const m = new Map<number, number>();
  for (const c of cards) m.set(c.rank, (m.get(c.rank) ?? 0) + 1);
  const counts = [...m.values()].sort((a, b) => b - a);
  const flush = cards.length === 5 && cards.every((c) => c.suit === cards[0].suit);
  let straight = false;
  if (cards.length === 5 && m.size === 5) {
    const r = [...m.keys()].sort((a, b) => a - b);
    straight = r[4] - r[0] === 4 || (r[0] === 2 && r[3] === 5 && r[4] === 14);
  }
  if (flush && straight) return 8;
  if (counts[0] >= 4) return 7;
  if (counts[0] === 3 && (counts[1] ?? 0) >= 2) return 6;
  if (flush) return 5;
  if (straight) return 4;
  if (counts[0] === 3) return 3;
  if (counts[0] === 2 && (counts[1] ?? 0) === 2) return 2;
  if (counts[0] === 2) return 1;
  return 0;
}

/**
 * Score a board state. Higher is better.
 * Rewards: high cards on bottom, low cards on top, pairs, flush draws.
 * Penalizes: row ordering violations (bottom avg < middle avg, etc.)
 */
function scoreBoard(board: Board): number {
  let score = 0;

  // --- Foul avoidance (the dominant term) ---
  // Once a board is complete, an actual foul is catastrophic (loses to every
  // opponent), so steer hard away from it. While rows are still filling, use
  // real hand comparison on any two already-complete adjacent rows so the bot
  // doesn't build a middle/top stronger than the row beneath it. Average rank
  // (below) is only a weak tiebreak — it does NOT reflect real hand strength.
  const bottomFull = board.bottom.length === FIVE_CARD_ROW_SIZE;
  const middleFull = board.middle.length === FIVE_CARD_ROW_SIZE;
  const topFull = board.top.length === TOP_ROW_SIZE;

  if (bottomFull && middleFull && topFull) {
    if (isFoul(board)) return -100000;
    score += 200; // a completed, legal board is the goal
  }
  // Bottom must be >= middle: if both complete and that's violated, near-fatal.
  if (bottomFull && middleFull && compareRows(board.bottom, board.middle, false) < 0) {
    score -= 5000;
  }

  const bottomAvg = avgRank(board.bottom);
  const middleAvg = avgRank(board.middle);
  const topAvg = avgRank(board.top);

  // Reward proper ordering (bottom > middle > top by average rank)
  if (bottomAvg > middleAvg) score += 20;
  if (middleAvg > topAvg) score += 20;

  // Penalize inversions
  if (board.bottom.length > 0 && board.middle.length > 0 && bottomAvg < middleAvg) {
    score -= 50;
  }
  if (board.middle.length > 0 && board.top.length > 0 && middleAvg < topAvg) {
    score -= 50;
  }

  // Made-hand tier ordering (the strong foul guard during building): a higher
  // row outranking a lower one in made-hand tier is a foul risk. Penalize
  // proportionally to how far it's inverted so the bot keeps strength low.
  const bTier = madeTier(board.bottom);
  const mTier = madeTier(board.middle);
  const tTier = madeTier(board.top);
  if (mTier > bTier) score -= 600 * (mTier - bTier);
  if (tTier > mTier) score -= 600 * (tTier - mTier);

  // Reward pairs/trips, but weighted by row so made hands gravitate DOWNWARD
  // (strength belongs in the bottom). Putting a pair in the middle/top while the
  // bottom stays high-card is the main way this bot used to foul.
  const ROW_MADE_WEIGHT: Record<Row, number> = { bottom: 1.6, middle: 0.7, top: 0.15 };
  for (const row of ROWS) {
    const cards = board[row];
    const rankMap = new Map<number, number>();
    for (const c of cards) {
      rankMap.set(c.rank, (rankMap.get(c.rank) ?? 0) + 1);
    }
    for (const count of rankMap.values()) {
      if (count >= 2) score += 15 * (count - 1) * ROW_MADE_WEIGHT[row];
    }
  }

  // Reward flush draws in 5-card rows
  for (const row of ['bottom', 'middle'] as Row[]) {
    const cards = board[row];
    if (cards.length >= 3) {
      const suitMap = new Map<string, number>();
      for (const c of cards) {
        suitMap.set(c.suit, (suitMap.get(c.suit) ?? 0) + 1);
      }
      const maxSuit = Math.max(...suitMap.values());
      if (maxSuit >= 4) score += 25;
      else if (maxSuit >= 3) score += 10;
    }
  }

  // Reward high cards on bottom, low on top
  score += board.bottom.reduce((s, c) => s + c.rank, 0) * 0.5;
  score -= board.top.reduce((s, c) => s + c.rank, 0) * 0.3;

  return score;
}

/** Clone a board. */
function cloneBoard(board: Board): Board {
  return {
    top: [...board.top],
    middle: [...board.middle],
    bottom: [...board.bottom],
  };
}

/**
 * Bot strategy for initial deal (5 cards, place all 5).
 *
 * Groups pairs first, then distributes by rank:
 * - Highest cards to bottom (2)
 * - Middle cards to middle (2)
 * - Lowest card to top (1)
 */
export function botPlaceInitialDeal(hand: Card[], board: Board): BotDecision {
  const sorted = [...hand].sort((a, b) => b.rank - a.rank);

  // Try to detect pairs and keep them together
  const pairs: Card[][] = [];
  const singles: Card[] = [];
  const used = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    let foundPair = false;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      if (sorted[i].rank === sorted[j].rank) {
        pairs.push([sorted[i], sorted[j]]);
        used.add(i);
        used.add(j);
        foundPair = true;
        break;
      }
    }
    if (!foundPair) {
      singles.push(sorted[i]);
      used.add(i);
    }
  }

  // Build candidate placements and pick the best
  const candidates: BotDecision[] = [];

  if (pairs.length >= 1) {
    // Try placing pair on bottom
    const remaining = pairs.length >= 2
      ? [...pairs[1], ...singles]
      : singles;
    const remainingSorted = remaining.sort((a, b) => b.rank - a.rank);

    const placements: BotPlacement[] = [
      { card: pairs[0][0], row: 'bottom' },
      { card: pairs[0][1], row: 'bottom' },
    ];

    // Fill middle (2 cards) and top (1 card) from remaining
    if (remainingSorted.length >= 3) {
      placements.push({ card: remainingSorted[0], row: 'middle' });
      placements.push({ card: remainingSorted[1], row: 'middle' });
      placements.push({ card: remainingSorted[2], row: 'top' });
    }
    if (placements.length === 5) {
      candidates.push({ placements });
    }

    // Also try pair on middle
    if (pairs.length >= 1) {
      const alt: BotPlacement[] = [];
      const altRemaining = [...singles, ...(pairs.length >= 2 ? pairs[1] : [])];
      const altSorted = altRemaining.sort((a, b) => b.rank - a.rank);

      alt.push({ card: pairs[0][0], row: 'middle' });
      alt.push({ card: pairs[0][1], row: 'middle' });
      if (altSorted.length >= 3) {
        alt.push({ card: altSorted[0], row: 'bottom' });
        alt.push({ card: altSorted[1], row: 'bottom' });
        alt.push({ card: altSorted[2], row: 'top' });
      }
      if (alt.length === 5) {
        candidates.push({ placements: alt });
      }
    }
  }

  // Default: simple rank-based distribution
  const defaultPlacements: BotPlacement[] = [
    { card: sorted[0], row: 'bottom' },
    { card: sorted[1], row: 'bottom' },
    { card: sorted[2], row: 'middle' },
    { card: sorted[3], row: 'middle' },
    { card: sorted[4], row: 'top' },
  ];
  candidates.push({ placements: defaultPlacements });

  // Score all candidates and pick the best
  let bestScore = -Infinity;
  let bestDecision = candidates[0];

  for (const candidate of candidates) {
    const testBoard = cloneBoard(board);
    for (const p of candidate.placements) {
      testBoard[p.row] = [...testBoard[p.row], p.card];
    }
    const s = scoreBoard(testBoard);
    if (s > bestScore) {
      bestScore = s;
      bestDecision = candidate;
    }
  }

  return bestDecision;
}

/**
 * Bot strategy for streets 2-5 (3 cards, place 2, discard 1).
 *
 * Brute-forces all valid (discard, row assignment) combinations
 * and picks the placement that scores highest.
 */
export function botPlaceStreet(hand: Card[], board: Board): BotDecision {
  let bestScore = -Infinity;
  let bestDecision: BotDecision | null = null;

  // Try each card as the discard
  for (let discardIdx = 0; discardIdx < hand.length; discardIdx++) {
    const discard = hand[discardIdx];
    const toPlace = hand.filter((_, i) => i !== discardIdx);

    // Try all row assignments for the 2 cards to place
    for (const rowA of ROWS) {
      if (rowSpace(board, rowA) < 1) continue;

      for (const rowB of ROWS) {
        // Check capacity: if same row, need 2 spaces
        if (rowA === rowB) {
          if (rowSpace(board, rowA) < 2) continue;
        } else {
          if (rowSpace(board, rowB) < 1) continue;
        }

        const testBoard = cloneBoard(board);
        testBoard[rowA] = [...testBoard[rowA], toPlace[0]];
        testBoard[rowB] = [...testBoard[rowB], toPlace[1]];

        const s = scoreBoard(testBoard);

        // Bonus for placing cards where they pair with existing cards
        const pairBonusA = pairCount(toPlace[0], board[rowA]) * 20;
        const pairBonusB = pairCount(toPlace[1], board[rowB]) * 20;

        // Bonus for flush draws
        const suitBonusA = (rowA !== 'top' && suitCount(toPlace[0], board[rowA]) >= 2) ? 10 : 0;
        const suitBonusB = (rowB !== 'top' && suitCount(toPlace[1], board[rowB]) >= 2) ? 10 : 0;

        const totalScore = s + pairBonusA + pairBonusB + suitBonusA + suitBonusB;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestDecision = {
            placements: [
              { card: toPlace[0], row: rowA },
              { card: toPlace[1], row: rowB },
            ],
            discard,
          };
        }
      }
    }
  }

  // Fallback: should never happen if board has space, but just in case
  if (!bestDecision) {
    const sorted = [...hand].sort((a, b) => b.rank - a.rank);
    const fallbackRows = ROWS.filter((r) => rowSpace(board, r) >= 1);
    return {
      placements: [
        { card: sorted[0], row: fallbackRows[0] || 'bottom' },
        { card: sorted[1], row: fallbackRows[1] || fallbackRows[0] || 'middle' },
      ],
      discard: sorted[2],
    };
  }

  return bestDecision;
}
