import { describe, it, expect } from 'vitest';
import { Rank, Suit, HandRank } from '../core/types';
import type { Card } from '../core/types';
import { evaluate5CardHand } from './hand-evaluation';
import {
  evaluateRunRow,
  compareRunRows5,
  RUN_FIVE_OF_A_KIND,
  RUN_BOTTOM_ROYALTIES,
  RUN_MIDDLE_ROYALTIES,
} from './run-evaluation';

const c = (rank: number, suit: Suit): Card => ({ rank: rank as Card['rank'], suit });

describe('run-evaluation: five of a kind', () => {
  it('detects mixed-suit five of a kind', () => {
    const row = [
      c(Rank.Seven, Suit.Spades),
      c(Rank.Seven, Suit.Hearts),
      c(Rank.Seven, Suit.Diamonds),
      c(Rank.Seven, Suit.Clubs),
      c(Rank.Seven, Suit.Spades),
    ];
    const e = evaluateRunRow(row);
    expect(e.handRank).toBe(RUN_FIVE_OF_A_KIND);
    expect(e.kickers[0]).toBe(Rank.Seven);
  });

  it('detects five of a kind even when all one suit (would otherwise read as a flush)', () => {
    const row = Array.from({ length: 5 }, () => c(Rank.Ace, Suit.Hearts));
    expect(evaluateRunRow(row).handRank).toBe(RUN_FIVE_OF_A_KIND);
    // ...and the standard evaluator would have mis-called it a Flush:
    expect(evaluate5CardHand(row).handRank).toBe(HandRank.Flush);
  });

  it('five of a kind outranks a royal flush', () => {
    const fiveTwos = [
      c(Rank.Two, Suit.Spades),
      c(Rank.Two, Suit.Hearts),
      c(Rank.Two, Suit.Diamonds),
      c(Rank.Two, Suit.Clubs),
      c(Rank.Two, Suit.Spades),
    ];
    const royal = [
      c(Rank.Ace, Suit.Spades),
      c(Rank.King, Suit.Spades),
      c(Rank.Queen, Suit.Spades),
      c(Rank.Jack, Suit.Spades),
      c(Rank.Ten, Suit.Spades),
    ];
    expect(compareRunRows5(fiveTwos, royal)).toBe(1);
  });

  it('delegates to the standard evaluator for normal hands', () => {
    const royal = [
      c(Rank.Ace, Suit.Spades),
      c(Rank.King, Suit.Spades),
      c(Rank.Queen, Suit.Spades),
      c(Rank.Jack, Suit.Spades),
      c(Rank.Ten, Suit.Spades),
    ];
    expect(evaluateRunRow(royal).handRank).toBe(HandRank.RoyalFlush);

    const quads = [
      c(Rank.Nine, Suit.Spades),
      c(Rank.Nine, Suit.Hearts),
      c(Rank.Nine, Suit.Diamonds),
      c(Rank.Nine, Suit.Clubs),
      c(Rank.Two, Suit.Spades),
    ];
    expect(evaluateRunRow(quads).handRank).toBe(HandRank.FourOfAKind);
  });

  it('awards a royalty for five of a kind above the four-of-a-kind value', () => {
    expect(RUN_BOTTOM_ROYALTIES[RUN_FIVE_OF_A_KIND]).toBeGreaterThan(
      RUN_BOTTOM_ROYALTIES[HandRank.FourOfAKind],
    );
    expect(RUN_MIDDLE_ROYALTIES[RUN_FIVE_OF_A_KIND]).toBeGreaterThan(
      RUN_MIDDLE_ROYALTIES[HandRank.FourOfAKind],
    );
  });
});
