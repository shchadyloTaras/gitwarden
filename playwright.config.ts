import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Electron app instances share local app storage in these tests; keep them serialized.
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: 'list',
})
