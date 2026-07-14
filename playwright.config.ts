import { defineConfig, devices } from '@playwright/test';

// LOCAL-ONLY e2e (deliberately NOT wired into CI — see tasks/todo.md). Run before a release:
//   npm run test:e2e        (headless)   |   npm run test:e2e:ui   (interactive)
// Playwright starts the dev server itself and reuses one you already have running.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    // Dedicated e2e port so a dev server already on :3000 doesn't push next dev to :3001 and
    // desync from what Playwright drives.
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    // false: always start a fresh server for the release gate. A leftover/stale server on :3100
    // then surfaces as a loud EADDRINUSE instead of silently validating the wrong code.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
