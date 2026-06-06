/**
 * Charms = roguelike modifiers drafted between rounds in Pineapple Run mode.
 *
 * Each charm adds a flat bonus to its owner's net score during scoring,
 * based on properties of their final board. Charms stack across rounds
 * (cumulative — owning a charm applies its bonus every remaining round).
 *
 * Note: charm bonuses are added on top of pairwise scoring; they do NOT
 * affect the opponent's score. They are pure +EV for the owner.
 */
import type { Board, Card, CharmId } from '../core/types';
import { HandRank, ThreeCardHandRank, Rank } from '../core/types';
import {
  evaluate3CardHand,
  evaluate5CardHand,
} from './hand-evaluation';
import { isFoul } from './scoring';

export interface CharmDef {
  id: CharmId;
  name: string;
  emoji: string;
  description: string;
  /** Compute bonus points for this charm given the final board (assumes non-fouled). */
  bonus: (board: Board) => number;
  /** Special: if true, this charm reduces foul penalty (handled separately by caller). */
  foulShield?: number;
}

// ---- Helpers ----

function isFlush(cards: Card[]): boolean {
  if (cards.length < 2) return false;
  return cards.every((c) => c.suit === cards[0].suit);
}

function countPairsAcrossBoard(board: Board): number {
  // Count pairs in each row separately
  let pairs = 0;
  for (const row of [board.top, board.middle, board.bottom]) {
    const counts = new Map<number, number>();
    for (const c of row) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    for (const v of counts.values()) {
      if (v >= 2) pairs += Math.floor(v / 2);
    }
  }
  return pairs;
}

function countRankOnBoard(board: Board, rank: number): number {
  let n = 0;
  for (const row of [board.top, board.middle, board.bottom]) {
    for (const c of row) if (c.rank === rank) n++;
  }
  return n;
}

function rowHasTrips(cards: Card[]): boolean {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  for (const v of counts.values()) if (v >= 3) return true;
  return false;
}

function topIsPairOrBetter(board: Board): boolean {
  if (board.top.length !== 3) return false;
  return evaluate3CardHand(board.top).handRank !== ThreeCardHandRank.HighCard;
}

function middleIsTwoPairOrBetter(board: Board): boolean {
  if (board.middle.length !== 5) return false;
  return evaluate5CardHand(board.middle).handRank >= HandRank.TwoPair;
}

function bottomIsStraightOrBetter(board: Board): boolean {
  if (board.bottom.length !== 5) return false;
  return evaluate5CardHand(board.bottom).handRank >= HandRank.Straight;
}

function rowFlushes(board: Board): number {
  let n = 0;
  if (board.middle.length === 5 && isFlush(board.middle)) n++;
  if (board.bottom.length === 5 && isFlush(board.bottom)) n++;
  return n;
}

function rowStraights(board: Board): number {
  let n = 0;
  if (board.middle.length === 5) {
    const r = evaluate5CardHand(board.middle).handRank;
    if (r === HandRank.Straight || r === HandRank.StraightFlush) n++;
  }
  if (board.bottom.length === 5) {
    const r = evaluate5CardHand(board.bottom).handRank;
    if (r === HandRank.Straight || r === HandRank.StraightFlush) n++;
  }
  return n;
}

/** Returns true if any row contains all four ranks: J, Q, K, A. */
function hasRoyals(board: Board): boolean {
  const need = [Rank.Jack, Rank.Queen, Rank.King, Rank.Ace];
  for (const row of [board.middle, board.bottom]) {
    if (row.length < 4) continue;
    const ranks = new Set(row.map((c) => c.rank));
    if (need.every((r) => ranks.has(r))) return true;
  }
  return false;
}

// ---- Charm catalog ----

export const CHARMS: Record<CharmId, CharmDef> = {
  sharp_suits: {
    id: 'sharp_suits',
    name: 'Sharp Suits',
    emoji: '♠️',
    description: '+12 for each row that is a flush.',
    bonus: (b) => 12 * rowFlushes(b),
  },
  pair_pride: {
    id: 'pair_pride',
    name: 'Pair Pride',
    emoji: '👯',
    description: '+3 for each pair on your board.',
    bonus: (b) => 3 * countPairsAcrossBoard(b),
  },
  high_roller: {
    id: 'high_roller',
    name: 'High Roller',
    emoji: '🎩',
    description: '+15 if your top row is a pair or better.',
    bonus: (b) => (topIsPairOrBetter(b) ? 15 : 0),
  },
  brick_bottom: {
    id: 'brick_bottom',
    name: 'Brick Bottom',
    emoji: '🧱',
    description: '+15 if your bottom row is a straight or better.',
    bonus: (b) => (bottomIsStraightOrBetter(b) ? 15 : 0),
  },
  middle_mastery: {
    id: 'middle_mastery',
    name: 'Middle Mastery',
    emoji: '🎯',
    description: '+15 if your middle row is two pair or better.',
    bonus: (b) => (middleIsTwoPairOrBetter(b) ? 15 : 0),
  },
  lucky_sevens: {
    id: 'lucky_sevens',
    name: 'Lucky Sevens',
    emoji: '🍀',
    description: '+5 for each 7 on your board.',
    bonus: (b) => 5 * countRankOnBoard(b, Rank.Seven),
  },
  royal_touch: {
    id: 'royal_touch',
    name: 'Royal Touch',
    emoji: '👑',
    description: '+20 if any 5-card row contains J, Q, K and A.',
    bonus: (b) => (hasRoyals(b) ? 20 : 0),
  },
  threes_company: {
    id: 'threes_company',
    name: "Three's Company",
    emoji: '🎲',
    description: '+15 if any row contains three of a kind.',
    bonus: (b) => {
      if (rowHasTrips(b.top)) return 15;
      if (rowHasTrips(b.middle)) return 15;
      if (rowHasTrips(b.bottom)) return 15;
      return 0;
    },
  },
  straight_edge: {
    id: 'straight_edge',
    name: 'Straight Edge',
    emoji: '📏',
    description: '+12 for each row that is a straight or better.',
    bonus: (b) => 12 * rowStraights(b),
  },
  big_score: {
    id: 'big_score',
    name: 'Big Score',
    emoji: '💰',
    description: '+10 every round (skipped if you foul).',
    bonus: () => 10,
  },
  ace_collector: {
    id: 'ace_collector',
    name: 'Ace Collector',
    emoji: '🥇',
    description: '+5 for each Ace on your board.',
    bonus: (b) => 5 * countRankOnBoard(b, Rank.Ace),
  },
  foul_shield: {
    id: 'foul_shield',
    name: 'Foul Shield',
    emoji: '🛡️',
    description: 'Refunds the foul penalty per opponent — a foul costs you ~nothing (never a net gain).',
    bonus: () => 0,
    // Capped at FOUL_PENALTY by the scorer, so fouling is at worst neutral, not +EV.
    foulShield: 6,
  },
};

export const CHARM_IDS: CharmId[] = Object.keys(CHARMS);

/** Pick `count` random charm ids that are NOT already in `excluded`. */
export function rollCharmOptions(count: number, excluded: Set<CharmId>): CharmId[] {
  const pool = CHARM_IDS.filter((id) => !excluded.has(id));
  // If pool is too small (lots of charms already owned), allow duplicates from full set
  const source = pool.length >= count ? pool : CHARM_IDS;
  const out: CharmId[] = [];
  const taken = new Set<number>();
  while (out.length < count && taken.size < source.length) {
    const i = Math.floor(Math.random() * source.length);
    if (taken.has(i)) continue;
    taken.add(i);
    out.push(source[i]);
  }
  // Fallback: pad with random duplicates if we somehow can't fill
  while (out.length < count) {
    out.push(source[Math.floor(Math.random() * source.length)]);
  }
  return out;
}

/**
 * Sum a player's charm bonuses for a board WITHOUT any foul check. Callers that
 * already know the player's foul status (e.g. run-mode scoring, which uses
 * run-aware foul detection) should use this and gate on their own decision.
 */
export function rawCharmBonus(charms: CharmId[] | undefined, board: Board): number {
  if (!charms || charms.length === 0) return 0;
  let total = 0;
  for (const id of charms) {
    const def = CHARMS[id];
    if (def) total += def.bonus(board);
  }
  return total;
}

/** Total bonus from a player's owned charms — 0 if the board fouls (core check). */
export function applyCharmBonuses(charms: CharmId[] | undefined, board: Board): number {
  // Don't grant board-state bonuses to fouled players (they didn't make a valid hand).
  if (isFoul(board)) return 0;
  return rawCharmBonus(charms, board);
}

/** Total foul-penalty reduction from a player's foul-shield charms (per opponent). */
export function foulShieldReduction(charms: CharmId[] | undefined): number {
  if (!charms) return 0;
  let r = 0;
  for (const id of charms) {
    const def = CHARMS[id];
    if (def?.foulShield) r += def.foulShield;
  }
  return r;
}
