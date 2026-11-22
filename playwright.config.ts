import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive the real app in a browser against a mock Supabase
// (tests/e2e/mockBackend.ts). The dev server is started with a fake Supabase
// URL, which overrides .env.local, so these tests cannot read or write a
// real project and never cause an AI call.
const PORT = 8444
export const FAKE_SUPABASE_URL = 'http://localhost:54399'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // GitHub's runners have few cores; Playwright would otherwise run one test at a time there.
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // The dev server compiles on first request, so the first page of a run is slow.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // Desktop Chrome always (every pull request). ALL_BROWSERS=1 adds Firefox,
  // Safari's engine (WebKit) and a phone (issue #17); WebKit and the phone
  // run nightly in CI (.github/workflows/nightly-browsers.yml). By hand:
  // `pnpm exec playwright install firefox webkit` once, then
  // `ALL_BROWSERS=1 pnpm test:e2e`.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'phone', use: { ...devices['iPhone 14'] } },
        ]
      : []),
  ],
  webServer: {
    command: 'pnpm exec vite',
    url: `http://localhost:${PORT}`,
    // Never reuse a server someone started by hand: it would be pointed at
    // the real project.
    reuseExistingServer: false,
    env: { PORT: String(PORT), VITE_SUPABASE_URL: FAKE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
})
