import { describe, it, expect } from 'vitest';
import { createShuffledDeck, dealCards } from '../../shared/game-logic/deck';
import { isFoul } from '../../shared/game-logic/scoring';
import { emptyBoard } from '../../shared/game-logic/board-utils';
import type { Board } from '../../shared/core/types';
import { botPlaceInitialDeal, botPlaceStreet } from './bot-strategy';

/** Play a full solo bot board from a fresh shuffled deck. */
function playBotGame(): Board {
  let deck = createShuffledDeck();
  const board = emptyBoard();
  const d = dealCards(deck, 5);
  deck = d.remaining;
  for (const p of botPlaceInitialDeal(d.dealt, board).placements) board[p.row].push(p.card);
  for (let s = 2; s <= 5; s++) {
    const dd = dealCards(deck, 3);
    deck = dd.remaining;
    for (const p of botPlaceStreet(dd.dealt, board).placements) board[p.row].push(p.card);
  }
  return board;
}

describe('bot strategy: foul rate', () => {
  it('completes valid (non-fouled) boards the large majority of the time', () => {
    // The naive avg-rank strategy fouled ~56% of games; the foul-aware
    // scoring brought it to ~11-12%. Bound generously above that to guard
    // against regressing toward the old behavior without flaking on variance.
    const N = 2000;
    let fouls = 0;
    for (let i = 0; i < N; i++) if (isFoul(playBotGame())) fouls++;
    const rate = fouls / N;
    expect(rate).toBeLessThan(0.18);
  });
});
