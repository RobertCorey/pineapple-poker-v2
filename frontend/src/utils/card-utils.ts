import type { Card, Row, Board } from '@shared/core/types';
import { INITIAL_DEAL_COUNT, STREET_PLACE_COUNT } from '@shared/core/constants';

export interface Placement {
  card: Card;
  row: Row;
}

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
