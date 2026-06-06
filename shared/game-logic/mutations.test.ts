import { describe, it, expect } from 'vitest';
import type { MutationPick } from '../core/types';
import {
  deckSizeAfter,
  rollMutationOptions,
  applyMutationsToDeck,
  MIN_DECK_SIZE,
} from './mutations';
import { createDeck } from './deck';

describe('deckSizeAfter (exact stacked sizing)', () => {
  it('cull halves a fresh deck', () => {
    expect(deckSizeAfter([], 'cull')).toBe(26);
  });

  it('counts stacked removals exactly: suit_purge + high_court + bottom_feeder = 15', () => {
    const owned: MutationPick[] = [{ id: 'suit_purge', target: 's' }, { id: 'high_court' }];
    // 52 -> remove spades 39 -> keep>=6 (9 ranks x 3 suits) 27 -> keep<=10 (ranks 6-10 x 3) 15
    expect(deckSizeAfter(owned, 'bottom_feeder')).toBe(15);
  });

  it('detects the mono_suit + suit_purge(same suit) empty-deck case (worst-case 0)', () => {
    const owned: MutationPick[] = [{ id: 'mono_suit', target: 'h' }];
    // every card is now a heart; purging hearts removes all 52 -> 0 in the worst case
    expect(deckSizeAfter(owned, 'suit_purge')).toBe(0);
  });
});

describe('rollMutationOptions (deck-size floor, no unsafe fallback)', () => {
  it('never offers a mutation that would shrink the deck below MIN_DECK_SIZE', () => {
    const owned: MutationPick[] = [{ id: 'cull', target: '1' }, { id: 'high_court' }];
    for (let i = 0; i < 300; i++) {
      const opts = rollMutationOptions(3, owned);
      for (const id of opts) {
        expect(deckSizeAfter(owned, id)).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
      }
    }
  });

  it('never re-offers an already-owned mutation and never duplicates within an offer', () => {
    const owned: MutationPick[] = [{ id: 'cull', target: '1' }];
    for (let i = 0; i < 300; i++) {
      const opts = rollMutationOptions(3, owned);
      expect(opts).not.toContain('cull');
      expect(new Set(opts).size).toBe(opts.length);
    }
  });

  it('any offered mutation, once picked, leaves a dealable deck', () => {
    const owned: MutationPick[] = [{ id: 'cull', target: '1' }];
    for (let i = 0; i < 100; i++) {
      const opts = rollMutationOptions(3, owned);
      for (const id of opts) {
        const deck = applyMutationsToDeck(createDeck(), [...owned, { id }]);
        expect(deck.length).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
      }
    }
  });
});
