import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame, playFullRound } from './helpers/game-setup';
import { T_JOIN } from './helpers/timeouts';

test('two players play a full 3-round match', async ({ browser }) => {
  test.setTimeout(180_000);

  const { alice, bob, cleanup } = await setupTwoPlayerGame(browser);

  // --- Host starts the match ---
  await alice.getByTestId('start-match-button').click();

  // --- Play 3 rounds ---
  for (let round = 1; round <= 3; round++) {
    await playFullRound(alice, bob);

    if (round < 3) {
      // Inter-round: round results modal appears
      await alice.getByTestId('round-results').waitFor({ timeout: T_JOIN });
      await bob.getByTestId('round-results').waitFor({ timeout: T_JOIN });

      // Verify round results header
      await expect(alice.getByTestId('round-results')).toContainText(`Round ${round} of 3 Complete`);

      // Wait for overlay to auto-dismiss when next round starts
    } else {
      // After round 3: match-results modal
      await alice.getByTestId('match-results').waitFor({ timeout: T_JOIN });
      await bob.getByTestId('match-results').waitFor({ timeout: T_JOIN });

      // Verify match results
      await expect(alice.getByTestId('match-results')).toContainText('Match Complete');
      await expect(alice.getByTestId('match-results')).toContainText('Alice');
      await expect(alice.getByTestId('match-results')).toContainText('Bob');
    }
  }

  // --- Host clicks Play Again -> back to lobby ---
  await alice.getByTestId('play-again-button').click();

  // Both should be back in lobby
  await alice.getByTestId('start-match-button').waitFor({ timeout: T_JOIN });
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: T_JOIN });

  await cleanup();
});
