import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'

// Phase 81 — "Checking with GitHub…" on return + return polish (renderer + e2e).
//
// Drives the real ConnectGitHubModal against the injected fake device-flow service
// (GITWARDEN_E2E_FAKE_GITHUB=1), with the Phase 81 test-only knobs that let a single
// fake express three distinct scenarios without ever touching real GitHub:
//   - GITWARDEN_E2E_FAKE_GITHUB_INTERVAL_SEC: a long interval so the flow would NOT
//     authorize on its own within this test's wait window — isolating the bypass poke's
//     effect from the fake's normal background timer.
//   - GITWARDEN_E2E_FAKE_GITHUB_POKE_AUTHORIZES=0: the poke finds "still pending",
//     mirroring a user who refocused before actually finishing on GitHub.
//   - GITWARDEN_E2E_FAKE_GITHUB_OUTCOME=expire: the poll rejects as an expired code.

function launchApp(env: Record<string, string> = {}): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GITWARDEN_E2E_FAKE_GITHUB: '1', ...env },
  })
}

async function createProfile(win: Page, displayName: string): Promise<void> {
  await win.getByTestId('profiles-new-btn').click()
  await win.getByTestId('profile-form-displayName').fill(displayName)
  await win.getByTestId('profile-form-gitAuthorName').fill('Placeholder Name')
  await win.getByTestId('profile-form-gitAuthorEmail').fill('placeholder@example.com')
  await win.getByTestId('profile-form-githubUsername').fill('placeholder')
  await win.getByTestId('profile-form-submit').click()
}

/** Fires window `focus`, the trigger the modal's return-check listener subscribes to. */
async function simulateReturnFocus(win: Page): Promise<void> {
  await win.evaluate(() => window.dispatchEvent(new Event('focus')))
}

test.describe('Connect-Return Check: "Checking with GitHub…" on return', () => {
  let app: ElectronApplication
  let win: Page

  test.afterEach(async () => {
    await app.close()
  })

  async function openConnectModal(displayName: string): Promise<void> {
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.getByTestId('nav-profiles').click()
    await expect(win.getByTestId('screen-profiles')).toBeVisible()
    await createProfile(win, displayName)
    await win.getByTestId('github-connect-btn').click()
    await expect(win.getByTestId('github-connect-modal')).toBeVisible()
  }

  test('returning to the app pokes a bypass poll and flips straight to Connected', async () => {
    // Interval is far longer than this test's wait window, so a flip within a few
    // seconds can only be explained by the return-focus poke, not the natural timer.
    app = await launchApp({ GITWARDEN_E2E_FAKE_GITHUB_INTERVAL_SEC: '30' })
    await openConnectModal('Personal')
    await expect(win.getByTestId('github-connect-user-code')).toHaveText('WDJB-MJHT')

    await simulateReturnFocus(win)

    await expect(win.getByTestId('github-connect-waiting-line')).toHaveText('Checking with GitHub…')
    await expect(win.getByTestId('github-connect-success')).toBeVisible({ timeout: 5000 })
  })

  test('not yet authorized: "Checking…" settles back to "Waiting…" with no stuck spinner', async () => {
    app = await launchApp({
      GITWARDEN_E2E_FAKE_GITHUB_INTERVAL_SEC: '30',
      GITWARDEN_E2E_FAKE_GITHUB_POKE_AUTHORIZES: '0',
    })
    await openConnectModal('Personal')
    await expect(win.getByTestId('github-connect-user-code')).toHaveText('WDJB-MJHT')

    await simulateReturnFocus(win)

    await expect(win.getByTestId('github-connect-waiting-line')).toHaveText('Checking with GitHub…')
    // The fallback timeout (2s) fires because the poke found nothing new — settles back
    // to the plain waiting line instead of leaving the spinner up forever.
    await expect(win.getByTestId('github-connect-waiting-line')).toHaveText(
      'Waiting for you to authorize on GitHub…',
      { timeout: 4000 }
    )
    // Still awaiting the user — no premature authorization.
    await expect(win.getByTestId('github-connect-modal')).toBeVisible()
    await expect(win.getByTestId('github-connect-success')).toHaveCount(0)
  })

  test('the new-user reassurance hint is visible while awaiting authorization', async () => {
    app = await launchApp()
    await openConnectModal('Personal')
    await expect(win.getByTestId('github-connect-user-code')).toHaveText('WDJB-MJHT')

    await expect(
      win.getByText("No GitHub account yet? Create one — we'll keep waiting.")
    ).toBeVisible()
  })

  test('an expired code shows a prominent, focused "Try Again" as the next action', async () => {
    app = await launchApp({ GITWARDEN_E2E_FAKE_GITHUB_OUTCOME: 'expire' })
    await openConnectModal('Personal')

    await expect(win.getByTestId('github-connect-error')).toBeVisible({ timeout: 5000 })
    const retryBtn = win.getByTestId('github-connect-retry')
    await expect(retryBtn).toBeVisible()
    await expect(retryBtn).toHaveText('Try Again')
    await expect(retryBtn).toBeFocused()
  })
})
