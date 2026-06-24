import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })
}

let fixtureRepo: string

test.beforeAll(() => {
  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitwarden-fixture-'))
  execSync('git init', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: fixtureRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
})

async function cleanupAll(win: Page): Promise<void> {
  const reposRes = await win.evaluate(async () =>
    (window as Window & typeof globalThis).api.repositories.list()
  )
  if (reposRes.ok) {
    for (const r of reposRes.data) {
      await win.evaluate(
        async (id: string) => (window as Window & typeof globalThis).api.repositories.delete(id),
        r.id
      )
    }
  }

  const profilesRes = await win.evaluate(async () =>
    (window as Window & typeof globalThis).api.profiles.list()
  )
  if (profilesRes.ok) {
    for (const p of profilesRes.data) {
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

test.describe('Repository management', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.getByTestId('nav-repositories').click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible()
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('adds a repository, assigns a profile, shows mismatch warning, and removes it', async () => {
    // Create Personal and Work profiles via IPC
    const personalId: string = await win.evaluate(async () => {
      const res = await (window as Window & typeof globalThis).api.profiles.create({
        displayName: 'Personal',
        gitAuthorName: 'Jane Personal',
        gitAuthorEmail: 'jane@personal.dev',
        githubUsername: 'janepersonal',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: [],
      })
      return res.ok ? res.data.id : ''
    })

    const workId: string = await win.evaluate(async () => {
      const res = await (window as Window & typeof globalThis).api.profiles.create({
        displayName: 'Work',
        gitAuthorName: 'Jane Work',
        gitAuthorEmail: 'jane@work.com',
        githubUsername: 'janework',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: [],
      })
      return res.ok ? res.data.id : ''
    })

    // Set Personal as active profile
    await win.evaluate(
      async (id: string) =>
        (window as Window & typeof globalThis).api.settings.update({ activeProfileId: id }),
      personalId
    )

    // Reload so stores pick up new profiles + active profile
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.getByTestId('nav-repositories').click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible()

    // Add the fixture repo via the UI
    await win.getByTestId('repos-add-btn').click()
    await win.getByTestId('repo-path-input').fill(fixtureRepo)
    await win.getByTestId('repo-validate-btn').click()

    // Wait for the repo to appear in the list
    const repoName = path.basename(fixtureRepo)
    await expect(win.getByTestId('repos-list')).toContainText(repoName, { timeout: 10000 })

    // Should now be in edit mode — assign Work profile
    await win.getByTestId('repo-form-profile').click()
    await win.getByTestId(`repo-form-profile-option-${workId}`).click()
    await win.getByTestId('repo-save-btn').click()

    await expect(win.getByTestId('repo-saved-msg')).toContainText('Repository saved.')

    // Mismatch warning must appear: active=Personal, assigned=Work
    await expect(win.getByTestId('repo-mismatch-warning')).toBeVisible({ timeout: 5000 })
    await expect(win.getByTestId('repo-mismatch-warning')).toContainText('Work')
    await expect(win.getByTestId('repo-mismatch-warning')).toContainText('Personal')

    // List item should show the mismatch indicator
    await expect(win.getByTestId('repo-item-mismatch')).toBeVisible()

    // Remove the repo from the app (not from disk)
    await win.getByTestId('repo-remove-btn').click()
    await win.getByTestId('repo-remove-confirm-btn').click()

    // Repo should no longer appear in the list
    await expect(win.getByTestId('repos-list')).not.toContainText(repoName, { timeout: 5000 })

    // The fixture directory must still exist on disk
    expect(fs.existsSync(fixtureRepo)).toBe(true)
  })

  test('rejects an invalid (non-git) path', async () => {
    const nonGitDir = os.tmpdir()

    await win.getByTestId('repos-add-btn').click()
    await win.getByTestId('repo-path-input').fill(nonGitDir)
    await win.getByTestId('repo-validate-btn').click()

    await expect(win.getByTestId('repo-error')).toBeVisible({ timeout: 5000 })
  })

  test('mismatch warning absent when no active profile is set', async () => {
    const personalId: string = await win.evaluate(async () => {
      const res = await (window as Window & typeof globalThis).api.profiles.create({
        displayName: 'Personal',
        gitAuthorName: 'Jane',
        gitAuthorEmail: 'jane@personal.dev',
        githubUsername: 'jane',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: [],
      })
      return res.ok ? res.data.id : ''
    })

    // No active profile set; reload to sync
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.getByTestId('nav-repositories').click()

    // Add repo and assign Personal
    await win.getByTestId('repos-add-btn').click()
    await win.getByTestId('repo-path-input').fill(fixtureRepo)
    await win.getByTestId('repo-validate-btn').click()
    await expect(win.getByTestId('repos-list')).toContainText(path.basename(fixtureRepo), {
      timeout: 10000,
    })

    await win.getByTestId('repo-form-profile').click()
    await win.getByTestId(`repo-form-profile-option-${personalId}`).click()
    await win.getByTestId('repo-save-btn').click()

    // No active profile → no mismatch warning
    await expect(win.getByTestId('repo-mismatch-warning')).not.toBeVisible()
  })
})
