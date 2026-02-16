import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame, playFullRound } from './helpers/game-setup';
import { placeInitialDeal, placeStreet } from './helpers/placement';
import { T_JOIN, T_PHASE, T_UI } from './helpers/timeouts';

test('late joiner observes match then plays after play-again', async ({ browser }) => {
  test.setTimeout(300_000);

  const { alice, bob, roomId, cleanup: cleanupAB } = await setupTwoPlayerGame(browser);

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // Wait for initial_deal to begin
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });

  // --- Carol joins mid-round -> becomes observer ---
  const ctx3 = await browser.newContext();
  const carol = await ctx3.newPage();
  await carol.goto(`/?room=${roomId}`);
  await carol.getByTestId('name-input').fill('Carol');
  await carol.getByTestId('join-button').click();

  // Carol should see the observer banner
  await expect(carol.getByText('Observing')).toBeVisible({ timeout: T_JOIN });

  // Carol should NOT have hand cards (observers don't get dealt in)
  await expect(carol.getByTestId('hand-card-0')).not.toBeVisible({ timeout: T_UI });

  // --- Alice and Bob play all 3 rounds (Carol observes) ---
  for (let round = 1; round <= 3; round++) {
    await playFullRound(alice, bob);

    if (round < 3) {
      // Inter-round results
      await alice.getByTestId('round-results').waitFor({ timeout: T_JOIN });
      await bob.getByTestId('round-results').waitFor({ timeout: T_JOIN });
      // Overlay auto-dismisses when next round starts
    }
  }

  // Match complete
  await alice.getByTestId('match-results').waitFor({ timeout: T_JOIN });
  await expect(alice.getByTestId('match-results')).toContainText('Match Complete');

  // --- Host clicks Play Again -> all players (including Carol) go to lobby ---
  await alice.getByTestId('play-again-button').click();

  // After playAgain, Carol is promoted into playerOrder. All 3 in lobby.
  await alice.getByTestId('start-match-button').waitFor({ timeout: T_JOIN });
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: T_JOIN });
  await expect(carol.getByText('Waiting for host to start')).toBeVisible({ timeout: T_JOIN });

  // --- Start new match with 3 players ---
  await alice.getByTestId('start-match-button').click();

  // All 3 should be in initial_deal
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await expect(carol.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });

  // Carol should NO LONGER see "Observing" banner
  await expect(carol.getByText('Observing')).not.toBeVisible({ timeout: T_UI });

  // Carol should have hand cards now
  await carol.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  // All 3 play round 1 of new match
  await playFullRound(alice, bob, carol);

  // Round 1 results of new match — should show all 3 players
  await alice.getByTestId('round-results').waitFor({ timeout: T_JOIN });
  await expect(alice.getByTestId('round-results')).toContainText('Round 1 of 3 Complete');
  await expect(alice.getByTestId('round-results')).toContainText('Alice');
  await expect(alice.getByTestId('round-results')).toContainText('Bob');
  await expect(alice.getByTestId('round-results')).toContainText('Carol');

  await ctx3.close();
  await cleanupAB();
});
