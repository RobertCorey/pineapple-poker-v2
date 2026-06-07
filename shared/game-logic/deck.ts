import { Rank, Suit } from '../core/types';
import type { Card } from '../core/types';

const SUITS: readonly string[] = [Suit.Clubs, Suit.Diamonds, Suit.Hearts, Suit.Spades];
const RANKS: readonly number[] = [
  Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven,
  Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace,
];

/** Create a standard 52-card deck (unshuffled). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit: suit as Card['suit'], rank: rank as Card['rank'] });
    }
  }
  return deck;
}

/** Shuffle an array in place using Fisher-Yates. Returns the same array. */
export function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Deal `count` cards from the top of the deck.
 * Returns { dealt, remaining } without mutating the input.
 */
export function dealCards(
  deck: Card[],
  count: number,
): { dealt: Card[]; remaining: Card[] } {
  if (count > deck.length) {
    throw new Error(`Cannot deal ${count} cards from deck of ${deck.length}`);
  }
  return {
    dealt: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

/** Create a fresh shuffled deck. */
export function createShuffledDeck(): Card[] {
  return shuffleDeck(createDeck());
}
