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
  await alice.getByTestId('start-match-button').waitFor({ timeout: T_JOIN });

  await bob.getByTestId('name-input').fill('Bob');
  await bob.getByTestId('join-button').click();
  await expect(bob.getByText('Waiting for host to start')).toBeVisible({ timeout: T_JOIN });

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
