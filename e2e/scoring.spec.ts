import { test, expect } from '@playwright/test';
import { placeInitialDeal, placeStreet } from './helpers/placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

test('scores are computed correctly after a full round', async ({ browser }) => {
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
  await alice.getByTestId('start-match-button').waitFor({ timeout: 30_000 });

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: 10_000 });

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // --- Round 1: both players play normally ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  await placeInitialDeal(alice);
  await placeInitialDeal(bob);

  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    await placeStreet(alice, street);
    await placeStreet(bob, street);
  }

  // Round 1 results
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
  await bob.getByTestId('round-results').waitFor({ timeout: 15_000 });

  const aliceResults = alice.getByTestId('round-results');
  await expect(aliceResults).toContainText('Round 1 of 3 Complete');

  // Pairwise section should exist
  await expect(aliceResults).toContainText('Pairwise');
  await expect(aliceResults).toContainText('vs');

  // Scores should be displayed (signed numbers)
  // One player wins what the other loses in pairwise scoring
  const resultsText = await aliceResults.textContent();
  expect(resultsText).toMatch(/[+-]\d+/);

  // Close results
  await alice.getByTestId('close-results').click();
  await bob.getByTestId('close-results').click();

  // --- Round 2: both play normally ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 20_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 20_000 });

  await placeInitialDeal(alice);
  await placeInitialDeal(bob);

  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    await placeStreet(alice, street);
    await placeStreet(bob, street);
  }

  // Round 2 results
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });

  const round2Results = alice.getByTestId('round-results');
  await expect(round2Results).toContainText('Round 2 of 3 Complete');

  // Verify cumulative totals
  await expect(round2Results).toContainText('Total');
  await expect(round2Results).toContainText('Round');
  await expect(round2Results).toContainText('Player');

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
