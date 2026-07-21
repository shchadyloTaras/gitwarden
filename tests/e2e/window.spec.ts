import { test, expect } from '@playwright/test'
import { launchApp } from '../fixtures/launchApp'

test('app window opens with correct title', async () => {
  const app = await launchApp()

  try {
    const win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await expect(win).toHaveTitle('Git Warden')
  } finally {
    await app.close()
  }
})
