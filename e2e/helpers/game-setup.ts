import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { T_JOIN } from './timeouts';
import { placeInitialDeal, placeStreet } from './placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

export interface TwoPlayerGame {
  alice: Page;
  bob: Page;
  roomId: string;
  cleanup: () => Promise<void>;
}

export interface ThreePlayerGame extends TwoPlayerGame {
  carol: Page;
}

/**
 * Click Join and wait for the expected post-join element to appear.
 * If the element doesn't appear within `perAttemptMs`, re-click Join.
 * This handles transient Cloud Function failures and slow cold starts
 * that would otherwise cause a 45s timeout with no recovery.
 */
async function joinWithRetry(
  page: Page,
  successLocator: { waitFor: (opts: { timeout: number }) => Promise<void> },
  opts?: { maxAttempts?: number; perAttemptMs?: number },
): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const perAttemptMs = opts?.perAttemptMs ?? 15_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Click join (re-click on retry — button is still visible if join failed)
    if (attempt > 1) {
      console.log(`[E2E] Join retry #${attempt}`);
      await page.getByTestId('join-button').click();
    }

    try {
      await successLocator.waitFor({ timeout: perAttemptMs });
      return; // success
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Join failed after ${maxAttempts} attempts (${perAttemptMs}ms each). ` +
          `Total wait: ${maxAttempts * perAttemptMs}ms.`,
        );
      }
      // If join failed, the page still shows the join form (or an error toast).
      // The join button should still be clickable for retry.
    }
  }
}

/**
 * Create a two-player game in the lobby, ready to start.
 * Alice is host (sees Start Match), Bob is waiting.
 *
 * Uses retry logic for the join step — if the Cloud Function call fails
 * transiently (cold start, emulator hiccup), it re-clicks Join rather
 * than waiting the full timeout.
 */
export async function setupTwoPlayerGame(browser: Browser, opts?: { timeout?: number }): Promise<TwoPlayerGame> {
  const roomId = generateRoomCode();
  const timeoutParam = opts?.timeout ? `&timeout=${opts.timeout}` : '';

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const alice = await ctx1.newPage();
  const bob = await ctx2.newPage();

  await alice.goto(`/?room=${roomId}${timeoutParam}`);
  await bob.goto(`/?room=${roomId}${timeoutParam}`);

  // Alice joins (creates room) — retry if Cloud Function is flaky
  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();
  await joinWithRetry(alice, alice.getByTestId('start-match-button'));

  // Bob joins — retry if needed
  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await joinWithRetry(bob, bob.getByText('Waiting for host to start'));

  return {
    alice,
    bob,
    roomId,
    cleanup: async () => {
      await ctx1.close();
      await ctx2.close();
    },
  };
}

/**
 * Play one full round: initial deal + streets 2-5 for the given players.
 * Waits for phase transitions between streets.
 */
export async function playFullRound(...players: Page[]) {
  const [first, ...rest] = players;

  // Wait for initial_deal
  await expect(first.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  for (const p of rest) {
    await expect(p.getByTestId('phase-label')).toContainText('initial_deal', { timeout: T_JOIN });
  }

  // Initial deal
  for (const p of players) {
    await placeInitialDeal(p);
  }

  // Streets 2-5
  for (const street of [2, 3, 4, 5]) {
    await expect(first.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: T_JOIN });
    for (const p of rest) {
      await expect(p.getByTestId('phase-label')).toContainText(`street_${street}`, { timeout: T_JOIN });
    }
    for (const p of players) {
      await placeStreet(p, street);
    }
  }
}
