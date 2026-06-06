import type { Card, Row, Board } from '@shared/core/types';

export interface Placement {
  card: Card;
  row: Row;
  /**
   * Index into the dealt `hand` array. Stable per card instance, even when
   * mutations like Pair Party / Mono Suit / Spike produce hands with duplicate
   * (rank, suit) pairs that would otherwise collide on a plain rank+suit key.
   */
  handIndex: number;
}

export function boardCardCount(board: Board): number {
  return board.top.length + board.middle.length + board.bottom.length;
}
