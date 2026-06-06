/**
 * Pineapple Run hand evaluation — FORKED from the core evaluator.
 *
 * Run-mode deck mutations (Pair Party, Ace Rush, Spike, Royal Inflation) can put
 * 5+ cards of the SAME rank in one row — impossible in standard poker. To keep
 * the core engine (shared with Classic) pure, that "five of a kind" tier lives
 * HERE, not in core `HandRank`.
 *
 * IMPORTANT: this file is run-mode only. Classic-mode code must never import it.
 * Everything except five-of-a-kind delegates to the standard evaluator —
 * duplicate-card flushes, straights, quads, pairs, etc. already evaluate
 * sensibly there, so we deliberately do not re-implement them.
 */
import type { Card, HandEvaluation } from '../core/types';
import { BOTTOM_ROYALTIES, MIDDLE_ROYALTIES } from '../core/constants';
import { evaluate5CardHand, compareHands } from './hand-evaluation';

/** One tier above RoyalFlush (9). Run-mode only — deliberately NOT in core HandRank. */
export const RUN_FIVE_OF_A_KIND = 10;

/** A widened evaluation whose handRank may be the run-only five-of-a-kind tier. */
export type RunHandEvaluation = { handRank: number; kickers: number[] };

/** Run-mode royalties: standard table plus a five-of-a-kind entry. */
export const RUN_BOTTOM_ROYALTIES: Record<number, number> = {
  ...BOTTOM_ROYALTIES,
  [RUN_FIVE_OF_A_KIND]: 30,
};
export const RUN_MIDDLE_ROYALTIES: Record<number, number> = {
  ...MIDDLE_ROYALTIES,
  [RUN_FIVE_OF_A_KIND]: 60,
};

/** Returns the rank that appears 5+ times in `cards`, or null. */
function fiveOfAKindRank(cards: Card[]): number | null {
  const counts = new Map<number, number>();
  for (const c of cards) {
    const n = (counts.get(c.rank) ?? 0) + 1;
    counts.set(c.rank, n);
    if (n >= 5) return c.rank;
  }
  return null;
}

/**
 * Evaluate a 5-card row in run mode: recognizes five-of-a-kind (checked before
 * anything else so a mono-suit five doesn't read as a Flush and a mixed-suit
 * five doesn't fall through to High Card), otherwise the standard evaluation.
 */
export function evaluateRunRow(cards: Card[]): RunHandEvaluation {
  if (cards.length === 5) {
    const five = fiveOfAKindRank(cards);
    if (five !== null) {
      return { handRank: RUN_FIVE_OF_A_KIND, kickers: [five] };
    }
  }
  return evaluate5CardHand(cards) as RunHandEvaluation;
}

/** Compare two 5-card run-mode rows. 1 if A wins, -1 if B wins, 0 tie. */
export function compareRunRows5(a: Card[], b: Card[]): -1 | 0 | 1 {
  return compareHands(evaluateRunRow(a), evaluateRunRow(b));
}

/** Wrap a HandEvaluation as a RunHandEvaluation (no-op widening). */
export function asRun(e: HandEvaluation): RunHandEvaluation {
  return e;
}
