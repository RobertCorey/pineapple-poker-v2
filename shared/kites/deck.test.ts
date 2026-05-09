import { describe, expect, it } from 'vitest';
import { createKitesDeck, dealKitesCards, shuffleKitesDeck } from './deck';
import { KITES_DECK_SIZE } from './constants';
import { validateFlipChoice } from './game-logic';

describe('kites deck', () => {
  it('builds a deck with the configured total card count', () => {
    const deck = createKitesDeck();
    expect(deck.length).toBe(KITES_DECK_SIZE);
  });

  it('has unique card ids', () => {
    const deck = createKitesDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });

  it('every card has 1 or 2 symbols', () => {
    for (const c of createKitesDeck()) {
      expect(c.symbols.length === 1 || c.symbols.length === 2).toBe(true);
    }
  });

  it('shuffle preserves cards', () => {
    const deck = createKitesDeck();
    const ids = new Set(deck.map((c) => c.id));
    const shuffled = shuffleKitesDeck([...deck]);
    expect(new Set(shuffled.map((c) => c.id))).toEqual(ids);
  });

  it('deal splits the deck correctly', () => {
    const deck = createKitesDeck();
    const { dealt, remaining } = dealKitesCards(deck, 5);
    expect(dealt.length).toBe(5);
    expect(remaining.length).toBe(deck.length - 5);
  });
});

describe('validateFlipChoice', () => {
  it('accepts matching color for single-symbol card', () => {
    expect(validateFlipChoice(['red'], ['red'])).toBeNull();
  });

  it('accepts white for single-symbol card', () => {
    expect(validateFlipChoice(['blue'], ['white'])).toBeNull();
  });

  it('rejects unrelated color for single-symbol card', () => {
    expect(validateFlipChoice(['red'], ['blue'])).not.toBeNull();
  });

  it('accepts both matching colors for double-symbol card', () => {
    expect(validateFlipChoice(['red', 'blue'], ['blue', 'red'])).toBeNull();
  });

  it('rejects white substitution for double-symbol card', () => {
    expect(validateFlipChoice(['red', 'blue'], ['red', 'white'])).not.toBeNull();
  });

  it('rejects wrong count', () => {
    expect(validateFlipChoice(['red'], ['red', 'red'])).not.toBeNull();
    expect(validateFlipChoice(['red', 'blue'], ['red'])).not.toBeNull();
  });
});
