import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })
}

/** Delete all profiles and clear activeProfileId via IPC so each test starts clean. */
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

async function fillAndSubmitProfile(
  win: Page,
  data: { displayName: string; gitAuthorName: string; gitAuthorEmail: string; githubUsername: string }
): Promise<void> {
  await win.getByTestId('profiles-new-btn').click()
  await win.getByTestId('profile-form-displayName').fill(data.displayName)
  await win.getByTestId('profile-form-gitAuthorName').fill(data.gitAuthorName)
  await win.getByTestId('profile-form-gitAuthorEmail').fill(data.gitAuthorEmail)
  await win.getByTestId('profile-form-githubUsername').fill(data.githubUsername)
  await win.getByTestId('profile-form-submit').click()
}

test.describe('Profile management', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await cleanupProfiles(win)
    // Reload so the profilesStore re-fetches the now-empty list
    await win.reload()
    await win.waitForLoadState('domcontentloaded')
    // Navigate to the Profiles screen
    await win.getByTestId('nav-profiles').click()
    await expect(win.getByTestId('screen-profiles')).toBeVisible()
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('creates 3 profiles (Personal / Work / Client)', async () => {
    await fillAndSubmitProfile(win, {
      displayName: 'Personal',
      gitAuthorName: 'Jane Personal',
      gitAuthorEmail: 'jane@personal.dev',
      githubUsername: 'janepersonal',
    })
    await fillAndSubmitProfile(win, {
      displayName: 'Work',
      gitAuthorName: 'Jane Work',
      gitAuthorEmail: 'jane@company.com',
      githubUsername: 'janework',
    })
    await fillAndSubmitProfile(win, {
      displayName: 'Client',
      gitAuthorName: 'Jane Client',
      gitAuthorEmail: 'jane@client.dev',
      githubUsername: 'janeclient',
    })

    await expect(win.getByTestId('profiles-list')).toContainText('Personal')
    await expect(win.getByTestId('profiles-list')).toContainText('Work')
    await expect(win.getByTestId('profiles-list')).toContainText('Client')
  })

  test('edits a profile display name', async () => {
    await fillAndSubmitProfile(win, {
      displayName: 'Work',
      gitAuthorName: 'Jane Work',
      gitAuthorEmail: 'jane@company.com',
      githubUsername: 'janework',
    })

    // Select the Work profile to edit it
    await win.getByTestId('profiles-list').getByText('Work').click()
    await win.getByTestId('profile-form-displayName').clear()
    await win.getByTestId('profile-form-displayName').fill('Work Updated')
    await win.getByTestId('profile-form-submit').click()

    await expect(win.getByTestId('profiles-list')).toContainText('Work Updated')
    // Verify only one profile item exists (not both "Work" and "Work Updated")
    await expect(win.getByTestId('profile-item')).toHaveCount(1)
  })

  test('deletes a profile', async () => {
    await fillAndSubmitProfile(win, {
      displayName: 'Client',
      gitAuthorName: 'Jane Client',
      gitAuthorEmail: 'jane@client.dev',
      githubUsername: 'janeclient',
    })

    await win.getByTestId('profiles-list').getByText('Client').click()
    await win.getByTestId('profile-delete-btn').click()
    await win.getByTestId('profile-delete-confirm-btn').click()

    await expect(win.getByTestId('profiles-list')).not.toContainText('Client')
  })

  test('sets active profile and it appears in the header', async () => {
    await fillAndSubmitProfile(win, {
      displayName: 'Personal',
      gitAuthorName: 'Jane Personal',
      gitAuthorEmail: 'jane@personal.dev',
      githubUsername: 'janepersonal',
    })

    // After creating, form stays in edit mode with Personal selected
    await win.getByTestId('profile-set-active-btn').click()

    await expect(win.getByTestId('header-profile')).toContainText('Personal')
    // Button should now show "Active"
    await expect(win.getByTestId('profile-set-active-btn')).toHaveText('Active')
  })

  test('active profile survives an app relaunch', async () => {
    await fillAndSubmitProfile(win, {
      displayName: 'Personal',
      gitAuthorName: 'Jane Personal',
      gitAuthorEmail: 'jane@personal.dev',
      githubUsername: 'janepersonal',
    })
    await win.getByTestId('profile-set-active-btn').click()
    await expect(win.getByTestId('header-profile')).toContainText('Personal')

    // Close the app
    await app.close()

    // Relaunch
    const app2 = await launchApp()
    const win2 = await app2.firstWindow()
    await win2.waitForLoadState('domcontentloaded')

    try {
      // Active profile must still be shown in the header after relaunch
      await expect(win2.getByTestId('header-profile')).toContainText('Personal')
    } finally {
      // Tidy up persisted data
      await cleanupProfiles(win2)
      await app2.close()
    }
  })
})
