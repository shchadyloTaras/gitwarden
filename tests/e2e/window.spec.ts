import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'node:path'

test('app window opens with correct title', async () => {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })

  try {
    const win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await expect(win).toHaveTitle('Git Warden')
  } finally {
    await app.close()
  }
})
