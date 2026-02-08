import { test, expect, type Page } from '@playwright/test';

const PROJECT_ID = 'pineapple-poker-8f3';

test.beforeEach(async () => {
  await fetch(`http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
});

/**
 * Happy-path E2E test: two players join, play through all 5 streets,
 * see round results, and the next round auto-starts.
 */

/** Place cards for initial deal: 2 bottom, 2 middle, 1 top. Auto-submits. */
async function placeInitialDeal(page: Page) {
  const board = page.getByTestId('my-board');

  // Wait for cards to appear in hand
  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  // Card 0 → bottom row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  // Card 0 (was card 1) → bottom row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  // Card 0 (was card 2) → middle row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // Card 0 (was card 3) → middle row
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  // Card 0 (was card 4) → top row — auto-submits after this
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();
}

/**
 * Place cards for streets 2-5: place 2 cards into rows, 3rd auto-discarded, auto-submits.
 */
async function placeStreet(page: Page, street: number) {
  const board = page.getByTestId('my-board');

  // Wait for 3 cards in hand
  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  let row1: string, row2: string;

  switch (street) {
    case 2:
      row1 = 'bottom'; row2 = 'middle';
      break;
    case 3:
      row1 = 'bottom'; row2 = 'middle';
      break;
    case 4:
      row1 = 'bottom'; row2 = 'top';
      break;
    case 5:
      row1 = 'middle'; row2 = 'top';
      break;
    default:
      throw new Error(`Unexpected street ${street}`);
  }

  // Place card 0 → row1
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row1}`).click();

  // Place card 0 (was card 1) → row2 — auto-submits
  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row2}`).click();
}

test('two players play a full round', async ({ browser }) => {
  // Create two separate browser contexts (separate sessions, separate auth)
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();

  // --- Both players open the app ---
  await alice.goto('/');
  await bob.goto('/');

  // --- Alice joins ---
  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();

  // Alice should see the game page (phase-label appears once joined)
  await alice.getByTestId('phase-label').waitFor({ timeout: 10_000 });
  // With only 1 player, should be in waiting phase
  await expect(alice.getByTestId('phase-label')).toContainText('waiting');

  // --- Bob joins ---
  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();

  // Bob should see the game page
  await bob.getByTestId('phase-label').waitFor({ timeout: 10_000 });

  // --- Dealer starts round → initial_deal ---
  // Wait for both players to see initial_deal phase
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  // --- Initial deal: both place 5 cards ---
  await placeInitialDeal(alice);
  await placeInitialDeal(bob);

  // --- Streets 2 through 5 ---
  for (const street of [2, 3, 4, 5]) {
    const phaseText = `street_${street}`;
    await expect(alice.getByTestId('phase-label')).toContainText(phaseText, { timeout: 15_000 });
    await expect(bob.getByTestId('phase-label')).toContainText(phaseText, { timeout: 15_000 });

    await placeStreet(alice, street);
    await placeStreet(bob, street);
  }

  // --- Round complete: results modal appears ---
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
  await bob.getByTestId('round-results').waitFor({ timeout: 15_000 });

  // Verify the results modal has the expected structure
  await expect(alice.getByTestId('round-results')).toContainText('Round Complete');
  await expect(bob.getByTestId('round-results')).toContainText('Round Complete');

  // Both players should see scores (content doesn't matter, just that they exist)
  await expect(alice.getByTestId('round-results')).toContainText('Alice');
  await expect(alice.getByTestId('round-results')).toContainText('Bob');

  // Close results on Alice's side
  await alice.getByTestId('close-results').click();

  // --- Next round should auto-start (dealer resets) ---
  // Wait for phase to go back to initial_deal (new round)
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 20_000 });

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
