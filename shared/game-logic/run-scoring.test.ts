import { describe, it, expect } from 'vitest';
import { Rank, Suit } from '../core/types';
import type { Board, Card } from '../core/types';
import { isFoul } from './scoring';
import { isRunFoul, scoreRunPlayers } from './run-scoring';

const c = (rank: number, suit: Suit): Card => ({ rank: rank as Card['rank'], suit });
const five = (rank: number): Card[] => [
  c(rank, Suit.Spades), c(rank, Suit.Hearts), c(rank, Suit.Diamonds),
  c(rank, Suit.Clubs), c(rank, Suit.Spades),
];

// A clearly non-fouling board: quad bottom > two-pair middle > pair top.
const validBoard = (): Board => ({
  top: [c(Rank.Five, Suit.Diamonds), c(Rank.Five, Suit.Hearts), c(Rank.Six, Suit.Clubs)],
  middle: [c(Rank.Three, Suit.Clubs), c(Rank.Three, Suit.Diamonds), c(Rank.Four, Suit.Clubs), c(Rank.Four, Suit.Diamonds), c(Rank.Nine, Suit.Spades)],
  bottom: [c(Rank.Two, Suit.Clubs), c(Rank.Two, Suit.Diamonds), c(Rank.Two, Suit.Hearts), c(Rank.Two, Suit.Spades), c(Rank.King, Suit.Clubs)],
});

describe('run-scoring: isRunFoul', () => {
  it('does NOT foul a board whose bottom is a five-of-a-kind (which the core engine wrongly fouls)', () => {
    const board: Board = {
      top: [c(Rank.Queen, Suit.Spades), c(Rank.Queen, Suit.Hearts), c(Rank.Queen, Suit.Diamonds)], // trips
      middle: [c(Rank.King, Suit.Spades), c(Rank.King, Suit.Hearts), c(Rank.King, Suit.Diamonds), c(Rank.King, Suit.Clubs), c(Rank.Two, Suit.Spades)], // quads
      bottom: five(Rank.Ace), // five of a kind
    };
    expect(isRunFoul(board)).toBe(false);
    // The core (classic) evaluator can't see five-of-a-kind, so it mis-fouls it:
    expect(isFoul(board)).toBe(true);
  });

  it('still fouls a genuinely mis-ordered board', () => {
    const board: Board = {
      top: [c(Rank.Ace, Suit.Spades), c(Rank.Ace, Suit.Hearts), c(Rank.Ace, Suit.Diamonds)], // trip aces (strong top)
      middle: [c(Rank.Two, Suit.Clubs), c(Rank.Three, Suit.Diamonds), c(Rank.Five, Suit.Clubs), c(Rank.Seven, Suit.Diamonds), c(Rank.Nine, Suit.Spades)], // high card
      bottom: [c(Rank.Two, Suit.Spades), c(Rank.Three, Suit.Spades), c(Rank.Five, Suit.Hearts), c(Rank.Seven, Suit.Hearts), c(Rank.Ten, Suit.Hearts)], // high card
    };
    expect(isRunFoul(board)).toBe(true);
  });
});

describe('run-scoring: scoreRunPlayers', () => {
  it('caps Foul Shield so an intentional foul nets 0, not a gain', () => {
    const boards = new Map<string, Board>([
      ['A', validBoard()],
      ['B', validBoard()],
    ]);
    const declared = new Map<string, boolean>([['A', true], ['B', false]]); // A timed out
    const res = scoreRunPlayers(boards, declared, { A: ['foul_shield'], B: [] });
    // A: -6 pairwise + min(6,6)*1 penalizing opponent = 0 (NOT +4)
    expect(res.netScores.A).toBe(0);
    // B penalized the fouler: +6
    expect(res.netScores.B).toBe(6);
    expect(res.fouled.A).toBe(true);
  });

  it('does not refund a foul shield against an opponent who also fouled', () => {
    const boards = new Map<string, Board>([['A', validBoard()], ['B', validBoard()]]);
    const declared = new Map<string, boolean>([['A', true], ['B', true]]); // both fouled
    const res = scoreRunPlayers(boards, declared, { A: ['foul_shield'], B: [] });
    // both fouled => pairwise 0, and no penalizing (non-fouled) opponents to refund
    expect(res.netScores.A).toBe(0);
    expect(res.netScores.B).toBe(0);
  });

  it('adds charm bonuses for non-fouled players', () => {
    const boards = new Map<string, Board>([['A', validBoard()], ['B', validBoard()]]);
    const declared = new Map<string, boolean>([['A', false], ['B', false]]);
    const res = scoreRunPlayers(boards, declared, { A: ['big_score'], B: [] }); // big_score = flat +10
    // Equal boards => pairwise tie; A gets +10 charm, B gets 0.
    expect(res.netScores.A).toBe(10);
    expect(res.netScores.B).toBe(0);
    expect(res.charmBonuses.A).toBe(10);
  });
});
