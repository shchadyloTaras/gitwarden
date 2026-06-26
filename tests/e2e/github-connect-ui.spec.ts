import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'

// Phase 26 — "Connect GitHub" UI.
//
// Drives the full GitKraken-style flow against the injected fake service
// (GITWARDEN_E2E_FAKE_GITHUB=1): Connect → modal shows the device code → the fake
// poller authorizes → the four identity fields auto-fill and a linked @login badge
// appears → Disconnect clears the badge. The fake never touches real GitHub, and the
// browser-open seam is a no-op under the flag, so no external browser launches.

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GITWARDEN_E2E_FAKE_GITHUB: '1' },
  })
}

async function cleanupProfiles(win: Page): Promise<void> {
  const listRes = await win.evaluate(async () =>
    (window as Window & typeof globalThis).api.profiles.list()
  )
  if (listRes.ok) {
    for (const p of listRes.data) {
      await win.evaluate(
        async (id: string) => (window as Window & typeof globalThis).api.profiles.delete(id),
        p.id
      )
    }
  }
  await win.evaluate(async () =>
    (window as Window & typeof globalThis).api.settings.update({ activeProfileId: undefined })
  )
}

async function createProfile(win: Page): Promise<void> {
  await win.getByTestId('profiles-new-btn').click()
  await win.getByTestId('profile-form-displayName').fill('Personal')
  await win.getByTestId('profile-form-gitAuthorName').fill('Placeholder Name')
  await win.getByTestId('profile-form-gitAuthorEmail').fill('placeholder@example.com')
  await win.getByTestId('profile-form-githubUsername').fill('placeholder')
  await win.getByTestId('profile-form-submit').click()
}

test.describe('Connect GitHub UI (injected fake service)', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupProfiles(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.getByTestId('nav-profiles').click()
    await expect(win.getByTestId('screen-profiles')).toBeVisible()
  })

  test.afterEach(async () => {
    await cleanupProfiles(win)
    await app.close()
  })

  test('connect → modal shows code → authorized → fields auto-fill + badge → disconnect clears it', async () => {
    await createProfile(win)

    // The GitHub section offers Connect for the freshly saved profile.
    const connectBtn = win.getByTestId('github-connect-btn')
    await expect(connectBtn).toBeVisible()
    await connectBtn.click()

    // Modal appears and shows the device code from the fake service.
    await expect(win.getByTestId('github-connect-modal')).toBeVisible()
    await expect(win.getByTestId('github-connect-user-code')).toHaveText('WDJB-MJHT')

    // A Copy button sits beside the code so the user can paste it on github.com.
    await expect(win.getByTestId('github-connect-copy')).toBeVisible()

    // The fake poller authorizes after one interval.
    await expect(win.getByTestId('github-connect-success')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('github-connect-done').click()
    await expect(win.getByTestId('github-connect-modal')).toHaveCount(0)

    // The three identity fields auto-fill from the GitHub account; displayName (already
    // set) is preserved.
    await expect(win.getByTestId('profile-form-gitAuthorName')).toHaveValue('The Octocat')
    await expect(win.getByTestId('profile-form-githubUsername')).toHaveValue('octocat')
    await expect(win.getByTestId('profile-form-gitAuthorEmail')).toHaveValue(
      'octocat@users.noreply.github.com'
    )
    await expect(win.getByTestId('profile-form-displayName')).toHaveValue('Personal')

    // A linked @login badge appears.
    await expect(win.getByTestId('github-linked-badge')).toBeVisible()
    await expect(win.getByTestId('github-linked-login')).toHaveText('@octocat')

    // The token is stored for this profile (read indirectly: link persisted).
    const linked = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const list = await api.profiles.list()
      if (!list.ok || !list.data[0]) return null
      return api.github.getLinkedAccount(list.data[0].id)
    })
    expect(linked && linked.ok ? linked.data?.login : null).toBe('octocat')

    // Disconnect (with confirm) clears the badge and the persisted link.
    await win.getByTestId('github-disconnect-btn').click()
    await win.getByTestId('github-disconnect-confirm-btn').click()
    await expect(win.getByTestId('github-linked-badge')).toHaveCount(0)
    await expect(win.getByTestId('github-connect-btn')).toBeVisible()

    const afterDisconnect = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const list = await api.profiles.list()
      if (!list.ok || !list.data[0]) return null
      return api.github.getLinkedAccount(list.data[0].id)
    })
    expect(afterDisconnect && afterDisconnect.ok ? afterDisconnect.data : 'x').toBeNull()
  })

  test('Cancel closes the modal without linking', async () => {
    await createProfile(win)
    await win.getByTestId('github-connect-btn').click()
    await expect(win.getByTestId('github-connect-modal')).toBeVisible()

    await win.getByTestId('github-connect-cancel').click()
    await expect(win.getByTestId('github-connect-modal')).toHaveCount(0)
    // No badge — the profile stays unlinked.
    await expect(win.getByTestId('github-linked-badge')).toHaveCount(0)
    await expect(win.getByTestId('github-connect-btn')).toBeVisible()
  })

  // ── One-click connect from a brand-new profile (variant B) ─────────────────

  test('new profile: Connect GitHub saves a draft and auto-fills identity', async () => {
    // Start a new profile and fill ONLY the display name — GitHub supplies the rest.
    await win.getByTestId('profiles-new-btn').click()
    await win.getByTestId('profile-form-displayName').fill('Work')

    await win.getByTestId('github-connect-new-btn').click()

    // The draft is saved and the modal opens against the new profile id.
    await expect(win.getByTestId('github-connect-modal')).toBeVisible()
    await expect(win.getByTestId('github-connect-user-code')).toHaveText('WDJB-MJHT')
    await expect(win.getByTestId('github-connect-success')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('github-connect-done').click()
    await expect(win.getByTestId('github-connect-modal')).toHaveCount(0)

    // Identity auto-fills from the GitHub account; the typed display name is preserved.
    await expect(win.getByTestId('profile-form-gitAuthorName')).toHaveValue('The Octocat')
    await expect(win.getByTestId('profile-form-githubUsername')).toHaveValue('octocat')
    await expect(win.getByTestId('profile-form-gitAuthorEmail')).toHaveValue(
      'octocat@users.noreply.github.com'
    )
    await expect(win.getByTestId('profile-form-displayName')).toHaveValue('Work')
    await expect(win.getByTestId('github-linked-badge')).toBeVisible()

    // Exactly one profile persisted — the draft, now linked.
    const list = await win.evaluate(async () =>
      (window as Window & typeof globalThis).api.profiles.list()
    )
    expect(list.ok ? list.data.length : 0).toBe(1)
    expect(list.ok ? list.data[0].linkedGitHub?.login : null).toBe('octocat')
  })

  test('new profile: Connect GitHub requires a display name', async () => {
    await win.getByTestId('profiles-new-btn').click()
    // No display name entered.
    await win.getByTestId('github-connect-new-btn').click()

    // No modal, an inline error, and nothing persisted.
    await expect(win.getByTestId('github-connect-modal')).toHaveCount(0)
    await expect(win.getByText('Enter a display name to connect a GitHub account.')).toBeVisible()
    const list = await win.evaluate(async () =>
      (window as Window & typeof globalThis).api.profiles.list()
    )
    expect(list.ok ? list.data.length : 0).toBe(0)
  })

  test('new profile: cancelling OAuth keeps the saved draft', async () => {
    await win.getByTestId('profiles-new-btn').click()
    await win.getByTestId('profile-form-displayName').fill('Draft')
    await win.getByTestId('github-connect-new-btn').click()
    await expect(win.getByTestId('github-connect-modal')).toBeVisible()

    await win.getByTestId('github-connect-cancel').click()
    await expect(win.getByTestId('github-connect-modal')).toHaveCount(0)

    // The draft survives, unlinked, and the screen explains it.
    await expect(win.getByTestId('profile-saved-msg')).toBeVisible()
    await expect(win.getByTestId('github-linked-badge')).toHaveCount(0)
    await expect(win.getByTestId('github-connect-btn')).toBeVisible()

    const list = await win.evaluate(async () =>
      (window as Window & typeof globalThis).api.profiles.list()
    )
    expect(list.ok ? list.data.length : 0).toBe(1)
    expect(list.ok ? list.data[0].displayName : null).toBe('Draft')
  })

  test('connecting as a different account than declared warns about the mismatch', async () => {
    // Declare a username the authorized account will NOT match.
    await win.getByTestId('profiles-new-btn').click()
    await win.getByTestId('profile-form-displayName').fill('Personal')
    await win.getByTestId('profile-form-githubUsername').fill('someone-else')

    await win.getByTestId('github-connect-new-btn').click()
    await expect(win.getByTestId('github-connect-success')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('github-connect-done').click()

    // The mismatch is surfaced, and the username is corrected to the authorized account.
    await expect(win.getByTestId('profile-warning-msg')).toBeVisible()
    await expect(win.getByTestId('profile-form-githubUsername')).toHaveValue('octocat')
  })
})
