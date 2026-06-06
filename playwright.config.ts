import { defineConfig } from '@playwright/test';

const isProduction = !!process.env.PRODUCTION_URL;

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  testIgnore: isProduction
    ? ['**/bot.spec.ts', '**/stress.spec.ts', '**/scoring.spec.ts', '**/sit-out.spec.ts']
    : ['**/bot.spec.ts', '**/stress.spec.ts'],
  timeout: isProduction ? 180_000 : 180_000,
  // CI gets 2 retries: structural flake causes are fixed (serial workers,
  // long-polling, warmup), but a contended runner can still produce a transient
  // listener-handshake hang that a fresh attempt clears. Local stays at 0 so
  // genuine regressions surface immediately.
  retries: isProduction ? 1 : (process.env.CI ? 2 : 0),
  /*
   * Serial. Every test drives the SAME single dealer process and the SAME
   * Firestore/Functions emulator (unique room codes isolate game *state*, but
   * not the shared backend). Running in parallel — Playwright defaults to
   * ~cores/2 workers, i.e. up to 9 locally / 2-4 on CI — starved that shared
   * backend and made the heaviest specs (observer, sit-out) flake on join/phase
   * timeouts. One worker trades a few minutes of wall-clock for a suite that
   * actually gives merge confidence. Green locally == green in CI.
   */
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.PRODUCTION_URL || 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
