import type { Board } from '../core/types';
import { HandRank, Rank, ThreeCardHandRank } from '../core/types';
import { evaluate3CardHand, evaluate5CardHand } from './hand-evaluation';
import { isFoul } from './scoring';
import { BOARD_CARD_COUNT } from '../core/constants';

function boardComplete(board: Board): boolean {
  return board.top.length + board.middle.length + board.bottom.length === BOARD_CARD_COUNT;
}

/**
 * Entry: QQ or better on the top row (pair of queens+ or any trips) on a
 * complete, non-fouled board earns Fantasy Land for the next round.
 */
export function qualifiesForFantasyLand(board: Board): boolean {
  if (!boardComplete(board) || isFoul(board)) return false;
  const top = evaluate3CardHand(board.top);
  if (top.handRank === ThreeCardHandRank.ThreeOfAKind) return true;
  if (top.handRank === ThreeCardHandRank.Pair) {
    return top.kickers[0] >= Rank.Queen;
  }
  return false;
}

/**
 * Staying in: while in Fantasy Land, trips on top or quads-or-better on the
 * bottom (complete, non-fouled board) keeps you there next round.
 */
export function staysInFantasyLand(board: Board): boolean {
  if (!boardComplete(board) || isFoul(board)) return false;
  const top = evaluate3CardHand(board.top);
  if (top.handRank === ThreeCardHandRank.ThreeOfAKind) return true;
  const bottom = evaluate5CardHand(board.bottom);
  return bottom.handRank >= HandRank.FourOfAKind;
}
