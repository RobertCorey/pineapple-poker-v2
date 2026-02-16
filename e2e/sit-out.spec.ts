import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame, playFullRound } from './helpers/game-setup';
import { placeInitialDeal, placeStreet } from './helpers/placement';
import { T_JOIN, T_PHASE, T_GAME_TIMEOUT } from './helpers/timeouts';

/**
 * Timeout E2E test: when a player times out, their cards are auto-placed.
 * In the next round, they are still active and can play normally.
 * Verifies cumulative scoring works across rounds.
 */

test('timed-out player gets auto-placed and is active in next round', async ({ browser }) => {
  test.setTimeout(180_000);

  const { alice, bob, cleanup } = await setupTwoPlayerGame(browser);

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // --- Round 1: Alice places, Bob times out on initial deal ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_PHASE });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_PHASE });

  await placeInitialDeal(alice);

  // Bob does NOT place — waits for 30s timeout, cards get auto-placed
  await expect(alice.getByTestId('phase-label')).toContainText('street_2', { timeout: T_GAME_TIMEOUT });

  // Alice plays manually, Bob times out on each street (auto-placed)
  for (const street of [2, 3, 4, 5]) {
    if (street > 2) {
      await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: T_GAME_TIMEOUT });
    }
    await placeStreet(alice, street);
    // Bob times out each street — cards auto-placed after deadline
  }

  // Round completes -> results modal
  await alice.getByTestId('round-results').waitFor({ timeout: T_GAME_TIMEOUT });
  await bob.getByTestId('round-results').waitFor({ timeout: T_PHASE });

  // Verify round results show up with round info
  await expect(alice.getByTestId('round-results')).toContainText('Round 1 of 3 Complete');

  // Close results
  await alice.getByTestId('close-results').click();
  await bob.getByTestId('close-results').click();

  // --- Round 2: Bob should be ACTIVE (not sitting out), both play ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_PHASE });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_PHASE });

  // Bob should have cards — he's active this round
  await bob.getByTestId('hand-card-0').waitFor({ timeout: T_PHASE });

  // Both players place normally
  await playFullRound(alice, bob);

  // Round 2 results
  await alice.getByTestId('round-results').waitFor({ timeout: T_PHASE });
  await expect(alice.getByTestId('round-results')).toContainText('Round 2 of 3 Complete');

  // Verify cumulative scores are displayed (Total column)
  await expect(alice.getByTestId('round-results')).toContainText('Total');

  await cleanup();
});
