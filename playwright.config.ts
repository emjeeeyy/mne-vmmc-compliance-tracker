import { defineConfig, devices } from '@playwright/test'

const FRONTEND_URL = 'http://localhost:3000'
const BACKEND_URL = 'http://localhost:8443'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Locally this suite reuses your live `next dev` server (see webServer below), which compiles
  // routes on demand and doesn't hold up well under 8-way concurrent navigation — capped lower to
  // avoid flaky timeouts. CI always runs against a real production build, so full parallelism there.
  workers: process.env.CI ? undefined : 4,
  reporter: 'html',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'ui',
      testDir: './e2e/ui',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testDir: './e2e/api',
      use: { baseURL: BACKEND_URL },
    },
  ],

  // Reuses already-running dev servers locally (so this never fights a `npm run dev` you already
  // have open, and never triggers the "next build while a dev server is live" .next corruption
  // issue documented in vmmc-frontend/FRONTEND_STANDARDS.md §9). CI always starts both fresh.
  webServer: [
    {
      command: 'npm --prefix vmmc-backend run start:dev',
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: process.env.CI
        ? 'npm --prefix vmmc-frontend run build && npm --prefix vmmc-frontend run start'
        : 'npm --prefix vmmc-frontend run dev:webpack',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
