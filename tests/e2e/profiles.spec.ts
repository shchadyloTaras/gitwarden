import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { profileFixture, type ProfileInput } from '../fixtures/profiles'
import { launchApp } from '../fixtures/launchApp'

/** Delete repositories before profiles, then clear activeProfileId so each test starts clean. */
async function cleanupProfiles(win: Page): Promise<void> {
  const repositoriesRes = await win.evaluate(async () =>
    (window as Window & typeof globalThis).api.repositories.list()
  )
  if (repositoriesRes.ok) {
    for (const repository of repositoriesRes.data) {
      await win.evaluate(
        async (id: string) => (window as Window & typeof globalThis).api.repositories.delete(id),
        repository.id
      )
    }
  }

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

const PERSONAL_REPOSITORY_PATH = '/Users/gitwarden/Projects/personal-notes'
const ELEKEN_DUPLICATE_PATHS = [
  '/Users/gitwarden/Projects/Eleken/clients/acme/shared-checkout-primary',
  '/Users/gitwarden/Projects/Eleken/clients/acme/shared-checkout-secondary',
] as const
const ELEKEN_WEBSITE_PATH = '/Users/gitwarden/Projects/Eleken/marketing/website'

async function seedProfileRepositorySummaries(win: Page): Promise<void> {
  await win.evaluate(
    async ({ profileInputs, repositoryPaths }) => {
      const api = (window as Window & typeof globalThis).api

      async function createProfile(input: ProfileInput): Promise<string> {
        const result = await api.profiles.create(input)
        if (!result.ok) throw new Error(`Failed to seed profile: ${input.displayName}`)
        return result.data.id
      }

      const personalId = await createProfile(profileInputs.personal)
      await createProfile(profileInputs.work)
      const elekenId = await createProfile(profileInputs.eleken)

      const activeResult = await api.settings.update({ activeProfileId: personalId })
      if (!activeResult.ok) throw new Error('Failed to seed the active Personal profile')

      const repositories = [
        {
          name: 'Personal Notes',
          localPath: repositoryPaths.personal,
          remoteUrl: 'git@github.com:janepersonal/personal-notes.git',
          assignedProfileId: personalId,
          isFavorite: false,
        },
        {
          name: 'Shared Checkout',
          localPath: repositoryPaths.elekenDuplicates[0],
          remoteUrl: 'git@github.com:eleken/shared-checkout.git',
          assignedProfileId: elekenId,
          isFavorite: false,
        },
        {
          name: 'Shared Checkout',
          localPath: repositoryPaths.elekenDuplicates[1],
          remoteUrl: 'git@github.com:eleken/shared-checkout.git',
          assignedProfileId: elekenId,
          isFavorite: false,
        },
        {
          name: 'Website',
          localPath: repositoryPaths.elekenWebsite,
          remoteUrl: 'git@github.com:eleken/website.git',
          assignedProfileId: elekenId,
          isFavorite: false,
        },
      ]

      // Keep Personal first: startup auto-selects the first repository and synchronizes its
      // assigned profile, so this preserves the intended Personal-active fixture deterministically.
      for (const repository of repositories) {
        const result = await api.repositories.create(repository)
        if (!result.ok) throw new Error(`Failed to seed repository: ${repository.name}`)
      }
    },
    {
      profileInputs: {
        personal: profileFixture('personal'),
        work: profileFixture('work', { gitAuthorEmail: 'jane@company.com' }),
        eleken: profileFixture('client', {
          displayName: 'Eleken',
          gitAuthorName: 'Eleken Git',
          gitAuthorEmail: 'git@eleken.co',
          githubUsername: 'eleken',
        }),
      },
      repositoryPaths: {
        personal: PERSONAL_REPOSITORY_PATH,
        elekenDuplicates: ELEKEN_DUPLICATE_PATHS,
        elekenWebsite: ELEKEN_WEBSITE_PATH,
      },
    }
  )
}

async function reloadProfilesScreen(win: Page): Promise<void> {
  await win.reload()
  await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  await win.getByTestId('nav-profiles').click()
  await expect(win.getByTestId('screen-profiles')).toBeVisible()
}

async function showContextPanel(win: Page): Promise<void> {
  const inspectorToggle = win.getByRole('button', { name: 'Toggle inspector' })
  if ((await inspectorToggle.getAttribute('aria-expanded')) !== 'true') {
    await inspectorToggle.click()
  }

  const contextTab = win.getByTestId('right-panel-tab-context')
  if ((await contextTab.getAttribute('aria-selected')) !== 'true') {
    await contextTab.click()
  }
  await expect(win.getByTestId('inspector-panel')).toBeVisible()
}

function profileRow(win: Page, displayName: string) {
  return win.getByTestId('profile-item').filter({ hasText: displayName })
}

async function fillAndSubmitProfile(
  win: Page,
  data: Pick<ProfileInput, 'displayName' | 'gitAuthorName' | 'gitAuthorEmail' | 'githubUsername'>
): Promise<void> {
  await win.getByTestId('profiles-new-btn').click()
  await win.getByTestId('profile-form-displayName').fill(data.displayName)
  await win.getByTestId('profile-form-gitAuthorName').fill(data.gitAuthorName)
  await win.getByTestId('profile-form-gitAuthorEmail').fill(data.gitAuthorEmail)
  await win.getByTestId('profile-form-githubUsername').fill(data.githubUsername)
  await win.getByTestId('profile-form-submit').click()
}

async function resolvedThemeColor(
  win: Page,
  token:
    | '--gw-profile-active-indicator'
    | '--gw-profile-inactive-indicator'
    | '--gw-profile-active-text'
) {
  return win.evaluate((cssToken) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${cssToken})`
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, token)
}

test.describe('Profile management', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupProfiles(win)
    // Reload so the renderer stores re-fetch the now-empty profile and repository lists.
    await reloadProfilesScreen(win)
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('creates 3 profiles (Personal / Work / Client)', async () => {
    await fillAndSubmitProfile(win, profileFixture('personal'))
    await fillAndSubmitProfile(win, profileFixture('work', { gitAuthorEmail: 'jane@company.com' }))
    await fillAndSubmitProfile(win, profileFixture('client'))

    await expect(win.getByTestId('profiles-list')).toContainText('Personal')
    await expect(win.getByTestId('profiles-list')).toContainText('Work')
    await expect(win.getByTestId('profiles-list')).toContainText('Client')
  })

  test('edits a profile display name', async () => {
    await fillAndSubmitProfile(win, profileFixture('work', { gitAuthorEmail: 'jane@company.com' }))

    // Select the Work profile to edit it
    await win.getByTestId('profiles-list').getByText('Work').click()
    await win.getByTestId('profile-form-displayName').clear()
    await win.getByTestId('profile-form-displayName').fill('Work Updated')
    await win.getByTestId('profile-form-submit').click()

    await expect(win.getByTestId('profile-saved-msg')).toContainText('Profile saved.')
    await expect(win.getByTestId('profiles-list')).toContainText('Work Updated')
    // Verify only one profile item exists (not both "Work" and "Work Updated")
    await expect(win.getByTestId('profile-item')).toHaveCount(1)
  })

  test('deletes a profile', async () => {
    await fillAndSubmitProfile(win, profileFixture('client'))

    await win.getByTestId('profiles-list').getByText('Client').click()
    await win.getByTestId('profile-delete-btn').click()
    await win.getByTestId('profile-delete-confirm-btn').click()

    await expect(win.getByTestId('profiles-list')).not.toContainText('Client')
  })

  test('shows a distinct message for a malformed email vs. required fields', async () => {
    // "user@localhost" passes the browser's own type="email" constraint (no dot
    // required) but fails our stricter format check — a message distinct from
    // "are required" (Phase 105).
    await fillAndSubmitProfile(
      win,
      profileFixture('personal', { gitAuthorEmail: 'user@localhost' })
    )

    await expect(win.getByTestId('profile-form-error')).toContainText('valid email')
    await expect(win.getByTestId('profile-form-error')).not.toContainText('are required')
  })

  test('sets active profile and it appears in the header', async () => {
    await fillAndSubmitProfile(win, profileFixture('personal'))

    // After creating, form stays in edit mode with Personal selected
    await win.getByTestId('profile-set-active-btn').click()

    await expect(win.getByTestId('header-profile')).toContainText('Personal')
    // Button should now show "Active"
    await expect(win.getByTestId('profile-set-active-btn')).toHaveText('Active')
  })

  test('uses green for the active profile and yellow for inactive profiles', async () => {
    await fillAndSubmitProfile(win, profileFixture('personal'))
    await fillAndSubmitProfile(win, profileFixture('work', { gitAuthorEmail: 'jane@company.com' }))

    const personalRow = win.getByTestId('profile-item').filter({ hasText: 'Personal' })
    const workRow = win.getByTestId('profile-item').filter({ hasText: 'Work' })
    await workRow.getByTestId('profile-row-set-active-btn').click()

    const activeColor = await resolvedThemeColor(win, '--gw-profile-active-indicator')
    const inactiveColor = await resolvedThemeColor(win, '--gw-profile-inactive-indicator')
    const activeTextColor = await resolvedThemeColor(win, '--gw-profile-active-text')

    await expect(workRow.getByTestId('profile-status-indicator')).toHaveAttribute(
      'data-profile-state',
      'active'
    )
    await expect(workRow.getByTestId('profile-status-indicator')).toHaveCSS(
      'background-color',
      activeColor
    )
    await expect(personalRow.getByTestId('profile-status-indicator')).toHaveAttribute(
      'data-profile-state',
      'inactive'
    )
    await expect(personalRow.getByTestId('profile-status-indicator')).toHaveCSS(
      'background-color',
      inactiveColor
    )
    await expect(win.getByTestId('header-profile-status-indicator')).toHaveCSS(
      'background-color',
      activeColor
    )
    await expect(workRow.getByTestId('profile-active-badge')).toHaveCSS('color', activeTextColor)
  })

  test('shows 0/1/many counts and distinct duplicate working copies without changing activation', async () => {
    await seedProfileRepositorySummaries(win)
    await reloadProfilesScreen(win)
    await showContextPanel(win)

    const workRow = profileRow(win, 'Work')
    const personalRow = profileRow(win, 'Personal')
    const elekenRow = profileRow(win, 'Eleken')

    await expect(workRow.getByTestId('profile-repository-count-badge')).toHaveText('0')
    await expect(workRow.getByTestId('profile-repository-count-badge')).toHaveAccessibleName(
      '0 assigned repositories'
    )
    await expect(personalRow.getByTestId('profile-repository-count-badge')).toHaveText('1')
    await expect(personalRow.getByTestId('profile-repository-count-badge')).toHaveAccessibleName(
      '1 assigned repository'
    )
    await expect(elekenRow.getByTestId('profile-repository-count-badge')).toHaveText('3')
    await expect(elekenRow.getByTestId('profile-repository-count-badge')).toHaveAccessibleName(
      '3 assigned repositories'
    )

    await workRow.getByText('Work', { exact: true }).click()
    await expect(win.getByTestId('inspector-assigned-repository-count')).toContainText('0')
    await expect(win.getByTestId('inspector-repositories-empty')).toHaveText(
      'No repositories assigned'
    )

    await personalRow.getByText('Personal', { exact: true }).click()
    await expect(win.getByTestId('inspector-assigned-repository-count')).toContainText('1')
    await expect(win.getByTestId('inspector-assigned-repository-row')).toHaveCount(1)

    await elekenRow.getByText('Eleken', { exact: true }).click()

    const activeWorkspace = win.getByTestId('inspector-active-workspace-group')
    const selectedProfile = win.getByTestId('inspector-selected-profile-group')
    await expect(activeWorkspace).toContainText(/Active workspace/i)
    await expect(activeWorkspace).toContainText('Personal')
    await expect(selectedProfile).toContainText(/Selected profile/i)
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveText('Eleken')
    await expect(win.getByTestId('inspector-assigned-repository-count')).toContainText('3')

    const repositoryList = win.getByTestId('inspector-assigned-repository-list')
    const repositoryRows = repositoryList.getByTestId('inspector-assigned-repository-row')
    await expect(repositoryRows).toHaveCount(3)
    await expect(repositoryRows.filter({ hasText: 'Shared Checkout' })).toHaveCount(2)

    for (const localPath of ELEKEN_DUPLICATE_PATHS) {
      const path = repositoryList
        .getByTestId('inspector-assigned-repository-path')
        .filter({ hasText: localPath })
      await expect(path).toHaveCount(1)
      await expect(path).toHaveAttribute('title', localPath)
      await expect(path.locator('.gw-visually-hidden')).toHaveText(
        `Local path for Shared Checkout: ${localPath}`
      )
    }

    const truncatedPath = repositoryList
      .getByTestId('inspector-assigned-repository-path')
      .filter({ hasText: ELEKEN_DUPLICATE_PATHS[0] })
    const truncation = await truncatedPath.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }
    })
    expect(truncation).toMatchObject({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    })
    expect(truncation.scrollWidth).toBeGreaterThan(truncation.clientWidth)

    // Selecting Eleken remains a read-only inspection action: the active identity and
    // long-standing Edit Profile / Set Active controls keep their existing behavior.
    await expect(win.getByTestId('header-profile')).toContainText('Personal')
    await expect(personalRow.getByTestId('profile-active-badge')).toHaveText('Active')
    await expect(elekenRow.getByTestId('profile-row-set-active-btn')).toHaveText('Set Active')
    await expect(win.getByTestId('profiles-detail-pane').getByRole('heading')).toHaveText(
      'Edit Profile'
    )
    await expect(win.getByTestId('profile-form-displayName')).toHaveValue('Eleken')
    await expect(win.getByTestId('profile-set-active-btn')).toHaveText('Set as Active')
  })

  test('clears selected-profile Context in create mode and after deleting the selection', async () => {
    await seedProfileRepositorySummaries(win)
    await reloadProfilesScreen(win)
    await showContextPanel(win)

    await profileRow(win, 'Eleken').getByText('Eleken', { exact: true }).click()
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveText('Eleken')
    await expect(win.getByTestId('inspector-assigned-repository-list')).toBeVisible()

    await win.getByTestId('profiles-new-btn').click()
    await expect(win.getByTestId('profiles-form').getByRole('heading')).toHaveText('New Profile')
    await expect(win.getByTestId('inspector-selected-profile-prompt')).toBeVisible()
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveCount(0)
    await expect(win.getByTestId('inspector-assigned-repository-list')).toHaveCount(0)

    await profileRow(win, 'Eleken').getByText('Eleken', { exact: true }).click()
    await win.getByTestId('profile-delete-btn').click()
    await win.getByTestId('profile-delete-confirm-btn').click()

    await expect(profileRow(win, 'Eleken')).toHaveCount(0)
    await expect(win.getByTestId('inspector-selected-profile-prompt')).toBeVisible()
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveCount(0)
    await expect(win.getByTestId('inspector-assigned-repository-list')).toHaveCount(0)
    await expect(win.getByTestId('header-profile')).toContainText('Personal')
  })

  test('keeps badges independent of the panel and hides selected Context away from Profiles', async () => {
    await seedProfileRepositorySummaries(win)
    await reloadProfilesScreen(win)
    await showContextPanel(win)

    const workRow = profileRow(win, 'Work')
    const elekenRow = profileRow(win, 'Eleken')
    const elekenBadge = elekenRow.getByTestId('profile-repository-count-badge')

    await win.getByTestId('right-panel-tab-chat').click()
    await expect(win.getByTestId('ai-chat-panel')).toBeVisible()
    await elekenRow.getByText('Eleken', { exact: true }).click()
    await expect(win.getByTestId('right-panel-tab-chat')).toHaveAttribute('aria-selected', 'true')
    await expect(win.getByTestId('ai-chat-panel')).toBeVisible()
    await expect(elekenBadge).toBeVisible()
    await expect(elekenBadge).toHaveText('3')

    await win.getByTestId('right-panel-tab-context').click()
    await expect(win.getByTestId('inspector-selected-profile-group')).toBeVisible()
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveText('Eleken')

    const inspectorToggle = win.getByRole('button', { name: 'Toggle inspector' })
    await inspectorToggle.click()
    await expect(win.getByTestId('right-panel')).toBeHidden()
    await workRow.getByText('Work', { exact: true }).click()
    await expect(win.getByTestId('right-panel')).toBeHidden()
    await expect(elekenBadge).toBeVisible()
    await expect(elekenBadge).toHaveText('3')

    await inspectorToggle.click()
    await expect(win.getByTestId('inspector-selected-profile-group')).toBeVisible()
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveText('Work')
    await elekenRow.getByText('Eleken', { exact: true }).click()
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveText('Eleken')
    await win.getByTestId('nav-repositories').click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible()
    await expect(win.getByTestId('inspector-panel')).toBeVisible()
    await expect(win.getByTestId('inspector-active-workspace-group')).toHaveCount(0)
    await expect(win.getByTestId('inspector-selected-profile-group')).toHaveCount(0)
    await expect(win.getByTestId('inspector-assigned-repository-list')).toHaveCount(0)

    await win.getByTestId('nav-profiles').click()
    await expect(win.getByTestId('inspector-selected-profile-name')).toHaveText('Eleken')
    await expect(win.getByTestId('profile-form-displayName')).toHaveValue('Eleken')
  })

  test('active profile survives an app relaunch', async () => {
    await fillAndSubmitProfile(win, profileFixture('personal'))
    await win.getByTestId('profile-set-active-btn').click()
    await expect(win.getByTestId('header-profile')).toContainText('Personal')

    // Close the app
    await app.close()

    // Relaunch
    const app2 = await launchApp()
    const win2 = await app2.firstWindow()
    await win2.waitForSelector('[data-ready="true"]', { timeout: 10000 })

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
