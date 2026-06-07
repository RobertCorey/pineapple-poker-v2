import type { Card, Row, Board } from '@shared/core/types';

export interface Placement {
  card: Card;
  row: Row;
  /** Index into the dealt `hand` array. Stable per dealt card instance. */
  handIndex: number;
}

export function boardCardCount(board: Board): number {
  return board.top.length + board.middle.length + board.bottom.length;
}
