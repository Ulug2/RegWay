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
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // The dev server compiles on first request, so the first page of a run is slow.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite',
    url: `http://localhost:${PORT}`,
    // Never reuse a server someone started by hand: it would be pointed at
    // the real project.
    reuseExistingServer: false,
    env: { PORT: String(PORT), VITE_SUPABASE_URL: FAKE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
})
