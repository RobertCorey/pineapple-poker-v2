import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { T_JOIN } from './timeouts';
import { placeInitialDeal, placeStreet } from './placement';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

/**
 * Wait for a post-join element, self-healing the known Firestore-emulator flake:
 * occasionally the realtime listener's WebChannel/long-poll hangs and never
 * delivers the first snapshot, so the UI stalls even though the join SUCCEEDED
 * server-side. A single page reload re-establishes the listener and recovers
 * deterministically — much better than a blanket test retry.
 */
export async function waitForJoin(page: Page, target: Locator): Promise<void> {
  try {
    await target.waitFor({ timeout: 12_000 });
  } catch {
    await page.reload();
    await target.waitFor({ timeout: T_JOIN });
  }
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
 * Create a two-player game in the lobby, ready to start.
 * Alice is host (sees Start Match), Bob is waiting.
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

  await alice.getByTestId('name-input').fill('Alice');
  await alice.getByTestId('join-button').click();
  await waitForJoin(alice, alice.getByTestId('start-match-button'));

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await waitForJoin(bob, bob.getByText('Waiting for host to start'));

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
