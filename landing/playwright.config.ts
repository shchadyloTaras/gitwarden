import { defineConfig, devices } from '@playwright/test'

// Landing e2e. The webServer builds with RELEASE_MODE=fixture so the site renders deterministic
// Appendix-D data offline (no real GitHub call at build), then serves the static output.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4323',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'RELEASE_MODE=fixture npm run build && npm run preview -- --port 4323',
    url: 'http://localhost:4323',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
