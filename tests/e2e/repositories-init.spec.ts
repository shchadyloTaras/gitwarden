import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { profileFixture, type ProfileInput } from '../fixtures/profiles'
import { launchApp } from '../fixtures/launchApp'

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

test.describe('Initialize Repository (Phase 88)', () => {
  let app: ElectronApplication
  let win: Page
  let tmpRoot: string

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitwarden-init-e2e-'))
  })

  test.afterEach(async () => {
    await app.close()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('initializes a plain folder, connects a local remote, and lands on Commit', async () => {
    const personalInput = profileFixture('personal')
    const personalId: string = await win.evaluate(async (input: ProfileInput) => {
      const res = await (window as Window & typeof globalThis).api.profiles.create(input)
      return res.ok ? res.data.id : ''
    }, personalInput)
    await win.evaluate(
      async (id: string) =>
        (window as Window & typeof globalThis).api.settings.update({ activeProfileId: id }),
      personalId
    )
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    const targetDir = path.join(tmpRoot, 'new-repo')
    fs.mkdirSync(targetDir, { recursive: true })
    const bareRemote = path.join(tmpRoot, 'remote.git')
    execSync(`git init --bare -b main "${bareRemote}"`, { stdio: 'pipe' })

    await win.getByTestId('nav-repositories').click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible()
    await win.getByTestId('repos-add-btn').click()
    await win.getByTestId('repo-path-input').fill(targetDir)
    await win.getByTestId('repo-validate-btn').click()
    await expect(win.getByTestId('repo-error')).toBeVisible({ timeout: 5000 })

    await win.getByTestId('repo-init-btn').click()
    await expect(win.getByTestId('repo-init-panel')).toBeVisible()
    await expect(win.getByTestId('repo-init-identity-line')).toContainText(
      personalInput.displayName
    )
    await expect(win.getByTestId('repo-init-identity-line')).toContainText('jane@personal.dev')
    await win.getByTestId('repo-init-url-input').fill(bareRemote)
    await win.getByTestId('repo-init-submit-btn').click()

    // Lands on Commit, with the empty repo rendering cleanly.
    await expect(win.getByTestId('screen-commit')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('commit-staged-summary')).toBeVisible()

    await win.getByTestId('nav-history').click()
    await expect(win.getByTestId('screen-history')).toBeVisible()
    await expect(win.getByText('No commits found in this repository.')).toBeVisible()
    await expect(win.getByTestId('history-error')).not.toBeVisible()

    // The repo is in the list, assigned to the active profile.
    await win.getByTestId('nav-repositories').click()
    const repoName = path.basename(targetDir)
    const repoItem = win.getByTestId('repo-item').filter({ hasText: repoName })
    await expect(repoItem).toContainText('Personal')

    // Local identity matches the profile's git identity.
    const identityRes = await win.evaluate(
      async (repoPath: string) =>
        (window as Window & typeof globalThis).api.git.getEffectiveIdentity(repoPath),
      targetDir
    )
    expect(identityRes.ok).toBe(true)
    if (identityRes.ok) {
      expect(identityRes.data.userName).toBe(personalInput.gitAuthorName)
      expect(identityRes.data.userEmail).toBe(personalInput.gitAuthorEmail)
    }
  })

  test('blocks Initialize and creates no repo when no profile is active', async () => {
    const targetDir = path.join(tmpRoot, 'no-profile-repo')
    fs.mkdirSync(targetDir, { recursive: true })

    // A profile must exist to unlock the Repositories nav item, but it stays
    // NOT active — the Initialize gate under test is the missing *active* profile.
    await win.evaluate(async (input: ProfileInput) => {
      await (window as Window & typeof globalThis).api.profiles.create(input)
    }, profileFixture('personal'))
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-repositories').click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible()
    await win.getByTestId('repos-add-btn').click()
    await win.getByTestId('repo-path-input').fill(targetDir)
    await win.getByTestId('repo-validate-btn').click()
    await expect(win.getByTestId('repo-error')).toBeVisible({ timeout: 5000 })

    await expect(win.getByTestId('repo-init-no-profile-hint')).toBeVisible()
    await expect(win.getByTestId('repo-init-btn')).not.toBeVisible()

    const reposRes = await win.evaluate(async () =>
      (window as Window & typeof globalThis).api.repositories.list()
    )
    expect(reposRes.ok && reposRes.data.length).toBe(0)
  })

  test('refuses to initialize a folder nested inside an existing repo, creating no .git', async () => {
    const enclosingRepo = path.join(tmpRoot, 'enclosing')
    execSync(`git init -b main "${enclosingRepo}"`, { stdio: 'pipe' })
    const subfolder = path.join(enclosingRepo, 'sub')
    fs.mkdirSync(subfolder, { recursive: true })

    // The "Initialize Git repository" button only appears after a failed Validate & Add
    // (Decision #2), and Validate & Add's `rev-parse --show-toplevel` check SUCCEEDS for
    // any real, on-disk nested subfolder (it walks up to the ancestor .git) — so this
    // scenario is never reachable via a genuine button click. Exercised directly against
    // the IPC channel instead; the renderer's warning banner is already covered by the
    // other two UI-driven scenarios above.
    const result = await win.evaluate(
      async (params: { repoPath: string; identityName: string; identityEmail: string }) =>
        (window as Window & typeof globalThis).api.git.initializeRepository(params),
      { repoPath: subfolder, identityName: 'Test User', identityEmail: 'test@example.com' }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/already inside a Git repository/i)
    }
    expect(fs.existsSync(path.join(subfolder, '.git'))).toBe(false)
  })

  test('does NOT offer Initialize when the path is empty (empty-path guard, not a validation failure)', async () => {
    // Unlock the Repositories nav item (it is locked while no profiles exist).
    await win.evaluate(async (input: ProfileInput) => {
      await (window as Window & typeof globalThis).api.profiles.create(input)
    }, profileFixture('personal'))
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-repositories').click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible()
    await win.getByTestId('repos-add-btn').click()

    // Press Validate & Add with an empty path — this is a client-side input guard, NOT a
    // git-validation failure, so there is nothing to initialize.
    await win.getByTestId('repo-validate-btn').click()
    await expect(win.getByTestId('repo-error')).toBeVisible({ timeout: 5000 })

    // The Initialize affordance must stay hidden: there is no folder to turn into a repo.
    await expect(win.getByTestId('repo-init-section')).not.toBeVisible()
    await expect(win.getByTestId('repo-init-btn')).not.toBeVisible()
    await expect(win.getByTestId('repo-init-no-profile-hint')).not.toBeVisible()
  })
})
