import { test, expect, type Page } from '@playwright/test';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

/**
 * Timeout E2E test: when a player times out, they are auto-fouled.
 * In the next round, they are still active (not sitting out) and can play normally.
 * Verifies cumulative scoring works across rounds.
 */

/** Place cards for initial deal: 2 bottom, 2 middle, 1 top. Auto-submits. */
async function placeInitialDeal(page: Page) {
  const board = page.getByTestId('my-board');

  await page.getByTestId('hand-card-0').waitFor({ timeout: 15_000 });

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();
}

/** Place cards for streets 2-5. Auto-submits. */
async function placeStreet(page: Page, street: number) {
  const board = page.getByTestId('my-board');

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

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row1}`).click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row2}`).click();
}

test('timed-out player is auto-fouled but active in next round', async ({ browser }) => {
  // Increase timeout — we need to wait for a 30s timeout to expire
  test.setTimeout(180_000);

  const roomId = generateRoomCode();

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();

  // --- Both players join ---
  await alice.goto(`/?room=${roomId}`);
  await bob.goto(`/?room=${roomId}`);

  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();
  await alice.getByTestId('start-match-button').waitFor({ timeout: 10_000 });

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: 10_000 });

  // --- Host starts match ---
  await alice.getByTestId('start-match-button').click();

  // --- Round 1: Alice places, Bob times out ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  await placeInitialDeal(alice);

  // Wait for Bob to time out (30s initial deal timeout).
  // After timeout, Bob is fouled but Alice still plays streets 2-5.
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

  // Verify round results show up with round info
  await expect(alice.getByTestId('round-results')).toContainText('Round 1 of 3 Complete');

  // Close results
  await alice.getByTestId('close-results').click();
  await bob.getByTestId('close-results').click();

  // --- Round 2: Bob should be ACTIVE (not sitting out), both play ---
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 20_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 20_000 });

  // Bob should have cards — he's active this round
  await bob.getByTestId('hand-card-0').waitFor({ timeout: 10_000 });

  // Both players place
  await placeInitialDeal(alice);
  await placeInitialDeal(bob);

  // Advance through streets
  for (const street of [2, 3, 4, 5]) {
    await expect(alice.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: 15_000 });
    await placeStreet(alice, street);
    await placeStreet(bob, street);
  }

  // Round 2 results
  await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
  await expect(alice.getByTestId('round-results')).toContainText('Round 2 of 3 Complete');

  // Verify cumulative scores are displayed (Total column)
  await expect(alice.getByTestId('round-results')).toContainText('Total');

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
