import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: real browsers driving the real app against a real
 * database. They play whole parties, so they need a database that is
 * safe to fill with pretend ones. See e2e/README.md.
 *
 * The app must already be running at E2E_BASE_URL with the same
 * Supabase settings these tests are given; `npm run e2e` arranges that
 * when a local Supabase is up.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Each test makes its own party, so they don't share anything. Two at a time keeps a small CI runner responsive.
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
    // Only for a sandbox whose browsers must reach a hosted database through a proxy. Not needed locally or in CI.
    proxy: process.env.E2E_PROXY ? { server: process.env.E2E_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
