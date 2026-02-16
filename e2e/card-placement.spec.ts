import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame } from './helpers/game-setup';
import { T_JOIN, T_PHASE, T_UI } from './helpers/timeouts';

/**
 * Card placement UI tests: verifies that cards appear on the board when placed,
 * rows are clickable (not individual slots), no undo/confirm buttons,
 * and auto-discard/auto-submit work correctly.
 */

test('placed cards appear on board and auto-submit works', async ({ browser }) => {
  const { alice, bob, cleanup } = await setupTwoPlayerGame(browser);

  // Host starts match
  await alice.getByTestId('start-match-button').click();

  // Wait for initial_deal phase
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });

  const board = alice.getByTestId('my-board');

  // Wait for cards in hand
  await alice.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  // --- Verify: no confirm or undo buttons exist before placing ---
  await expect(alice.getByTestId('confirm-button')).not.toBeVisible();
  await expect(alice.getByTestId('undo-button')).not.toBeVisible();

  // --- Verify: row click targets exist ---
  await expect(board.getByTestId('row-top')).toBeVisible();
  await expect(board.getByTestId('row-middle')).toBeVisible();
  await expect(board.getByTestId('row-bottom')).toBeVisible();

  // --- Verify: card appears on board after placing ---
  const bottomRow = board.getByTestId('row-bottom');

  // Select first card and place on bottom row
  await alice.getByTestId('hand-card-0').click();
  await bottomRow.click();

  // Card should now appear on the board (select-none is on all face-up cards, not empty slots)
  await expect(bottomRow.locator('.select-none')).toHaveCount(1);

  // Card should be removed from hand (hand-card count decreased)
  // We started with 5 cards, now should have 4
  await expect(alice.getByTestId('hand-card-3')).toBeVisible();
  // 5th card (index 4) should no longer exist
  await expect(alice.getByTestId('hand-card-4')).not.toBeVisible();

  // --- Continue placing remaining cards to verify auto-submit ---
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // 5th placement -> auto-submit
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();

  // After auto-submit, hand cards should be gone
  await expect(alice.getByTestId('hand-card-0')).not.toBeVisible({ timeout: T_UI });

  // No confirm button should have appeared
  await expect(alice.getByTestId('confirm-button')).not.toBeVisible();

  // --- Bob places to advance game to street 2 ---
  await bob.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  const bobBoard = bob.getByTestId('my-board');
  for (let i = 0; i < 2; i++) {
    await bob.getByTestId('hand-card-0').click();
    await bobBoard.getByTestId('row-bottom').click();
  }
  for (let i = 0; i < 2; i++) {
    await bob.getByTestId('hand-card-0').click();
    await bobBoard.getByTestId('row-middle').click();
  }
  await bob.getByTestId('hand-card-0').click();
  await bobBoard.getByTestId('row-top').click();

  // --- Street 2: verify auto-discard (3 cards dealt, place 2, 3rd auto-discarded) ---
  await expect(alice.getByTestId('phase-label')).toContainText('street_2', { timeout: T_PHASE });
  await alice.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  // Should have 3 cards in hand
  await expect(alice.getByTestId('hand-card-0')).toBeVisible();
  await expect(alice.getByTestId('hand-card-1')).toBeVisible();
  await expect(alice.getByTestId('hand-card-2')).toBeVisible();

  // Place 2 cards — the 3rd should be auto-discarded and auto-submitted
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // After 2 placements, auto-submit should happen
  await expect(alice.getByTestId('hand-card-0')).not.toBeVisible({ timeout: T_UI });

  // No confirm or undo buttons
  await expect(alice.getByTestId('confirm-button')).not.toBeVisible();
  await expect(alice.getByTestId('undo-button')).not.toBeVisible();

  await cleanup();
});
