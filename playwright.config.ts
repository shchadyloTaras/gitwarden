import { defineConfig } from '@playwright/test'

if (process.env.GITWARDEN_E2E_SHOW_WINDOW !== '1') {
  process.env.GITWARDEN_E2E_BACKGROUND = '1'
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Each spec file runs against its own scratch userData dir (tests/fixtures/launchApp,
  // enforced by tests/unit/e2e-userdata-isolation.test.ts) — never the real GitWarden
  // data. Still serialized: each test boots a full Electron app.
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: 'list',
})
