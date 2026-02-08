import { test, expect, type Page } from '@playwright/test';

const PROJECT_ID = 'pineapple-poker-8f3';

test.beforeEach(async () => {
  await fetch(`http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://localhost:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
});

/**
 * Sit-out E2E test: when a player times out, they are auto-fouled and marked
 * as sitting out. They see a "Rejoin" banner and must click it to play again.
 */

/** Place cards for initial deal: 2 bottom, 2 middle, 1 top */
async function placeInitialDeal(page: Page) {
  const board = page.getByTestId('my-board');

  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-bottom-0').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-bottom-1').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-middle-0').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-middle-1').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('slot-top-0').click();

  await page.getByTestId('confirm-button').click();
}

/** Place cards for streets 2-5 */
async function placeStreet(page: Page, street: number) {
  const board = page.getByTestId('my-board');

  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  let row1: string, row2: string;
  let slotIndex1: number, slotIndex2: number;

  switch (street) {
    case 2:
      row1 = 'bottom'; slotIndex1 = 2;
      row2 = 'middle'; slotIndex2 = 2;
      break;
    case 3:
      row1 = 'bottom'; slotIndex1 = 3;
      row2 = 'middle'; slotIndex2 = 3;
      break;
    case 4:
      row1 = 'bottom'; slotIndex1 = 4;
      row2 = 'top'; slotIndex2 = 1;
      break;
    case 5:
      row1 = 'middle'; slotIndex1 = 4;
      row2 = 'top'; slotIndex2 = 2;
      break;
    default:
      throw new Error(`Unexpected street ${street}`);
  }

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`slot-${row1}-${slotIndex1}`).click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`slot-${row2}-${slotIndex2}`).click();

  // Discard remaining card
  await page.getByTestId('hand-card-0').click();

  await page.getByTestId('confirm-button').click();
}

test('timed-out player is sat out and can rejoin', async ({ browser }) => {
  // Increase timeout — we need to wait for a 30s timeout to expire
  test.setTimeout(180_000);

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();

  // --- Both players join ---
  await alice.goto('/');
  await bob.goto('/');

  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();
  await alice.getByTestId('phase-label').waitFor({ timeout: 10_000 });

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await bob.getByTestId('phase-label').waitFor({ timeout: 10_000 });

  // --- Dealer starts round → initial_deal ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  // --- Alice places cards, Bob does NOT (will time out) ---
  await placeInitialDeal(alice);

  // Wait for Bob to time out (30s initial deal timeout).
  // After timeout, Bob is fouled but Alice still plays streets 2-5.
  // Wait for street_2 to appear (means timeout fired and game advanced).
  await expect(alice.getByTestId('phase-label')).toContainText('street_2', { timeout: 45_000 });

  // Alice plays through remaining streets solo (Bob is fouled, auto-skipped)
  for (const street of [2, 3, 4, 5]) {
    if (street > 2) {
      await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    }
    await placeStreet(alice, street);
  }

  // Round completes → results modal
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
  await bob.getByTestId('round-results').waitFor({ timeout: 15_000 });

  // Verify round results show up
  await expect(alice.getByTestId('round-results')).toContainText('Round Complete');

  // Close results
  await alice.getByTestId('close-results').click();
  await bob.getByTestId('close-results').click();

  // --- After reset, Bob should be sitting out ---
  // Bob should see the sitting-out banner with Rejoin button
  await expect(bob.getByText('sitting out')).toBeVisible({ timeout: 20_000 });
  await expect(bob.getByRole('button', { name: 'Rejoin' })).toBeVisible();

  // Game should be in waiting since only Alice is active (need 2 to start)
  await expect(alice.getByTestId('phase-label')).toContainText('waiting', { timeout: 20_000 });

  // --- Bob clicks Rejoin ---
  await bob.getByRole('button', { name: 'Rejoin' }).click();

  // Bob's sitting-out banner should disappear
  await expect(bob.getByText('sitting out')).not.toBeVisible({ timeout: 10_000 });

  // --- With 2 active players again, dealer should start a new round ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  // Both should have cards in hand
  await alice.getByTestId('hand-card-0').waitFor({ timeout: 10_000 });
  await bob.getByTestId('hand-card-0').waitFor({ timeout: 10_000 });

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
