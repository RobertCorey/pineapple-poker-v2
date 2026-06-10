import { test, expect, type Page } from '@playwright/test';
import { setupTwoPlayerGame } from './helpers/game-setup';
import { T_JOIN } from './helpers/timeouts';

/**
 * Drag-and-drop placement tests. Drag is touch-only (mouse/trackpad players
 * use tap-tap), so drags are driven with synthetic pointer events carrying
 * pointerType 'touch'. These exercise the drag path AND verify the tap path
 * still works around drags — pointer capture bugs are notorious for breaking
 * taps only after/around drags.
 */

const TOUCH = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true };

/** Drag a hand card to a point via synthetic touch pointer events, with
 *  enough intermediate moves to cross the in-app 8px drag threshold. */
async function touchDrag(page: Page, fromTestId: string, to: { x: number; y: number }) {
  const card = page.getByTestId(fromTestId);
  const box = (await card.boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await card.dispatchEvent('pointerdown', { ...TOUCH, buttons: 1, clientX: from.x, clientY: from.y });
  for (let i = 1; i <= 6; i++) {
    const x = from.x + ((to.x - from.x) * i) / 6;
    const y = from.y + ((to.y - from.y) * i) / 6;
    await card.dispatchEvent('pointermove', { ...TOUCH, buttons: 1, clientX: x, clientY: y });
  }
  await card.dispatchEvent('pointerup', { ...TOUCH, buttons: 0, clientX: to.x, clientY: to.y });
}

async function centerOf(page: Page, parentTestId: string, testId: string) {
  const box = (await page.getByTestId(parentTestId).getByTestId(testId).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('touch drag places a card, off-board drag cancels, mouse drag does not start, tap-tap works throughout', async ({ browser }) => {
  const { alice, cleanup } = await setupTwoPlayerGame(browser);

  await alice.getByTestId('start-match-button').click();
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await alice.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  const board = alice.getByTestId('my-board');
  const bottomRow = board.getByTestId('row-bottom');

  // --- Touch-drag a card onto the bottom row: it should be placed ---
  await touchDrag(alice, 'hand-card-0', await centerOf(alice, 'my-board', 'row-bottom'));
  await expect(bottomRow.locator('.select-none')).toHaveCount(1);
  await expect(alice.getByTestId('hand-card-3')).toBeVisible();
  await expect(alice.getByTestId('hand-card-4')).not.toBeVisible();

  // --- Touch drag released off-board: cancels, nothing placed, nothing lost ---
  await touchDrag(alice, 'hand-card-0', { x: 15, y: 15 });
  await expect(bottomRow.locator('.select-none')).toHaveCount(1);
  await expect(alice.getByTestId('hand-card-3')).toBeVisible();

  // --- Mouse drag must NOT start a drag (drag is touch-only): the gesture
  //     ends as a click on the card, which just selects it ---
  const cardBox = (await alice.getByTestId('hand-card-0').boundingBox())!;
  const rowMid = await centerOf(alice, 'my-board', 'row-middle');
  await alice.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(rowMid.x, rowMid.y, { steps: 10 });
  await alice.mouse.up();
  await expect(board.getByTestId('row-middle').locator('.select-none')).toHaveCount(0);
  await expect(alice.getByTestId('hand-card-3')).toBeVisible();

  // --- Tap-tap still works after drags (pointer-capture regression) ---
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();
  await expect(board.getByTestId('row-middle').locator('.select-none')).toHaveCount(1);
  await expect(alice.getByTestId('hand-card-2')).toBeVisible();
  await expect(alice.getByTestId('hand-card-3')).not.toBeVisible();

  // --- Mixed input finishing the deal: touch drag, then taps, auto-submit ---
  await touchDrag(alice, 'hand-card-0', await centerOf(alice, 'my-board', 'row-middle'));
  await expect(board.getByTestId('row-middle').locator('.select-none')).toHaveCount(2);

  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();

  // 5 placements -> auto-submit clears the hand
  await expect(alice.getByTestId('hand-card-0')).not.toBeVisible({ timeout: T_JOIN });

  await cleanup();
});
