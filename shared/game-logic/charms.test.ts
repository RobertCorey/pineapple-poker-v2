import { describe, it, expect } from 'vitest';
import { Rank, Suit } from '../core/types';
import type { Board, Card } from '../core/types';
import { CHARMS, foulShieldReduction } from './charms';

const c = (rank: number, suit: Suit): Card => ({ rank: rank as Card['rank'], suit });
const five = (rank: number): Card[] => [
  c(rank, Suit.Spades), c(rank, Suit.Hearts), c(rank, Suit.Diamonds),
  c(rank, Suit.Clubs), c(rank, Suit.Spades),
];

describe('charms: run-mode five-of-a-kind rows are credited', () => {
  it('middle_mastery (two-pair-or-better) fires for a five-of-a-kind middle', () => {
    const board: Board = { top: [], middle: five(Rank.Seven), bottom: [] };
    // Pre-fix this read as High Card via the core evaluator → 0.
    expect(CHARMS.middle_mastery.bonus(board)).toBe(15);
  });

  it('brick_bottom (straight-or-better) fires for a five-of-a-kind bottom', () => {
    const board: Board = { top: [], middle: [], bottom: five(Rank.Ace) };
    expect(CHARMS.brick_bottom.bonus(board)).toBe(15);
  });

  it('straight_edge does NOT count a five-of-a-kind as a straight', () => {
    const board: Board = { top: [], middle: five(Rank.Nine), bottom: [] };
    expect(CHARMS.straight_edge.bonus(board)).toBe(0);
  });
});

describe('charms: foul shield', () => {
  it('sums foul_shield reductions', () => {
    expect(foulShieldReduction(['foul_shield'])).toBe(6);
    expect(foulShieldReduction([])).toBe(0);
    expect(foulShieldReduction(['pair_pride'])).toBe(0);
  });
});
