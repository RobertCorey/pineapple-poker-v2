import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame } from './helpers/game-setup';
import { T_JOIN } from './helpers/timeouts';

test('a placed card can be taken back before submit', async ({ browser }) => {
  test.setTimeout(180_000);
  const { alice, cleanup } = await setupTwoPlayerGame(browser);

  await alice.getByTestId('start-match-button').click();
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await alice.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  // row-* test-ids exist on every board (mine + opponents) — scope to my board.
  const board = alice.getByTestId('my-board');

  // Place the first hand card into the bottom row.
  await alice.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  // It shows up as a takeable-back pending card, and the hand drops to 4 cards.
  await expect(board.getByTestId('pending-bottom-0')).toBeVisible({ timeout: T_JOIN });
  await expect(alice.getByTestId('hand-card-4')).toHaveCount(0);

  // Take it back.
  await board.getByTestId('pending-bottom-0').click();

  // Pending marker is gone and the card is back in hand (5 cards again).
  await expect(board.getByTestId('pending-bottom-0')).toHaveCount(0);
  await expect(alice.getByTestId('hand-card-4')).toBeVisible({ timeout: T_JOIN });

  await cleanup();
});
