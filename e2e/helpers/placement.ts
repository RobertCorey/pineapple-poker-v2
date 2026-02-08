import type { Page } from '@playwright/test';

/** Place cards for initial deal: 2 bottom, 2 middle, 1 top */
export async function placeInitialDeal(page: Page) {
  const board = page.getByTestId('my-board');

  // Wait for cards to appear in hand
  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  // Card 0 → bottom slot 0
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-bottom-0').click();

  // Card 0 (was card 1) → bottom slot 1
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-bottom-1').click();

  // Card 0 (was card 2) → middle slot 0
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-middle-0').click();

  // Card 0 (was card 3) → middle slot 1
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-middle-1').click();

  // Card 0 (was card 4) → top slot 0
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-top-0').click();

  // Click confirm
  await page.getByTestId('confirm-button').click();
}

/**
 * Place cards for streets 2-5: place 2 cards, discard 1, confirm.
 * Placement strategy varies by street to fill the board correctly:
 *   Street 2: bottom(2), middle(2)  → +1 bottom, +1 middle
 *   Street 3: bottom(3), middle(3)  → +1 bottom, +1 middle
 *   Street 4: bottom(4), top(1)     → +1 bottom, +1 top
 *   Street 5: middle(4), top(2)     → +1 middle, +1 top
 * Final board: bottom=5, middle=5, top=3
 */
export async function placeStreet(page: Page, street: number) {
  const board = page.getByTestId('my-board');

  // Wait for 3 cards in hand
  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  // Choose which rows to place into based on street number
  let row1: string, row2: string;
  let slotIndex1: number, slotIndex2: number;

  switch (street) {
    case 2:
      row1 = 'bottom'; slotIndex1 = 2;
      row2 = 'middle'; slotIndex2 = 2;
      break;
    case 3:
      row1 = 'bottom'; slotIndex1 = 3;
      row2 = 'middle'; slotIndex2 = 3;
      break;
    case 4:
      row1 = 'bottom'; slotIndex1 = 4;
      row2 = 'top'; slotIndex2 = 1;
      break;
    case 5:
      row1 = 'middle'; slotIndex1 = 4;
      row2 = 'top'; slotIndex2 = 2;
      break;
    default:
      throw new Error(`Unexpected street ${street}`);
  }

  // Place card 0 → row1
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`slot-${row1}-${slotIndex1}`).click();

  // Place card 0 (was card 1) → row2
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`slot-${row2}-${slotIndex2}`).click();

  // Remaining card (index 0) becomes the discard — click it to mark
  await page.getByTestId('hand-card-0').click();

  // Confirm
  await page.getByTestId('confirm-button').click();
}
