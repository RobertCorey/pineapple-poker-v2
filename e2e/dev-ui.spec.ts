import { test, expect } from '@playwright/test';
import { placeInitialDeal, placeStreet } from './helpers/placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

test('dev UI features render correctly', async ({ browser }) => {
  test.setTimeout(180_000);

  const roomId = generateRoomCode();

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();

  // --- Both players join ---
  await alice.goto(`/?room=${roomId}`);
  await bob.goto(`/?room=${roomId}`);

  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();
  await alice.getByTestId('start-match-button').waitFor({ timeout: 10_000 });

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: 10_000 });

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // Wait for initial_deal phase
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  // --- Debug panel should be visible by default ---
  await expect(alice.getByText('Debug')).toBeVisible();

  // Debug panel should contain game state info
  await expect(alice.getByText('initial_deal')).toBeVisible();
  await expect(alice.getByText('Alice')).toBeVisible();
  await expect(alice.getByText('Bob')).toBeVisible();

  // --- Toggle debug panel off ---
  await alice.getByText('[DBG]').click();
  // Debug panel header should disappear (the sidebar "Debug" text)
  // The phase-label still shows "initial_deal" in the header bar, so check the sidebar-specific text
  // DebugPanel has a table with "gameId" label — use that to verify panel is hidden
  await expect(alice.getByText('gameId')).not.toBeVisible({ timeout: 3_000 });

  // --- Toggle debug panel back on ---
  await alice.getByText('[DBG]').click();
  await expect(alice.getByText('gameId')).toBeVisible({ timeout: 3_000 });

  // --- Hand summary line should be visible ---
  await alice.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });
  await expect(alice.getByText('Hand:')).toBeVisible();

  // --- Play a full round to verify row evaluation labels ---
  await placeInitialDeal(alice);
  await placeInitialDeal(bob);

  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    await expect(bob.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    await placeStreet(alice, street);
    await placeStreet(bob, street);
  }

  // After round completes, boards are full — row evaluation labels should be visible
  // Wait for scoring/complete phase where boards are fully populated
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });

  // Check that at least one hand evaluation label is visible on Alice's page
  // These labels come from RowEval in PlayerBoard — they appear on completed boards
  const handLabels = [
    'Pair', 'High Card', 'Trips', 'Flush', 'Straight',
    'Two Pair', 'Full House', 'Quads', 'Str. Flush', 'Royal Flush',
  ];
  // At least one of these labels should be present on a completed board
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

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
