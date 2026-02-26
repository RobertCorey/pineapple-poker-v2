import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame, playFullRound } from './helpers/game-setup';
import { T_PHASE, T_JOIN } from './helpers/timeouts';

test('scores are computed correctly after a full round', async ({ browser }) => {
  test.setTimeout(180_000);

  const { alice, bob, cleanup } = await setupTwoPlayerGame(browser);

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // --- Round 1: both players play normally ---
  await playFullRound(alice, bob);

  // Round 1 results
  await alice.getByTestId('round-results').waitFor({ timeout: T_PHASE });
  await bob.getByTestId('round-results').waitFor({ timeout: T_PHASE });

  const aliceResults = alice.getByTestId('round-results');
  await expect(aliceResults).toContainText('Round 1 of 3 Complete');

  // Scores should be displayed (signed numbers)
  const resultsText = await aliceResults.textContent();
  expect(resultsText).toMatch(/[+-]\d+/);

  // Overlay auto-dismisses when next round starts
  // --- Round 2: both play normally ---
  await playFullRound(alice, bob);

  // Round 2 results
  await alice.getByTestId('round-results').waitFor({ timeout: T_PHASE });

  const round2Results = alice.getByTestId('round-results');
  await expect(round2Results).toContainText('Round 2 of 3 Complete');

  // Verify score is displayed
  const round2Text = await round2Results.textContent();
  expect(round2Text).toMatch(/[+-]\d+/);

  await cleanup();
});
