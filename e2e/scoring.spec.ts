import { test, expect } from '@playwright/test';
import { placeInitialDeal, placeStreet } from './helpers/placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

test('scores are computed correctly after timeout foul', async ({ browser }) => {
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

  // --- Round 1: Alice plays, Bob times out ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  // Alice places cards normally
  await placeInitialDeal(alice);

  // Bob does NOT place — waits for timeout (30s initial deal)
  // After timeout, Bob is auto-fouled. Alice plays remaining streets solo.
  await expect(alice.getByTestId('phase-label')).toContainText('street_2', { timeout: 45_000 });

  for (const street of [2, 3, 4, 5]) {
    if (street > 2) {
      await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    }
    await placeStreet(alice, street);
  }

  // Round 1 results
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
  await bob.getByTestId('round-results').waitFor({ timeout: 15_000 });

  // Verify scores: Bob fouled = -6, Alice = +6
  const aliceResults = alice.getByTestId('round-results');
  await expect(aliceResults).toContainText('Round 1 of 3 Complete');

  // Bob should be marked as fouled
  await expect(aliceResults).toContainText('[FOULED]');

  // Verify score values: foul penalty = -6 for Bob, +6 for Alice
  // The round column shows netScore per player
  await expect(aliceResults).toContainText('+6');
  await expect(aliceResults).toContainText('-6');

  // Pairwise section should show foul penalty
  await expect(aliceResults).toContainText('foul penalty');

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

  // Verify cumulative totals: Total column exists
  await expect(round2Results).toContainText('Total');

  // Alice's cumulative total should be >= +6 (she won +6 in round 1)
  // Bob's cumulative total should be <= -6 (he lost -6 in round 1)
  // We can't predict round 2 scores (random cards), but we can verify the format
  // Both players' Total column should have signed numbers
  // The table has "Round" and "Total" headers — verify both columns present
  await expect(round2Results).toContainText('Round');
  await expect(round2Results).toContainText('Player');

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
