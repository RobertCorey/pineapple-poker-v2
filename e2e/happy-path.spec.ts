import { test, expect, type Page } from '@playwright/test';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

/**
 * Happy-path E2E test: two players join, host starts a 3-round match,
 * play through all rounds, see match results, and play again.
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

/** Play one full round: initial deal + streets 2-5. */
async function playFullRound(alice: Page, bob: Page) {
  // Wait for initial_deal phase
  await expect(alice.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });
  await expect(bob.getByTestId('phase-label')).toContainText('initial_deal', { timeout: 15_000 });

  // Initial deal: both place 5 cards
  await placeInitialDeal(alice);
  await placeInitialDeal(bob);

  // Streets 2 through 5
  for (const street of [2, 3, 4, 5]) {
    const phaseText = `street_${street}`;
    await expect(alice.getByTestId('phase-label')).toContainText(phaseText, { timeout: 15_000 });
    await expect(bob.getByTestId('phase-label')).toContainText(phaseText, { timeout: 15_000 });

    await placeStreet(alice, street);
    await placeStreet(bob, street);
  }
}

test('two players play a full 3-round match', async ({ browser }) => {
  test.setTimeout(180_000);

  const roomId = generateRoomCode();

  // Create two separate browser contexts (separate sessions, separate auth)
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();

  // --- Both players open the app with room code ---
  await alice.goto(`/?room=${roomId}`);
  await bob.goto(`/?room=${roomId}`);

  // --- Alice joins (becomes host, creates room) ---
  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();

  // Alice should see the lobby with Start Match button
  await alice.getByTestId('start-match-button').waitFor({ timeout: 10_000 });

  // --- Bob joins ---
  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();

  // Bob should see the lobby (waiting for host)
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: 10_000 });

  // --- Host starts the match ---
  await alice.getByTestId('start-match-button').click();

  // --- Play 3 rounds ---
  for (let round = 1; round <= 3; round++) {
    await playFullRound(alice, bob);

    if (round < 3) {
      // Inter-round: round results modal appears
      await alice.getByTestId('round-results').waitFor({ timeout: 15_000 });
      await bob.getByTestId('round-results').waitFor({ timeout: 15_000 });

      // Verify round results header
      await expect(alice.getByTestId('round-results')).toContainText(`Round ${round} of 3 Complete`);

      // Close results
      await alice.getByTestId('close-results').click();
      await bob.getByTestId('close-results').click();

      // Wait for next round to start (auto-reset → lobby → auto-start)
    } else {
      // After round 3: match-results modal (not round-results)
      await alice.getByTestId('match-results').waitFor({ timeout: 15_000 });
      await bob.getByTestId('match-results').waitFor({ timeout: 15_000 });

      // Verify match results
      await expect(alice.getByTestId('match-results')).toContainText('Match Complete');
      await expect(alice.getByTestId('match-results')).toContainText('Alice');
      await expect(alice.getByTestId('match-results')).toContainText('Bob');
    }
  }

  // --- Host clicks Play Again → back to lobby ---
  await alice.getByTestId('play-again-button').click();

  // Both should be back in lobby
  await alice.getByTestId('start-match-button').waitFor({ timeout: 15_000 });
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: 15_000 });

  // Cleanup
  await ctx1.close();
  await ctx2.close();
});
