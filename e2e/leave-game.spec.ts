import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame } from './helpers/game-setup';
import { placeInitialDeal, placeStreet } from './helpers/placement';
import { T_JOIN, T_PHASE } from './helpers/timeouts';

test('player can leave mid-match and game continues for remaining player', async ({ browser }) => {
  test.setTimeout(180_000);

  const { alice, bob, cleanup } = await setupTwoPlayerGame(browser);

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // Wait for round 1 initial_deal
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });

  // --- Bob leaves during round 1 ---
  await bob.getByText('Leave').click();

  // Bob should return to room selector
  await bob.getByTestId('create-room-button').waitFor({ timeout: T_JOIN });

  // --- Alice plays the round solo ---
  await placeInitialDeal(alice);

  // Game advances through streets (Alice is the only player)
  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: T_JOIN });
    await placeStreet(alice, street);
  }

  // Round 1 results
  await alice.getByTestId('round-results').waitFor({ timeout: T_JOIN });
  await expect(alice.getByTestId('round-results')).toContainText('Round 1 of 3 Complete');

  // Overlay auto-dismisses when next phase starts; wait for lobby
  await alice.getByTestId('start-match-button').waitFor({ timeout: T_PHASE });

  await cleanup();
});
