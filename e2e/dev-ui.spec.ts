import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame, playFullRound } from './helpers/game-setup';
import { T_PHASE, T_UI } from './helpers/timeouts';

test('dev UI features render correctly', async ({ browser }) => {
  test.setTimeout(180_000);

  const { alice, bob, cleanup } = await setupTwoPlayerGame(browser);

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // Wait for initial_deal phase
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_PHASE });

  // --- Debug panel starts closed ---
  await expect(alice.getByText('gameId')).not.toBeVisible({ timeout: T_UI });

  // --- Toggle debug panel on ---
  await alice.getByText('[DBG]').click();
  await expect(alice.getByText('Debug')).toBeVisible();

  // Debug panel should contain game state info
  await expect(alice.getByText('initial_deal').first()).toBeVisible();
  await expect(alice.getByText('Alice').first()).toBeVisible();
  await expect(alice.getByText('Bob').first()).toBeVisible();
  await expect(alice.getByText('gameId')).toBeVisible({ timeout: T_UI });

  // --- Toggle debug panel off ---
  await alice.getByText('[DBG]').click();
  await expect(alice.getByText('gameId')).not.toBeVisible({ timeout: T_UI });

  // --- Toggle debug panel back on ---
  await alice.getByText('[DBG]').click();
  await expect(alice.getByText('gameId')).toBeVisible({ timeout: T_UI });

  // Wait for cards to be dealt
  await alice.getByTestId('hand-card-0').waitFor({ timeout: T_PHASE });

  // --- Play a full round to verify row evaluation labels ---
  await playFullRound(alice, bob);

  // After round completes, boards are full — row evaluation labels should be visible
  await alice.getByTestId('round-results').waitFor({ timeout: T_PHASE });

  // Check that at least one hand evaluation label is visible on Alice's page
  const handLabels = [
    'Pair', 'High Card', 'Trips', 'Flush', 'Straight',
    'Two Pair', 'Full House', 'Quads', 'Str. Flush', 'Royal Flush',
  ];
  const labelVisible = await Promise.any(
    handLabels.map(async (label) => {
      const found = await alice.getByText(label, { exact: false }).first().isVisible().catch(() => false);
      return found ? label : Promise.reject('not found');
    })
  ).catch(() => null);
  expect(labelVisible).not.toBeNull();

  // --- Round results modal should contain pairwise breakdown ---
  const results = alice.getByTestId('round-results');
  await expect(results).toContainText('Pairwise');
  await expect(results).toContainText('vs');

  await cleanup();
});
