import { test, expect } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// Launches the built app with GITWARDEN_E2E_FAKE_UPDATES=1, which swaps the real GitHub-releases
// check for a deterministic fake (no network — AGENTS.md "tests run offline"). Passing
// updateAvailable also sets GITWARDEN_E2E_UPDATE_AVAILABLE=1 so the fake reports a newer release.
//
// The launch auto-check is suppressed under Playwright (navigator.webdriver), so each test drives a
// real check through the Settings button — the SAME store action the auto-check calls — then
// asserts the header button reflects the result. This proves the core requirement: the Update
// button is shown only when a newer release actually exists.
function launchApp(updateAvailable: boolean): Promise<ElectronApplication> {
  return launchIsolatedApp(
    updateAvailable
      ? { GITWARDEN_E2E_FAKE_UPDATES: '1', GITWARDEN_E2E_UPDATE_AVAILABLE: '1' }
      : { GITWARDEN_E2E_FAKE_UPDATES: '1' }
  )
}

test.describe('Update notifier', () => {
  test('shows the header Update button only after a check finds a newer release', async () => {
    const app = await launchApp(true)
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      // Nothing checked yet (auto-check suppressed under Playwright) → no button.
      await expect(win.getByTestId('header-update-button')).toHaveCount(0)

      // Run a real check via Settings (same store action as the launch auto-check).
      await win.getByTestId('nav-settings').click()
      await expect(win.getByTestId('screen-settings')).toBeVisible()
      await win.getByTestId('settings-update-check').click()

      await expect(win.getByTestId('settings-update-status')).toContainText('99.0.0')
      await expect(win.getByTestId('settings-update-download')).toBeVisible()

      // The header button now appears because an update is available.
      const headerBtn = win.getByTestId('header-update-button')
      await expect(headerBtn).toBeVisible()
      await expect(headerBtn).toContainText('Update')
      await expect(headerBtn).toHaveAttribute('aria-label', /99\.0\.0/)

      // The sidebar footer mirrors the exact same signal, expanded (icon + label).
      const sidebarBtn = win.getByTestId('sidebar-update-button')
      await expect(sidebarBtn).toBeVisible()
      await expect(sidebarBtn).toContainText('Update')
      await expect(sidebarBtn).toHaveAttribute('aria-label', /99\.0\.0/)

      // Collapsed: the footer button stays present, icon-only, tooltip carries the version.
      await win.getByTestId('sidebar-collapse-toggle').click()
      await expect(sidebarBtn).toBeVisible()
      await expect(sidebarBtn).not.toContainText('Update')
      await expect(sidebarBtn).toHaveAttribute('data-tooltip', /99\.0\.0/)
    } finally {
      await app.close()
    }
  })

  test('stays hidden when the app is already up to date', async () => {
    const app = await launchApp(false)
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await win.getByTestId('nav-settings').click()
      await expect(win.getByTestId('screen-settings')).toBeVisible()
      await win.getByTestId('settings-update-check').click()

      await expect(win.getByTestId('settings-update-status')).toContainText('latest version')
      await expect(win.getByTestId('settings-update-download')).toHaveCount(0)
      await expect(win.getByTestId('header-update-button')).toHaveCount(0)
      await expect(win.getByTestId('sidebar-update-button')).toHaveCount(0)
    } finally {
      await app.close()
    }
  })
})
