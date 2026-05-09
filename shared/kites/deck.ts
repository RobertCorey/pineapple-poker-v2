import type { KitesCard, KitesCardColor } from './types';
import {
  KITES_DECK_SIZE,
  KITES_DOUBLE_COUNTS,
  KITES_SINGLE_COUNTS,
} from './constants';

/** Build the unshuffled 53-card deck. */
export function createKitesDeck(): KitesCard[] {
  const cards: KitesCard[] = [];
  let idx = 0;

  for (const [color, count] of Object.entries(KITES_SINGLE_COUNTS)) {
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `s-${color}-${i}`,
        symbols: [color as KitesCardColor],
      });
      idx++;
    }
  }

  for (const [pair, count] of Object.entries(KITES_DOUBLE_COUNTS)) {
    const [a, b] = pair.split('-') as [KitesCardColor, KitesCardColor];
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `d-${pair}-${i}`,
        symbols: [a, b],
      });
      idx++;
    }
  }

  if (cards.length !== KITES_DECK_SIZE) {
    throw new Error(
      `Kites deck size mismatch: expected ${KITES_DECK_SIZE}, got ${cards.length}`,
    );
  }
  void idx;
  return cards;
}

/** Fisher-Yates shuffle. Mutates the array and returns it for convenience. */
export function shuffleKitesDeck(cards: KitesCard[]): KitesCard[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Deal `n` cards from the top of the deck. Returns dealt + remaining. */
export function dealKitesCards(
  deck: KitesCard[],
  n: number,
): { dealt: KitesCard[]; remaining: KitesCard[] } {
  const safeN = Math.min(n, deck.length);
  return {
    dealt: deck.slice(0, safeN),
    remaining: deck.slice(safeN),
  };
}
