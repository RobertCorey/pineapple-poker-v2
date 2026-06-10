import { describe, it, expect } from 'vitest';
import { qualifiesForFantasyLand, staysInFantasyLand } from './fantasy-land';
import { Rank, Suit } from '../core/types';
import type { Board, Card } from '../core/types';

// -- Helpers --

function card(rank: Rank, suit: Suit = Suit.Spades): Card {
  return { rank, suit };
}

/** Valid board with a configurable top pair; mid/bottom strong enough to never foul. */
function boardWithTopPair(pairRank: Rank): Board {
  return {
    top: [card(pairRank, Suit.Spades), card(pairRank, Suit.Hearts), card(Rank.Two, Suit.Diamonds)],
    middle: [
      // Full house — beats any top pair
      card(Rank.Nine, Suit.Spades), card(Rank.Nine, Suit.Hearts), card(Rank.Nine, Suit.Diamonds),
      card(Rank.Four, Suit.Clubs), card(Rank.Four, Suit.Spades),
    ],
    bottom: [
      // Quads — beats the full house
      card(Rank.King, Suit.Spades), card(Rank.King, Suit.Hearts),
      card(Rank.King, Suit.Diamonds), card(Rank.King, Suit.Clubs),
      card(Rank.Three, Suit.Spades),
    ],
  };
}

/** Valid board with trips on top (and stronger mid/bottom). */
function boardWithTopTrips(): Board {
  return {
    top: [card(Rank.Five, Suit.Spades), card(Rank.Five, Suit.Hearts), card(Rank.Five, Suit.Diamonds)],
    middle: [
      card(Rank.Nine, Suit.Spades), card(Rank.Nine, Suit.Hearts), card(Rank.Nine, Suit.Diamonds),
      card(Rank.Four, Suit.Clubs), card(Rank.Four, Suit.Spades),
    ],
    bottom: [
      card(Rank.King, Suit.Spades), card(Rank.King, Suit.Hearts),
      card(Rank.King, Suit.Diamonds), card(Rank.King, Suit.Clubs),
      card(Rank.Three, Suit.Spades),
    ],
  };
}

/** Plain valid board: no top pair, full house bottom. */
function plainBoard(): Board {
  return {
    top: [card(Rank.Two, Suit.Spades), card(Rank.Five, Suit.Hearts), card(Rank.Seven, Suit.Diamonds)],
    middle: [
      card(Rank.Ten, Suit.Spades), card(Rank.Ten, Suit.Hearts),
      card(Rank.Six, Suit.Diamonds), card(Rank.Seven, Suit.Clubs), card(Rank.Two, Suit.Hearts),
    ],
    bottom: [
      card(Rank.Ace, Suit.Spades), card(Rank.Ace, Suit.Hearts), card(Rank.Ace, Suit.Diamonds),
      card(Rank.Four, Suit.Clubs), card(Rank.Four, Suit.Spades),
    ],
  };
}

describe('qualifiesForFantasyLand', () => {
  it('QQ on top qualifies', () => {
    expect(qualifiesForFantasyLand(boardWithTopPair(Rank.Queen))).toBe(true);
  });

  it('KK and AA on top qualify', () => {
    expect(qualifiesForFantasyLand(boardWithTopPair(Rank.King))).toBe(true);
    expect(qualifiesForFantasyLand(boardWithTopPair(Rank.Ace))).toBe(true);
  });

  it('JJ on top does NOT qualify (boundary)', () => {
    expect(qualifiesForFantasyLand(boardWithTopPair(Rank.Jack))).toBe(false);
  });

  it('trips on top qualifies', () => {
    expect(qualifiesForFantasyLand(boardWithTopTrips())).toBe(true);
  });

  it('no pair on top does not qualify', () => {
    expect(qualifiesForFantasyLand(plainBoard())).toBe(false);
  });

  it('fouled board never qualifies, even with AA on top', () => {
    const board = boardWithTopPair(Rank.Ace);
    // Weaken the middle below the top pair → foul
    board.middle = [
      card(Rank.Three, Suit.Spades), card(Rank.Four, Suit.Hearts),
      card(Rank.Six, Suit.Diamonds), card(Rank.Seven, Suit.Clubs), card(Rank.Nine, Suit.Clubs),
    ];
    expect(qualifiesForFantasyLand(board)).toBe(false);
  });

  it('incomplete board does not qualify', () => {
    const board = boardWithTopPair(Rank.Queen);
    board.bottom = board.bottom.slice(0, 4);
    expect(qualifiesForFantasyLand(board)).toBe(false);
  });
});

describe('staysInFantasyLand', () => {
  it('trips on top stays', () => {
    expect(staysInFantasyLand(boardWithTopTrips())).toBe(true);
  });

  it('quads on bottom stays', () => {
    expect(staysInFantasyLand(boardWithTopPair(Rank.Two))).toBe(true); // bottom is quads
  });

  it('straight flush on bottom stays', () => {
    const board = plainBoard();
    board.bottom = [
      card(Rank.Five, Suit.Hearts), card(Rank.Six, Suit.Hearts), card(Rank.Seven, Suit.Hearts),
      card(Rank.Eight, Suit.Hearts), card(Rank.Nine, Suit.Hearts),
    ];
    expect(staysInFantasyLand(board)).toBe(true);
  });

  it('QQ on top does NOT stay (entry bar ≠ stay bar)', () => {
    const board = boardWithTopPair(Rank.Queen);
    // Replace quads bottom with a full house so only the top pair matters
    board.bottom = [
      card(Rank.Ace, Suit.Spades), card(Rank.Ace, Suit.Hearts), card(Rank.Ace, Suit.Diamonds),
      card(Rank.Three, Suit.Clubs), card(Rank.Three, Suit.Hearts),
    ];
    expect(staysInFantasyLand(board)).toBe(false);
  });

  it('full house on bottom does not stay', () => {
    expect(staysInFantasyLand(plainBoard())).toBe(false);
  });
});
