/**
 * Bot player — opens a browser, joins the game, and plays automatically.
 * Run alongside your manual browser session so you have an opponent.
 * The human player must be the host and click "Start Match".
 *
 * Usage: npx playwright test e2e/bot.ts --headed
 */
import { test, type Page } from '@playwright/test';

const BOT_NAME = process.env.BOT_NAME ?? 'Bot';
const ROOM_CODE = process.env.ROOM_CODE ?? '';

async function placeInitialDeal(page: Page) {
  const board = page.getByTestId('my-board');
  await page.getByTestId('hand-card-0').waitFor({ timeout: 30_000 });

  // 2 bottom, 2 middle, 1 top
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

async function placeStreet(page: Page, street: number) {
  const board = page.getByTestId('my-board');
  await page.getByTestId('hand-card-0').waitFor({ timeout: 30_000 });

  let row1: string, row2: string;
  switch (street) {
    case 2: row1 = 'bottom'; row2 = 'middle'; break;
    case 3: row1 = 'bottom'; row2 = 'middle'; break;
    case 4: row1 = 'bottom'; row2 = 'top'; break;
    case 5: row1 = 'middle'; row2 = 'top'; break;
    default: throw new Error(`Unexpected street ${street}`);
  }

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row1}`).click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row2}`).click();
}

async function playRound(page: Page) {
  // Wait for initial_deal phase (phase-label appears on GamePage)
  await page.waitForFunction(
    () => document.querySelector('[data-testid="phase-label"]')?.textContent?.includes('initial_deal'),
    { timeout: 60_000 },
  );

  await placeInitialDeal(page);

  for (const street of [2, 3, 4, 5]) {
    await page.waitForFunction(
      (s) => document.querySelector('[data-testid="phase-label"]')?.textContent?.includes(`street_${s}`),
      street,
      { timeout: 45_000 },
    );
    await placeStreet(page, street);
  }

  // Wait for round results or match results
  const roundResults = page.getByTestId('round-results');
  const matchResults = page.getByTestId('match-results');

  await page.waitForFunction(
    () => document.querySelector('[data-testid="round-results"]') || document.querySelector('[data-testid="match-results"]'),
    { timeout: 30_000 },
  );

  if (await matchResults.isVisible()) {
    console.log(`[${BOT_NAME}] Match complete!`);
    // Wait for host to click play again
    return 'match_complete';
  }

  console.log(`[${BOT_NAME}] Round complete!`);
  // Overlay auto-dismisses when next round starts
  await roundResults.waitFor({ state: 'hidden', timeout: 15_000 });
  return 'round_complete';
}

test(`${BOT_NAME} plays forever`, async ({ page }) => {
  test.setTimeout(0); // no timeout — runs until you stop it

  if (!ROOM_CODE) throw new Error('ROOM_CODE env var is required (e.g. ROOM_CODE=ABCD12)');

  await page.goto(`/?room=${ROOM_CODE}`);
  await page.getByTestId('name-input').fill(BOT_NAME);
  await page.getByTestId('join-button').click();

  console.log(`[${BOT_NAME}] Joined game, waiting for host to start match...`);

  // Play matches in a loop
  while (true) {
    // Play rounds until match is complete
    for (let round = 0; round < 3; round++) {
      const result = await playRound(page);
      if (result === 'match_complete') break;
      console.log(`[${BOT_NAME}] Waiting for next round...`);
      await page.waitForTimeout(2_000);
    }

    // Wait for host to restart — bot goes back to lobby
    console.log(`[${BOT_NAME}] Waiting for host to start new match...`);
    await page.waitForTimeout(5_000);
  }
});
