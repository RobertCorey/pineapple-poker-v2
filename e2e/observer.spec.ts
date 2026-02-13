import { test, expect } from '@playwright/test';
import { placeInitialDeal, placeStreet } from './helpers/placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

test('late joiner observes match then plays after play-again', async ({ browser }) => {
  test.setTimeout(300_000);

  const roomId = generateRoomCode();

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const ctx3 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();
  const carol = await ctx3.newPage();

  // --- Alice and Bob join, start match ---
  await alice.goto(`/?room=${roomId}`);
  await bob.goto(`/?room=${roomId}`);

  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();
  await alice.getByTestId('start-match-button').waitFor({ timeout: 30_000 });

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: 30_000 });

  await alice.getByTestId('start-match-button').click();

  // Wait for initial_deal to begin
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 30_000 });

  // --- Carol joins mid-round → becomes observer ---
  await carol.goto(`/?room=${roomId}`);
  await carol.getByTestId('name-input').fill('Carol');
  await carol.getByTestId('join-button').click();

  // Carol should see the observer banner
  await expect(carol.getByText('Observing')).toBeVisible({ timeout: 30_000 });

  // Carol should NOT have hand cards (observers don't get dealt in)
  await expect(carol.getByTestId('hand-card-0')).not.toBeVisible({ timeout: 3_000 });

  // --- Alice and Bob play all 3 rounds (Carol observes) ---
  for (let round = 1; round <= 3; round++) {
    await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 30_000 });
    await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 30_000 });

    await placeInitialDeal(alice);
    await placeInitialDeal(bob);

    for (const street of [2, 3, 4, 5]) {
      await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 30_000 });
      await expect(bob.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 30_000 });
      await placeStreet(alice, street);
      await placeStreet(bob, street);
    }

    if (round < 3) {
      // Inter-round results
      await alice.getByTestId('round-results').waitFor({ timeout: 30_000 });
      await bob.getByTestId('round-results').waitFor({ timeout: 30_000 });
      await alice.getByTestId('close-results').click();
      await bob.getByTestId('close-results').click();
    }
  }

  // Match complete
  await alice.getByTestId('match-results').waitFor({ timeout: 30_000 });
  await expect(alice.getByTestId('match-results')).toContainText('Match Complete');

  // Carol should still be observing during match results (no match-results modal for her,
  // as she wasn't in playerOrder — she'll see the game state but not the modal).
  // Carol sees "Observing" throughout the match.
  // The Watching: Carol text should have been visible on Alice/Bob's screens.

  // --- Host clicks Play Again → all players (including Carol) go to lobby ---
  await alice.getByTestId('play-again-button').click();

  // After playAgain, Carol is promoted into playerOrder. All 3 in lobby.
  await alice.getByTestId('start-match-button').waitFor({ timeout: 30_000 });
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: 30_000 });
  await expect(carol.getByText('Waiting for host to start')).toBeVisible({ timeout: 30_000 });

  // --- Start new match with 3 players ---
  await alice.getByTestId('start-match-button').click();

  // All 3 should be in initial_deal
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 30_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 30_000 });
  await expect(carol.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 30_000 });

  // Carol should NO LONGER see "Observing" banner
  await expect(carol.getByText('Observing')).not.toBeVisible({ timeout: 5_000 });

  // Carol should have hand cards now
  await carol.getByTestId('hand-card-0').waitFor({ timeout: 30_000 });

  // All 3 play round 1 of new match
  await placeInitialDeal(alice);
  await placeInitialDeal(bob);
  await placeInitialDeal(carol);

  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 30_000 });
    await placeStreet(alice, street);
    await placeStreet(bob, street);
    await placeStreet(carol, street);
  }

  // Round 1 results of new match — should show all 3 players
  await alice.getByTestId('round-results').waitFor({ timeout: 30_000 });
  await expect(alice.getByTestId('round-results')).toContainText('Round 1 of 3 Complete');
  await expect(alice.getByTestId('round-results')).toContainText('Alice');
  await expect(alice.getByTestId('round-results')).toContainText('Bob');
  await expect(alice.getByTestId('round-results')).toContainText('Carol');

  // Pairwise section should include "vs" for 3-player pairings
  await expect(alice.getByTestId('round-results')).toContainText('Pairwise');
  await expect(alice.getByTestId('round-results')).toContainText('vs');

  // Cleanup
  await ctx1.close();
  await ctx2.close();
  await ctx3.close();
});
