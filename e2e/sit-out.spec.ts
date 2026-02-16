import { test, expect, type Page } from '@playwright/test';
import { placeInitialDeal, placeStreet } from './helpers/placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

/**
 * Timeout E2E test: when a player times out, their cards are auto-placed.
 * In the next round, they are still active and can play normally.
 * Verifies cumulative scoring works across rounds.
 */

test('timed-out player gets auto-placed and is active in next round', async ({ browser }) => {
  // Increase timeout — we need to wait for a 30s timeout to expire
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

  // --- Round 1: Alice places, Bob times out on initial deal ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  await placeInitialDeal(alice);

  // Bob does NOT place — waits for 30s timeout, cards get auto-placed
  // After auto-placement, game advances to street_2
  await expect(alice.getByTestId('phase-label')).toContainText('street_2', { timeout: 45_000 });

  // Both players get cards for streets 2-5 (Bob's initial cards were auto-placed, not fouled)
  // Alice plays manually, Bob times out on each street (auto-placed)
  for (const street of [2, 3, 4, 5]) {
    if (street > 2) {
      await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 35_000 });
    }
    await placeStreet(alice, street);
    // Bob times out each street — cards auto-placed after deadline
  }

  // Round completes → results modal
  await alice.getByTestId('round-results').waitFor({ timeout: 45_000 });
  await bob.getByTestId('round-results').waitFor({ timeout: 15_000 });

  // Verify round results show up with round info
  await expect(alice.getByTestId('round-results')).toContainText('Round 1 of 3 Complete');

  // Close results
  await alice.getByTestId('close-results').click();
  await bob.getByTestId('close-results').click();

  // --- Round 2: Bob should be ACTIVE (not sitting out), both play ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 20_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 20_000 });

  // Bob should have cards — he's active this round
  await bob.getByTestId('hand-card-0').waitFor({ timeout: 10_000 });

  // Both players place normally
  await placeInitialDeal(alice);
  await placeInitialDeal(bob);

  // Advance through streets
  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    await placeStreet(alice, street);
    await placeStreet(bob, street);
  }

  // Round 2 results
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
  await expect(alice.getByTestId('round-results')).toContainText('Round 2 of 3 Complete');

  // Verify cumulative scores are displayed (Total column)
  await expect(alice.getByTestId('round-results')).toContainText('Total');

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
