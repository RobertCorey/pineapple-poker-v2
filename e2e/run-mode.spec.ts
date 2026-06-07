import { test, expect, type Page } from '@playwright/test';
import { setupTwoPlayerGame, playFullRound } from './helpers/game-setup';
import { T_JOIN } from './helpers/timeouts';

/** Draft the first offered charm + mutation (handling a suit target if asked). */
async function draftCharmAndMutation(page: Page) {
  await page.locator('[data-testid^="charm-option-"]').first().waitFor({ timeout: T_JOIN });
  await page.locator('[data-testid^="charm-option-"]').first().click();
  await page.locator('[data-testid^="mutation-option-"]').first().click();
  // Some mutations (Suit Purge / Mono Suit) need a suit — pick one if asked.
  const suit = page.locator('[data-testid^="suit-"]').first();
  if (await suit.isVisible({ timeout: 1000 }).catch(() => false)) {
    await suit.click();
  }
}

test('Pineapple Run: enable, play a round, draft charm + mutation, advance', async ({ browser }) => {
  test.setTimeout(240_000);
  const { alice, bob, cleanup } = await setupTwoPlayerGame(browser);

  // Host switches to Pineapple Run, then starts the run.
  await alice.getByRole('button', { name: /Pineapple Run/ }).click();
  await alice.getByTestId('start-match-button').click();

  // Round 1 plays on a normal deck (mutations kick in from round 2).
  await playFullRound(alice, bob);

  // Between rounds, run mode shows the charm/mutation draft (not a results overlay).
  await draftCharmAndMutation(alice);
  await draftCharmAndMutation(bob);

  // The run advances to round 2 and deals again (mutated decks must still deal).
  await expect(alice.getByTestId('phase-label')).toContainText('R2', { timeout: T_JOIN });
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  await alice.getByTestId('hand-card-0').waitFor({ timeout: T_JOIN });

  await cleanup();
});
