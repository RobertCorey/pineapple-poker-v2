import { test, expect, type Page } from '@playwright/test';
import { setupTwoPlayerGame } from './helpers/game-setup';
import { T_JOIN } from './helpers/timeouts';

/**
 * Drag-and-drop placement tests. The hand supports two input styles on the
 * same cards: tap-to-select → tap-row, and drag-onto-row. These exercise the
 * drag path AND verify the tap path still works in the same session — pointer
 * capture bugs are notorious for breaking taps only after/around drags.
 */

/** Drag from the center of one locator to the center of another with enough
 *  intermediate moves to cross the in-app 8px drag threshold. */
async function dragTo(page: Page, fromTestId: string, to: { x: number; y: number }) {
  const from = page.getByTestId(fromTestId);
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
}

async function centerOf(page: Page, parentTestId: string, testId: string) {
  const box = (await page.getByTestId(parentTestId).getByTestId(testId).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('drag places a card, off-board drag cancels, tap-tap still works after drags', async ({ browser }) => {
  const { alice, cleanup } = await setupTwoPlayerGame(browser);

  await alice.getByTestId('start-match-button').click();
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await alice.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  const board = alice.getByTestId('my-board');
  const bottomRow = board.getByTestId('row-bottom');

  // --- Drag a card onto the bottom row: it should be placed ---
  await dragTo(alice, 'hand-card-0', await centerOf(alice, 'my-board', 'row-bottom'));
  await expect(bottomRow.locator('.select-none')).toHaveCount(1);
  await expect(alice.getByTestId('hand-card-3')).toBeVisible();
  await expect(alice.getByTestId('hand-card-4')).not.toBeVisible();

  // --- Drag released off-board: cancels, nothing placed, nothing lost ---
  await dragTo(alice, 'hand-card-0', { x: 15, y: 15 });
  await expect(bottomRow.locator('.select-none')).toHaveCount(1);
  await expect(alice.getByTestId('hand-card-3')).toBeVisible();

  // --- Tap-tap still works after dragging (pointer-capture regression) ---
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();
  await expect(board.getByTestId('row-middle').locator('.select-none')).toHaveCount(1);
  await expect(alice.getByTestId('hand-card-2')).toBeVisible();
  await expect(alice.getByTestId('hand-card-3')).not.toBeVisible();

  // --- Mixed input finishing the deal: drag, then taps, auto-submit ---
  await dragTo(alice, 'hand-card-0', await centerOf(alice, 'my-board', 'row-middle'));
  await expect(board.getByTestId('row-middle').locator('.select-none')).toHaveCount(2);

  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();

  // 5 placements -> auto-submit clears the hand
  await expect(alice.getByTestId('hand-card-0')).not.toBeVisible({ timeout: T_JOIN });

  await cleanup();
});
