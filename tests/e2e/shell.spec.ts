import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'node:path'

async function launchApp() {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })
}

test.describe('App shell & navigation', () => {
  test('global header shows repo selector and safety badge', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await expect(win.getByTestId('header-repo-select')).toBeVisible()
      await expect(win.getByTestId('header-safety-badge')).toHaveText('Safe')
    } finally {
      await app.close()
    }
  })

  test('sidebar navigation switches screens', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      const screens: Array<{ nav: string; testId: string }> = [
        { nav: 'nav-repositories', testId: 'screen-repositories' },
        { nav: 'nav-profiles', testId: 'screen-profiles' },
        { nav: 'nav-status', testId: 'screen-status' },
        { nav: 'nav-commit', testId: 'screen-commit' },
        { nav: 'nav-remote', testId: 'screen-remote' },
        { nav: 'nav-branches', testId: 'screen-branches' },
        { nav: 'nav-history', testId: 'screen-history' },
        { nav: 'nav-safety-center', testId: 'screen-safety-center' },
        { nav: 'nav-settings', testId: 'screen-settings' },
      ]

      for (const { nav, testId } of screens) {
        await win.getByTestId(nav).click()
        await expect(win.getByTestId(testId)).toBeVisible()
      }
    } finally {
      await app.close()
    }
  })

  test('inspector panel is visible', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await expect(win.getByTestId('inspector-panel')).toBeVisible()
      await expect(win.getByTestId('inspector-panel')).toContainText('CONTEXT')
    } finally {
      await app.close()
    }
  })

  test('inspector toggles via header button', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      // initially visible
      await expect(win.getByTestId('inspector-panel')).toBeVisible()

      // click the ⓘ toggle
      await win.getByLabel('Toggle inspector').click()
      await expect(win.getByTestId('inspector-panel')).toBeHidden()

      // click again to re-open
      await win.getByLabel('Toggle inspector').click()
      await expect(win.getByTestId('inspector-panel')).toBeVisible()
    } finally {
      await app.close()
    }
  })
})
