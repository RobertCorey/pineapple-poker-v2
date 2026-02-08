import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, dealCards, createShuffledDeck } from './deck';
import { Suit, Rank } from '../core/types';
import type { Card } from '../core/types';

describe('createDeck', () => {
  it('creates a 52-card deck', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
  });

  it('contains all 4 suits', () => {
    const deck = createDeck();
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits).toEqual(new Set([Suit.Clubs, Suit.Diamonds, Suit.Hearts, Suit.Spades]));
  });

  it('contains all 13 ranks', () => {
    const deck = createDeck();
    const ranks = new Set(deck.map((c) => c.rank));
    expect(ranks.size).toBe(13);
    expect(ranks).toContain(Rank.Two);
    expect(ranks).toContain(Rank.Ace);
  });

  it('has no duplicate cards', () => {
    const deck = createDeck();
    const keys = deck.map((c) => `${c.suit}${c.rank}`);
    expect(new Set(keys).size).toBe(52);
  });

  it('returns a new array each time', () => {
    const a = createDeck();
    const b = createDeck();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('shuffleDeck', () => {
  it('returns the same array reference (in-place)', () => {
    const deck = createDeck();
    const result = shuffleDeck(deck);
    expect(result).toBe(deck);
  });

  it('preserves all 52 cards', () => {
    const deck = createDeck();
    shuffleDeck(deck);
    expect(deck).toHaveLength(52);
    const keys = deck.map((c) => `${c.suit}${c.rank}`);
    expect(new Set(keys).size).toBe(52);
  });

  it('changes card ordering (statistical)', () => {
    // Shuffle many times and check that at least some orderings differ
    const original = createDeck();
    const originalKeys = original.map((c) => `${c.suit}${c.rank}`).join(',');

    let differentCount = 0;
    for (let i = 0; i < 5; i++) {
      const deck = createDeck();
      shuffleDeck(deck);
      const keys = deck.map((c) => `${c.suit}${c.rank}`).join(',');
      if (keys !== originalKeys) differentCount++;
    }
    // Extremely unlikely all 5 shuffles produce the same order
    expect(differentCount).toBeGreaterThan(0);
  });
});

describe('dealCards', () => {
  it('deals the correct number of cards', () => {
    const deck = createDeck();
    const { dealt, remaining } = dealCards(deck, 5);
    expect(dealt).toHaveLength(5);
    expect(remaining).toHaveLength(47);
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const originalLength = deck.length;
    dealCards(deck, 5);
    expect(deck).toHaveLength(originalLength);
  });

  it('deals from the top of the deck', () => {
    const deck = createDeck();
    const { dealt } = dealCards(deck, 3);
    expect(dealt).toEqual(deck.slice(0, 3));
  });

  it('remaining is the rest of the deck', () => {
    const deck = createDeck();
    const { remaining } = dealCards(deck, 3);
    expect(remaining).toEqual(deck.slice(3));
  });

  it('deals all cards when count equals deck size', () => {
    const deck = createDeck();
    const { dealt, remaining } = dealCards(deck, 52);
    expect(dealt).toHaveLength(52);
    expect(remaining).toHaveLength(0);
  });

  it('deals zero cards', () => {
    const deck = createDeck();
    const { dealt, remaining } = dealCards(deck, 0);
    expect(dealt).toHaveLength(0);
    expect(remaining).toHaveLength(52);
  });

  it('throws when trying to deal more cards than available', () => {
    const deck = createDeck();
    expect(() => dealCards(deck, 53)).toThrow('Cannot deal 53 cards from deck of 52');
  });
});

describe('createShuffledDeck', () => {
  it('returns a 52-card deck', () => {
    const deck = createShuffledDeck();
    expect(deck).toHaveLength(52);
  });

  it('contains all unique cards', () => {
    const deck = createShuffledDeck();
    const keys = deck.map((c) => `${c.suit}${c.rank}`);
    expect(new Set(keys).size).toBe(52);
  });
});
