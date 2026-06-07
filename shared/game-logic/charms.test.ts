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

describe('charms: new run-mode content', () => {
  it('full_boat awards 25 for a full house row', () => {
    const board: Board = {
      top: [],
      middle: [],
      bottom: [c(Rank.Seven, Suit.Spades), c(Rank.Seven, Suit.Hearts), c(Rank.Seven, Suit.Diamonds), c(Rank.King, Suit.Spades), c(Rank.King, Suit.Hearts)],
    };
    expect(CHARMS.full_boat.bonus(board)).toBe(25);
  });

  it('quad_squad awards 40 for a four-of-a-kind row, full_boat also fires', () => {
    const board: Board = {
      top: [],
      middle: [],
      bottom: [c(Rank.Nine, Suit.Spades), c(Rank.Nine, Suit.Hearts), c(Rank.Nine, Suit.Diamonds), c(Rank.Nine, Suit.Clubs), c(Rank.Two, Suit.Spades)],
    };
    expect(CHARMS.quad_squad.bonus(board)).toBe(40);
    expect(CHARMS.full_boat.bonus(board)).toBe(25); // quads >= full house
  });

  it('low_baller awards +2 per card ranked 5 or lower', () => {
    const board: Board = {
      top: [c(Rank.Two, Suit.Spades), c(Rank.Three, Suit.Hearts), c(Rank.Four, Suit.Diamonds)],
      middle: [c(Rank.Five, Suit.Spades), c(Rank.Five, Suit.Hearts), c(Rank.King, Suit.Diamonds), c(Rank.Ace, Suit.Spades), c(Rank.Queen, Suit.Clubs)],
      bottom: [],
    };
    // ≤5 cards: 2,3,4,5,5 = 5 → 10
    expect(CHARMS.low_baller.bonus(board)).toBe(10);
  });
});
