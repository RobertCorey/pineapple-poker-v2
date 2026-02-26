import { describe, it, expect } from 'vitest';
import { isFoul, scorePairwise, scoreAllPlayers, calculateRoyalties } from './scoring';
import { FOUL_PENALTY, SCOOP_BONUS } from '../core/constants';
import { Rank, Suit } from '../core/types';
import type { Board, Card } from '../core/types';

// -- Helpers --

function card(rank: Rank, suit: Suit = Suit.Spades): Card {
  return { rank, suit };
}

/** Build a valid (non-fouled) board: bottom > middle > top */
function validBoard(): Board {
  return {
    top: [
      card(Rank.Two, Suit.Spades),
      card(Rank.Three, Suit.Hearts),
      card(Rank.Four, Suit.Diamonds),
    ],
    middle: [
      card(Rank.Six, Suit.Spades),
      card(Rank.Six, Suit.Hearts),
      card(Rank.Seven, Suit.Diamonds),
      card(Rank.Eight, Suit.Clubs),
      card(Rank.Nine, Suit.Spades),
    ],
    bottom: [
      card(Rank.Ace, Suit.Spades),
      card(Rank.Ace, Suit.Hearts),
      card(Rank.King, Suit.Diamonds),
      card(Rank.King, Suit.Clubs),
      card(Rank.Queen, Suit.Spades),
    ],
  };
}

/** Build a fouled board: top stronger than middle */
function fouledBoard(): Board {
  return {
    top: [
      card(Rank.Ace, Suit.Spades),
      card(Rank.Ace, Suit.Hearts),
      card(Rank.Ace, Suit.Diamonds),
    ],
    middle: [
      card(Rank.Two, Suit.Spades),
      card(Rank.Three, Suit.Hearts),
      card(Rank.Four, Suit.Diamonds),
      card(Rank.Five, Suit.Clubs),
      card(Rank.Seven, Suit.Spades),
    ],
    bottom: [
      card(Rank.King, Suit.Spades),
      card(Rank.King, Suit.Hearts),
      card(Rank.King, Suit.Diamonds),
      card(Rank.King, Suit.Clubs),
      card(Rank.Queen, Suit.Spades),
    ],
  };
}

/** Build a second valid board that's weaker than validBoard */
function weakerValidBoard(): Board {
  return {
    top: [
      card(Rank.Two, Suit.Clubs),
      card(Rank.Three, Suit.Diamonds),
      card(Rank.Five, Suit.Hearts),
    ],
    middle: [
      card(Rank.Four, Suit.Spades),
      card(Rank.Four, Suit.Hearts),
      card(Rank.Six, Suit.Diamonds),
      card(Rank.Seven, Suit.Clubs),
      card(Rank.Eight, Suit.Hearts),
    ],
    bottom: [
      card(Rank.Jack, Suit.Spades),
      card(Rank.Jack, Suit.Hearts),
      card(Rank.Ten, Suit.Diamonds),
      card(Rank.Ten, Suit.Clubs),
      card(Rank.Nine, Suit.Spades),
    ],
  };
}

/** Build a board that beats validBoard on all 3 rows for scoop testing */
function strongBoard(): Board {
  return {
    top: [
      card(Rank.King, Suit.Spades),
      card(Rank.King, Suit.Hearts),
      card(Rank.Two, Suit.Diamonds),
    ],
    middle: [
      card(Rank.Ace, Suit.Spades),
      card(Rank.Ace, Suit.Hearts),
      card(Rank.Ace, Suit.Diamonds),
      card(Rank.Three, Suit.Clubs),
      card(Rank.Three, Suit.Spades),
    ],
    bottom: [
      card(Rank.Ace, Suit.Clubs),
      card(Rank.King, Suit.Diamonds),
      card(Rank.King, Suit.Clubs),
      card(Rank.Queen, Suit.Diamonds),
      card(Rank.Queen, Suit.Hearts),
    ],
  };
}

// ---- calculateRoyalties ----

describe('calculateRoyalties', () => {
  it('returns 0 for a weak board with no qualifying hands', () => {
    const r = calculateRoyalties(validBoard());
    expect(r).toEqual({ top: 0, middle: 0, bottom: 0, total: 0 });
  });

  it('returns 0 for incomplete board', () => {
    const incomplete: Board = { top: [card(Rank.Ace)], middle: [], bottom: [] };
    const r = calculateRoyalties(incomplete);
    expect(r).toEqual({ top: 0, middle: 0, bottom: 0, total: 0 });
  });

  it('scores top pair of Kings = 8', () => {
    const r = calculateRoyalties(strongBoard());
    expect(r.top).toBe(8);
  });

  it('scores top pair below 6s = 0', () => {
    const board: Board = {
      top: [card(Rank.Five), card(Rank.Five, Suit.Hearts), card(Rank.Two)],
      middle: validBoard().middle,
      bottom: validBoard().bottom,
    };
    expect(calculateRoyalties(board).top).toBe(0);
  });

  it('scores top trips (Aces = 22)', () => {
    const r = calculateRoyalties(fouledBoard());
    expect(r.top).toBe(22);
  });

  it('scores middle full house = 12', () => {
    const r = calculateRoyalties(strongBoard());
    expect(r.middle).toBe(12);
  });

  it('scores middle three of a kind = 2', () => {
    const board: Board = {
      top: [card(Rank.Two), card(Rank.Three, Suit.Hearts), card(Rank.Four, Suit.Diamonds)],
      middle: [
        card(Rank.Seven, Suit.Spades),
        card(Rank.Seven, Suit.Hearts),
        card(Rank.Seven, Suit.Diamonds),
        card(Rank.Eight, Suit.Clubs),
        card(Rank.Nine, Suit.Spades),
      ],
      bottom: validBoard().bottom,
    };
    expect(calculateRoyalties(board).middle).toBe(2);
  });

  it('scores bottom four of a kind = 10', () => {
    const r = calculateRoyalties(fouledBoard());
    expect(r.bottom).toBe(10);
  });

  it('scores bottom straight = 2', () => {
    const board: Board = {
      top: [card(Rank.Two), card(Rank.Three, Suit.Hearts), card(Rank.Four, Suit.Diamonds)],
      middle: validBoard().middle,
      bottom: [
        card(Rank.Ten, Suit.Spades),
        card(Rank.Jack, Suit.Hearts),
        card(Rank.Queen, Suit.Diamonds),
        card(Rank.King, Suit.Clubs),
        card(Rank.Ace, Suit.Spades),
      ],
    };
    expect(calculateRoyalties(board).bottom).toBe(2);
  });

  it('scores bottom flush = 4', () => {
    const board: Board = {
      top: [card(Rank.Two), card(Rank.Three, Suit.Hearts), card(Rank.Four, Suit.Diamonds)],
      middle: validBoard().middle,
      bottom: [
        card(Rank.Two, Suit.Hearts),
        card(Rank.Five, Suit.Hearts),
        card(Rank.Seven, Suit.Hearts),
        card(Rank.Nine, Suit.Hearts),
        card(Rank.Jack, Suit.Hearts),
      ],
    };
    expect(calculateRoyalties(board).bottom).toBe(4);
  });

  it('sums total correctly for strongBoard', () => {
    // top: pair Ks = 8, middle: full house = 12, bottom: two pair = 0
    const r = calculateRoyalties(strongBoard());
    expect(r.total).toBe(20);
  });
});

// ---- isFoul ----

describe('isFoul', () => {
  it('returns false for a valid board', () => {
    expect(isFoul(validBoard())).toBe(false);
  });

  it('returns true when top is stronger than middle', () => {
    expect(isFoul(fouledBoard())).toBe(true);
  });

  it('returns false for incomplete boards (game in progress)', () => {
    const incomplete: Board = {
      top: [card(Rank.Ace)],
      middle: [],
      bottom: [],
    };
    expect(isFoul(incomplete)).toBe(false);
  });

  it('returns false when top has fewer than 3 cards', () => {
    const board: Board = {
      top: [card(Rank.Ace), card(Rank.King)],
      middle: [card(Rank.Two), card(Rank.Three), card(Rank.Four), card(Rank.Five), card(Rank.Six)],
      bottom: [card(Rank.Seven), card(Rank.Eight), card(Rank.Nine), card(Rank.Ten), card(Rank.Jack)],
    };
    expect(isFoul(board)).toBe(false);
  });

  it('returns true when bottom is weaker than middle', () => {
    const board: Board = {
      top: [
        card(Rank.Two, Suit.Spades),
        card(Rank.Three, Suit.Hearts),
        card(Rank.Four, Suit.Diamonds),
      ],
      middle: [
        card(Rank.Ace, Suit.Spades),
        card(Rank.Ace, Suit.Hearts),
        card(Rank.King, Suit.Diamonds),
        card(Rank.King, Suit.Clubs),
        card(Rank.Queen, Suit.Spades),
      ],
      bottom: [
        card(Rank.Six, Suit.Spades),
        card(Rank.Six, Suit.Hearts),
        card(Rank.Seven, Suit.Diamonds),
        card(Rank.Eight, Suit.Clubs),
        card(Rank.Nine, Suit.Spades),
      ],
    };
    expect(isFoul(board)).toBe(true);
  });

  it('returns true when middle equals top (must be strictly greater)', () => {
    // Both have pair of 5s. Top kicker is King, middle highest non-pair kicker is also King.
    // Kicker comparison ties at min length → treated as equal → foul (must be strictly greater).
    const board: Board = {
      top: [
        card(Rank.Five, Suit.Spades),
        card(Rank.Five, Suit.Hearts),
        card(Rank.King, Suit.Diamonds),
      ],
      middle: [
        card(Rank.Five, Suit.Diamonds),
        card(Rank.Five, Suit.Clubs),
        card(Rank.King, Suit.Spades),
        card(Rank.Three, Suit.Hearts),
        card(Rank.Two, Suit.Diamonds),
      ],
      bottom: [
        card(Rank.Ace, Suit.Spades),
        card(Rank.Ace, Suit.Hearts),
        card(Rank.Ace, Suit.Diamonds),
        card(Rank.King, Suit.Clubs),
        card(Rank.Queen, Suit.Spades),
      ],
    };
    expect(isFoul(board)).toBe(true);
  });
});

// ---- scorePairwise ----

describe('scorePairwise', () => {
  it('both fouled: 0 points', () => {
    const board = validBoard();
    const result = scorePairwise('a', true, board, 'b', true, board);
    expect(result.total).toBe(0);
    expect(result.rowPoints).toBe(0);
    expect(result.scoopBonus).toBe(0);
    expect(result.royalties).toBe(0);
  });

  it('A fouled: A gets -FOUL_PENALTY, royalties 0', () => {
    const result = scorePairwise('a', true, validBoard(), 'b', false, validBoard());
    expect(result.total).toBe(-FOUL_PENALTY);
    expect(result.rowPoints).toBe(-FOUL_PENALTY);
    expect(result.scoopBonus).toBe(0);
    expect(result.royalties).toBe(0);
    expect(result.playerA).toBe('a');
    expect(result.playerB).toBe('b');
  });

  it('B fouled: A gets +FOUL_PENALTY, royalties 0', () => {
    const result = scorePairwise('a', false, validBoard(), 'b', true, validBoard());
    expect(result.total).toBe(FOUL_PENALTY);
    expect(result.rowPoints).toBe(FOUL_PENALTY);
    expect(result.royalties).toBe(0);
  });

  it('neither fouled, no royalties: row-by-row comparison', () => {
    const strong = validBoard();
    const weak = weakerValidBoard();
    const result = scorePairwise('a', false, strong, 'b', false, weak);
    // Both boards have 0 royalties
    expect(result.rowPoints).toBe(1);
    expect(result.scoopBonus).toBe(0);
    expect(result.royalties).toBe(0);
    expect(result.total).toBe(1);
  });

  it('scoop with royalties for winning all 3 rows', () => {
    const strong = strongBoard();    // royalties = 20
    const weak = weakerValidBoard(); // royalties = 0
    const result = scorePairwise('a', false, strong, 'b', false, weak);
    expect(result.scoopBonus).toBe(SCOOP_BONUS);
    expect(result.royalties).toBe(20);
    expect(result.total).toBe(result.rowPoints + SCOOP_BONUS + 20);
  });

  it('negative scoop and royalties when losing all 3 rows', () => {
    const strong = strongBoard();
    const weak = weakerValidBoard();
    const result = scorePairwise('b', false, weak, 'a', false, strong);
    expect(result.scoopBonus).toBe(-SCOOP_BONUS);
    expect(result.royalties).toBe(-20);
  });

  it('identical boards: 0 points including royalties', () => {
    const board = validBoard();
    const result = scorePairwise('a', false, board, 'b', false, board);
    expect(result.total).toBe(0);
    expect(result.rowPoints).toBe(0);
    expect(result.scoopBonus).toBe(0);
    expect(result.royalties).toBe(0);
  });

  it('fouled player with strong board gets royalties 0', () => {
    // strongBoard has 20 royalties, but fouled → royalties: 0
    const result = scorePairwise('a', true, strongBoard(), 'b', false, weakerValidBoard());
    expect(result.royalties).toBe(0);
    expect(result.total).toBe(-FOUL_PENALTY);
  });
});

// ---- scoreAllPlayers ----

describe('scoreAllPlayers', () => {
  it('scores two players correctly', () => {
    const boards = new Map<string, Board>();
    boards.set('a', validBoard());
    boards.set('b', weakerValidBoard());

    const fouls = new Map<string, boolean>();
    fouls.set('a', false);
    fouls.set('b', false);

    const result = scoreAllPlayers(boards, fouls);
    expect(result.players).toHaveLength(2);

    const playerA = result.players.find((p) => p.uid === 'a')!;
    const playerB = result.players.find((p) => p.uid === 'b')!;

    // Zero-sum: scores should be equal and opposite
    expect(playerA.netScore + playerB.netScore).toBe(0);
    expect(playerA.netScore).toBeGreaterThan(0);
  });

  it('scores three players correctly', () => {
    const boards = new Map<string, Board>();
    boards.set('a', strongBoard());
    boards.set('b', validBoard());
    boards.set('c', weakerValidBoard());

    const fouls = new Map<string, boolean>();
    fouls.set('a', false);
    fouls.set('b', false);
    fouls.set('c', false);

    const result = scoreAllPlayers(boards, fouls);
    expect(result.players).toHaveLength(3);

    // Sum of all scores should be 0 (zero-sum game)
    const totalScore = result.players.reduce((sum, p) => sum + p.netScore, 0);
    expect(totalScore).toBe(0);
  });

  it('handles fouled players', () => {
    const boards = new Map<string, Board>();
    boards.set('a', validBoard());
    boards.set('b', fouledBoard());

    const fouls = new Map<string, boolean>();
    fouls.set('a', false);
    fouls.set('b', true);

    const result = scoreAllPlayers(boards, fouls);
    const playerA = result.players.find((p) => p.uid === 'a')!;
    const playerB = result.players.find((p) => p.uid === 'b')!;

    expect(playerA.netScore).toBe(FOUL_PENALTY);
    expect(playerB.netScore).toBe(-FOUL_PENALTY);
    expect(playerB.fouled).toBe(true);
  });

  it('each player has pairwise results', () => {
    const boards = new Map<string, Board>();
    boards.set('a', validBoard());
    boards.set('b', weakerValidBoard());
    boards.set('c', strongBoard());

    const fouls = new Map<string, boolean>();
    fouls.set('a', false);
    fouls.set('b', false);
    fouls.set('c', false);

    const result = scoreAllPlayers(boards, fouls);
    // Each player plays against 2 opponents
    for (const player of result.players) {
      expect(player.pairwise).toHaveLength(2);
    }
  });

  it('pairwise results are properly inverted between players', () => {
    const boards = new Map<string, Board>();
    boards.set('a', validBoard());
    boards.set('b', weakerValidBoard());

    const fouls = new Map<string, boolean>();
    fouls.set('a', false);
    fouls.set('b', false);

    const result = scoreAllPlayers(boards, fouls);
    const playerA = result.players.find((p) => p.uid === 'a')!;
    const playerB = result.players.find((p) => p.uid === 'b')!;

    const aVsB = playerA.pairwise[0];
    const bVsA = playerB.pairwise[0];

    expect(aVsB.total).toBe(-bVsA.total);
    expect(aVsB.rowPoints).toBe(-bVsA.rowPoints);
    expect(aVsB.scoopBonus).toBe(-bVsA.scoopBonus);
    expect(aVsB.royalties).toBe(-bVsA.royalties);
  });
});
