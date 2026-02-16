import { defineConfig } from '@playwright/test';

const isProduction = !!process.env.PRODUCTION_URL;

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  testIgnore: isProduction
    ? ['**/bot.spec.ts', '**/stress.spec.ts', '**/scoring.spec.ts', '**/sit-out.spec.ts', '**/dev-ui.spec.ts']
    : ['**/bot.spec.ts', '**/stress.spec.ts'],
  timeout: isProduction ? 180_000 : 120_000,
  retries: isProduction ? 1 : (process.env.CI ? 1 : 0),
  workers: undefined, /* parallel — tests use unique room codes so no shared state */
  use: {
    baseURL: process.env.PRODUCTION_URL || 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
