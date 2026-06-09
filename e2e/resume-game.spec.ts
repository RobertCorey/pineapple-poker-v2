import { test, expect } from '@playwright/test';
import { setupTwoPlayerGame } from './helpers/game-setup';
import { T_JOIN, T_UI } from './helpers/timeouts';

/**
 * Seat recovery: a player who loses the ?room= URL (closed tab, navigated
 * home) is offered a "Rejoin" banner on the home screen while their seat in
 * the game still exists. Dismissing or deliberately leaving forgets the room.
 */
test('player who lost the room URL can rejoin from the home screen', async ({ browser }) => {
  test.setTimeout(180_000);

  const { alice, bob, roomId, cleanup } = await setupTwoPlayerGame(browser);

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });

  // --- Alice "loses" the room URL (navigates to home mid-round) ---
  await alice.goto('/');
  await alice.getByTestId('create-room-button').waitFor({ timeout: T_JOIN });

  // Resume banner offers her seat back
  const banner = alice.getByTestId('resume-banner');
  await banner.waitFor({ timeout: T_JOIN });
  await expect(banner).toContainText(roomId);

  // --- Rejoin: back at the table with her board ---
  await alice.getByTestId('resume-game-button').click();
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await alice.getByTestId('my-board').waitFor({ timeout: T_JOIN });

  // --- Dismiss: forgets the room ---
  await alice.goto('/');
  await alice.getByTestId('resume-banner').waitFor({ timeout: T_JOIN });
  await alice.getByTestId('dismiss-resume-button').click();
  await expect(alice.getByTestId('resume-banner')).toBeHidden({ timeout: T_UI });

  // After a reload the saved room stays forgotten — no banner reappears.
  await alice.reload();
  await alice.getByTestId('create-room-button').waitFor({ timeout: T_JOIN });
  await expect(alice.getByTestId('resume-banner')).toBeHidden({ timeout: T_UI });

  await cleanup();
});
