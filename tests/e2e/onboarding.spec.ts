import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })
}

async function resetOnboarding(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    await api.settings.update({
      onboardingCompletedAt: undefined,
      onboardingSkippedAt: undefined,
    })
  })
}

async function openTourFromSettings(win: Page): Promise<void> {
  await win.getByTestId('nav-settings').click()
  await expect(win.getByTestId('screen-settings')).toBeVisible()
  // The replay control lives under the "Walkthrough" Settings tab.
  await win.getByTestId('settings-tab-walkthrough').click()
  await win.getByTestId('settings-start-onboarding').click()
  await expect(win.getByTestId('onboarding-overlay')).toBeVisible()
}

async function expectTitle(win: Page, title: string): Promise<void> {
  await expect(win.getByTestId('onboarding-title')).toHaveText(title)
}

test.describe('Onboarding walkthrough', () => {
  test('can be started from Settings and skipped', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await resetOnboarding(win)

      await openTourFromSettings(win)
      await expectTitle(win, 'Welcome to GitWarden')
      await expect(win.getByTestId('onboarding-progress')).toHaveText('1 of 10')

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Global header')
      await expect(win.getByTestId('onboarding-spotlight')).toBeVisible()

      await win.getByTestId('onboarding-skip').click()
      await expect(win.getByTestId('onboarding-overlay')).toBeHidden()

      const result = await win.evaluate(async () => {
        const api = (window as Window & typeof globalThis).api
        return api.settings.get()
      })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data.onboardingSkippedAt).toBeTruthy()
    } finally {
      await app.close()
    }
  })

  test('advances across the main screens and marks completion', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await resetOnboarding(win)

      await openTourFromSettings(win)
      await expectTitle(win, 'Welcome to GitWarden')

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Global header')

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Navigation')

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Create profiles first')
      await expect(win.getByTestId('screen-profiles')).toBeVisible()

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Add repositories')
      await expect(win.getByTestId('screen-repositories')).toBeVisible()

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Review and stage changes')
      await expect(win.getByTestId('screen-status')).toBeVisible()

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Commit with safety checks')
      await expect(win.getByTestId('screen-commit')).toBeVisible()

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Push only after confirmation')
      await expect(win.getByTestId('screen-remote')).toBeVisible()

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Use Safety Center')
      await expect(win.getByTestId('screen-safety-center')).toBeVisible()

      await win.getByTestId('onboarding-next').click()
      await expectTitle(win, 'Replay any time')
      await expect(win.getByTestId('screen-settings')).toBeVisible()
      await expect(win.getByTestId('onboarding-next')).toHaveText('Finish')

      await win.getByTestId('onboarding-next').click()
      await expect(win.getByTestId('onboarding-overlay')).toBeHidden()

      const result = await win.evaluate(async () => {
        const api = (window as Window & typeof globalThis).api
        return api.settings.get()
      })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data.onboardingCompletedAt).toBeTruthy()
    } finally {
      await app.close()
    }
  })
})
