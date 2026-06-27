import { defineConfig } from '@playwright/test'

if (process.env.GITWARDEN_E2E_SHOW_WINDOW !== '1') {
  process.env.GITWARDEN_E2E_BACKGROUND = '1'
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Electron app instances share local app storage in these tests; keep them serialized.
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: 'list',
})
