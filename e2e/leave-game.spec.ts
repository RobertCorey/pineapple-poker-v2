import { test, expect } from '@playwright/test';
import { placeInitialDeal, placeStreet } from './helpers/placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

test('player can leave mid-match and game continues for remaining player', async ({ browser }) => {
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

  // Wait for round 1 initial_deal
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  // --- Bob leaves during round 1 ---
  await bob.getByText('Leave').click();

  // Bob should return to room selector (create-room-button visible on the home screen)
  await bob.getByTestId('create-room-button').waitFor({ timeout: 10_000 });

  // --- Alice plays the round solo ---
  // Bob has been removed from playerOrder. Alice's placements will satisfy allPlaced.
  await placeInitialDeal(alice);

  // Game advances through streets (Alice is the only player)
  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    await placeStreet(alice, street);
  }

  // Round 1 results — Alice should see round results
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
  await expect(alice.getByTestId('round-results')).toContainText('Round 1 of 3 Complete');
  await expect(alice.getByTestId('round-results')).toContainText('Alice');

  // Close results
  await alice.getByTestId('close-results').click();

  // After reset, Alice is in Lobby with only 1 player — round 2 won't start.
  // App.tsx shows Lobby component when phase is 'lobby'.
  // Verify Alice sees the lobby UI (start-match-button visible since she's now host).
  await alice.getByTestId('start-match-button').waitFor({ timeout: 20_000 });

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
