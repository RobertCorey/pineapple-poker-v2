import { test } from '@playwright/test';
import { setupTwoPlayerGame } from './helpers/game-setup';

/**
 * NOT a real test — a warm-up that runs FIRST (alphabetical file order) inside
 * the Playwright worker's own browser.
 *
 * The first spec in a freshly-launched worker eats the cold-start cost: Vite's
 * first on-demand compile of the app module graph and the first Firebase JS SDK
 * + Firestore listener handshake from that browser. That occasionally stalls
 * the join → start-match flow and flakes whatever real spec happens to be first.
 * Running one throwaway setup here absorbs that cost so the real specs start hot.
 *
 * Deliberately tolerant: a warm-up hiccup must never fail the suite — correctness
 * is covered by the real specs (and CI retries).
 */
test('warmup: prime worker browser + emulator listeners (non-assertive)', async ({ browser }) => {
  test.setTimeout(120_000);
  try {
    const game = await setupTwoPlayerGame(browser);
    await game.cleanup();
  } catch {
    // Ignore — this is only a warm-up.
  }
});
