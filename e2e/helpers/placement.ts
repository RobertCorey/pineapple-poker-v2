import type { Page } from '@playwright/test';

/** Place cards for initial deal: 2 bottom, 2 middle, 1 top. Auto-submits. */
export async function placeInitialDeal(page: Page) {
  const board = page.getByTestId('my-board');

  // Wait for cards to appear in hand
  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  // Card 0 → bottom row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  // Card 0 (was card 1) → bottom row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  // Card 0 (was card 2) → middle row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // Card 0 (was card 3) → middle row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // Card 0 (was card 4) → top row — auto-submits after this placement
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();
}

/**
 * Place cards for streets 2-5: place 2 cards into rows, 3rd auto-discarded, auto-submits.
 * Placement strategy varies by street to fill the board correctly:
 *   Street 2: bottom, middle  → +1 bottom, +1 middle
 *   Street 3: bottom, middle  → +1 bottom, +1 middle
 *   Street 4: bottom, top     → +1 bottom, +1 top
 *   Street 5: middle, top     → +1 middle, +1 top
 * Final board: bottom=5, middle=5, top=3
 */
export async function placeStreet(page: Page, street: number) {
  const board = page.getByTestId('my-board');

  // Wait for 3 cards in hand
  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  // Choose which rows to place into based on street number
  let row1: string, row2: string;

  switch (street) {
    case 2:
      row1 = 'bottom'; row2 = 'middle';
      break;
    case 3:
      row1 = 'bottom'; row2 = 'middle';
      break;
    case 4:
      row1 = 'bottom'; row2 = 'top';
      break;
    case 5:
      row1 = 'middle'; row2 = 'top';
      break;
    default:
      throw new Error(`Unexpected street ${street}`);
  }

  // Place card 0 → row1
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row1}`).click();

  // Place card 0 (was card 1) → row2 — auto-submits (3rd card auto-discarded)
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row2}`).click();
}
