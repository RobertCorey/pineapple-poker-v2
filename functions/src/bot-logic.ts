import type { Card, Board, Row } from '../../shared/types';
import { TOP_ROW_SIZE, FIVE_CARD_ROW_SIZE } from '../../shared/constants';

/**
 * Simple heuristic bot for OFC Pineapple Poker.
 *
 * Strategy:
 * - Sort cards by rank (strength).
 * - Strongest cards go to the bottom row.
 * - Weakest cards go to the top row.
 * - Middle gets the rest.
 */

/** Placement instruction: which card goes where. */
export interface BotPlacement {
  card: Card;
  row: Row;
}

/** How many slots remain in each row. */
function rowSlots(board: Board): { top: number; middle: number; bottom: number } {
  return {
    top: TOP_ROW_SIZE - board.top.length,
    middle: FIVE_CARD_ROW_SIZE - board.middle.length,
    bottom: FIVE_CARD_ROW_SIZE - board.bottom.length,
  };
}

/** Sort cards by rank descending (strongest first). */
function sortByStrength(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => (b.rank as number) - (a.rank as number));
}

/**
 * Initial street: bot receives 5 cards, must place all 5.
 * Strategy: sort by strength, place 2 bottom, 2 middle, 1 top.
 */
export function botPlaceInitial(hand: Card[], board: Board): BotPlacement[] {
  const sorted = sortByStrength(hand);
  const slots = rowSlots(board);
  const placements: BotPlacement[] = [];

  // Strongest 2 to bottom (if room)
  const bottomCount = Math.min(2, slots.bottom);
  for (let i = 0; i < bottomCount; i++) {
    placements.push({ card: sorted[i], row: 'bottom' as Row });
  }

  // Next 2 to middle (if room)
  const middleCount = Math.min(2, slots.middle);
  for (let i = 0; i < middleCount; i++) {
    placements.push({ card: sorted[bottomCount + i], row: 'middle' as Row });
  }

  // Last 1 to top (if room)
  const topCount = Math.min(1, slots.top);
  for (let i = 0; i < topCount; i++) {
    placements.push({ card: sorted[bottomCount + middleCount + i], row: 'top' as Row });
  }

  return placements;
}

/**
 * Street 2-5: bot receives 3 cards, must place 2 and discard 1.
 * Strategy: pick the best 2 of 3, place in the row that needs cards most,
 * prioritizing bottom > middle > top with stronger cards going lower.
 */
export function botPlaceStreet(hand: Card[], board: Board): { placements: BotPlacement[]; discard: Card } {
  const sorted = sortByStrength(hand);
  const slots = rowSlots(board);

  // Discard the weakest card (last in sorted order)
  const discard = sorted[2];
  const toPlace = [sorted[0], sorted[1]];

  // Build a priority list of rows that need cards: bottom > middle > top
  const rowPriority: { row: Row; available: number }[] = [
    { row: 'bottom' as Row, available: slots.bottom },
    { row: 'middle' as Row, available: slots.middle },
    { row: 'top' as Row, available: slots.top },
  ].filter((r) => r.available > 0);

  const placements: BotPlacement[] = [];
  let cardIndex = 0;

  for (const rp of rowPriority) {
    if (cardIndex >= toPlace.length) break;
    const cardsForRow = Math.min(rp.available, toPlace.length - cardIndex);
    for (let i = 0; i < cardsForRow && cardIndex < toPlace.length; i++) {
      placements.push({ card: toPlace[cardIndex], row: rp.row });
      cardIndex++;
    }
  }

  return { placements, discard };
}
