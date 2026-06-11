import { test, expect, type Page } from '@playwright/test';

/**
 * Single-player Saloon mode (The Frontier Trail).
 *
 * Fully client-side — no rooms, dealer, or emulator state involved. Covers:
 * entry from the home screen, the campaign map (locks + bankroll), and
 * playing the first two streets of a hand against a bot (turn passing,
 * auto-submit, auto-discard).
 */

/** Place `count` cards: tap the first card in hand, tap the given row. */
async function placeCards(page: Page, rows: string[]) {
  const board = page.getByTestId('saloon-my-board');
  for (const row of rows) {
    await page.getByTestId('saloon-hand-card-0').click();
    await board.getByTestId(`saloon-row-${row}`).click();
  }
}

test('frontier trail: map gating, turn-based hand vs bot, walk away', async ({ page }) => {
  // Entry from the multiplayer home screen
  await page.goto('/');
  await page.getByTestId('saloon-link').click();

  // Campaign map: fresh progress shows $100 bankroll, only stop 1 unlocked
  await expect(page.getByTestId('saloon-bankroll')).toHaveText('$100');
  await expect(page.getByTestId('saloon-play-1')).toBeVisible();
  await expect(page.getByTestId('saloon-play-2')).not.toBeVisible();
  await expect(page.getByText('Tumbleweed Ted')).toBeVisible();

  // Sit down at Dusty Gulch — hero acts first on hand 1
  await page.getByTestId('saloon-play-1').click();
  await expect(page.getByTestId('saloon-turn-banner')).toContainText('Your deal', { timeout: 10_000 });
  await expect(page.getByTestId('saloon-hand-card-4')).toBeVisible();

  // Street 1: place all 5 (auto-submits on the 5th) → bot's turn
  await placeCards(page, ['bottom', 'bottom', 'bottom', 'middle', 'middle']);
  await expect(page.getByTestId('saloon-turn-banner')).toContainText('Tumbleweed Ted', { timeout: 5_000 });

  // Bot plays, street 2 comes back to us with 3 dealt cards
  await expect(page.getByTestId('saloon-turn-banner')).toContainText('Your turn', { timeout: 15_000 });
  await expect(page.getByTestId('saloon-hand-card-2')).toBeVisible();

  // Street 2: place 2, third card is auto-discarded → bot's turn again
  await placeCards(page, ['bottom', 'middle']);
  await expect(page.getByTestId('saloon-turn-banner')).toContainText('Tumbleweed Ted', { timeout: 5_000 });
  await expect(page.getByTestId('saloon-hand-card-0')).not.toBeVisible();

  // Walk away mid-match (confirm dialog) → back on the trail, bankroll untouched
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Walk away' }).click();
  await expect(page.getByTestId('saloon-bankroll')).toHaveText('$100', { timeout: 5_000 });
});
