import type { Card, Row, Board } from '@shared/core/types';
import { INITIAL_DEAL_COUNT, STREET_PLACE_COUNT } from '@shared/core/constants';

export interface Placement {
  card: Card;
  row: Row;
  /**
   * Index into the dealt `hand` array. Stable per card instance, even when
   * mutations like Pair Party / Mono Suit / Spike produce hands with duplicate
   * (rank, suit) pairs that would collide on cardKey.
   */
  handIndex: number;
}

/**
 * Identifier used for React keys / multiset display only. NOT unique across a
 * single hand once the deck contains duplicates (run-mode mutations). Use the
 * handIndex on a Placement when you need to identify a specific dealt card.
 */
export function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

export function boardCardCount(board: Board): number {
  return board.top.length + board.middle.length + board.bottom.length;
}

/** Total cards expected on the board after the given street. */
export function expectedCardsForStreet(street: number): number {
  if (street === 1) return INITIAL_DEAL_COUNT;
  return INITIAL_DEAL_COUNT + STREET_PLACE_COUNT * (street - 1);
}
