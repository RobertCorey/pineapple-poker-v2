import { test, expect } from '@playwright/test';

const PROJECT_ID = 'pineapple-poker-8f3';

test.beforeEach(async () => {
  await fetch(`http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
});

/**
 * Card placement UI tests: verifies that cards appear on the board when placed,
 * rows are clickable (not individual slots), no undo/confirm buttons,
 * and auto-discard/auto-submit work correctly.
 */

test('placed cards appear on board and auto-submit works', async ({ browser }) => {
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();

  // --- Both players join ---
  await alice.goto('/');
  await bob.goto('/');

  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();
  await alice.getByTestId('phase-label').waitFor({ timeout: 10_000 });

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await bob.getByTestId('phase-label').waitFor({ timeout: 10_000 });

  // Wait for initial_deal phase
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  const board = alice.getByTestId('my-board');

  // Wait for cards in hand
  await alice.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  // --- Verify: no confirm or undo buttons exist before placing ---
  await expect(alice.getByTestId('confirm-button')).not.toBeVisible();
  await expect(alice.getByTestId('undo-button')).not.toBeVisible();

  // --- Verify: row click targets exist ---
  await expect(board.getByTestId('row-top')).toBeVisible();
  await expect(board.getByTestId('row-middle')).toBeVisible();
  await expect(board.getByTestId('row-bottom')).toBeVisible();

  // --- Verify: card appears on board after placing ---
  // Count cards on board before placing (bottom row should have 0 white bg cards)
  const bottomRow = board.getByTestId('row-bottom');

  // Select first card and place on bottom row
  await alice.getByTestId('hand-card-0').click();
  await bottomRow.click();

  // Card should now appear on the board — the bottom row should contain a card element (bg-white)
  await expect(bottomRow.locator('.bg-white')).toHaveCount(1);

  // Card should be removed from hand (hand-card count decreased)
  // We started with 5 cards, now should have 4
  await expect(alice.getByTestId('hand-card-3')).toBeVisible();
  // 5th card (index 4) should no longer exist
  await expect(alice.getByTestId('hand-card-4')).not.toBeVisible();

  // --- Continue placing remaining cards to verify auto-submit ---
  // Card 0 → bottom row
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  // Card 0 → middle row
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // Card 0 → middle row
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // Card 0 → top row (5th placement — should auto-submit)
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();

  // After auto-submit, should show "Waiting for other players..." or "Submitting..."
  // (hand cards should be gone)
  await expect(alice.getByTestId('hand-card-0')).not.toBeVisible({ timeout: 5_000 });

  // --- No confirm button should have appeared at any point ---
  await expect(alice.getByTestId('confirm-button')).not.toBeVisible();

  // --- Bob places to advance game to street 2 ---
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await bob.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

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
  await expect(alice.getByTestId('phase-label')).toContainText('street_2', { timeout: 15_000 });
  await alice.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  // Should have 3 cards in hand
  await expect(alice.getByTestId('hand-card-0')).toBeVisible();
  await expect(alice.getByTestId('hand-card-1')).toBeVisible();
  await expect(alice.getByTestId('hand-card-2')).toBeVisible();

  // Place 2 cards — the 3rd should be auto-discarded and auto-submitted
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // After 2 placements, auto-submit should happen (no need to click discard or confirm)
  // Hand should be cleared
  await expect(alice.getByTestId('hand-card-0')).not.toBeVisible({ timeout: 5_000 });

  // No confirm or undo buttons
  await expect(alice.getByTestId('confirm-button')).not.toBeVisible();
  await expect(alice.getByTestId('undo-button')).not.toBeVisible();

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
