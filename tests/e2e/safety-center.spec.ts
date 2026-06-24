import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-safety-empty.gitconfig')

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG },
  })
}

async function cleanupAll(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const reposRes = await api.repositories.list()
    if (reposRes.ok) {
      for (const r of reposRes.data) await api.repositories.delete(r.id)
    }
    const profilesRes = await api.profiles.list()
    if (profilesRes.ok) {
      for (const p of profilesRes.data) await api.profiles.delete(p.id)
    }
    await api.settings.update({ activeProfileId: undefined })
  })
}

// Fixture A: staged file, no local identity (IDENTITY_UNSET)
let fixtureIdentity: string
// Fixture B: working repo pointing at a local bare remote (REMOTE_HOST_MISMATCH)
let bareRepo: string
let fixtureRemote: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  // --- Fixture A: staged file, identity cleared ---
  fixtureIdentity = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-safety-id-'))
  execSync('git init -b main', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git config user.email "temp@temp.com"', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git config user.name "Temp"', { cwd: fixtureIdentity, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureIdentity, 'readme.txt'), 'initial\n')
  execSync('git add readme.txt', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureIdentity, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureIdentity, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: fixtureIdentity, stdio: 'pipe' })
  // Remove local identity — app will see IDENTITY_UNSET with empty global config
  execSync('git config --unset user.email', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git config --unset user.name', { cwd: fixtureIdentity, stdio: 'pipe' })

  // --- Fixture B: working repo → local bare remote ---
  bareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-safety-bare-'))
  execSync('git init --bare', { cwd: bareRepo, stdio: 'pipe' })
  fixtureRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-safety-work-'))
  execSync('git init -b main', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRemote, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRemote, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync(`git remote add origin "${bareRepo}"`, { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git push origin main', { cwd: fixtureRemote, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureIdentity, { recursive: true, force: true })
  fs.rmSync(fixtureRemote, { recursive: true, force: true })
  fs.rmSync(bareRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    /* ignore */
  }
})

test.describe('Safety Center', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('IDENTITY_UNSET: Safety Center blocks commit, matches CommitScreen gate', async () => {
    // Profile whose email won't match (no local identity set)
    const profileId = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const res = await api.profiles.create({
        displayName: 'Alice',
        gitAuthorName: 'Alice Dev',
        gitAuthorEmail: 'alice@example.com',
        githubUsername: 'alice',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: [],
      })
      return res.ok ? res.data.id : null
    })
    expect(profileId).toBeTruthy()

    await win.evaluate(async (id: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.settings.update({ activeProfileId: id })
    }, profileId as string)

    await win.evaluate(
      async ([repoPath, pid]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'identity-fixture',
          localPath: repoPath,
          assignedProfileId: pid,
          isFavorite: false,
        })
      },
      [fixtureIdentity, profileId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // --- Check Safety Center (identity-fixture auto-selected) ---
    await win.getByTestId('nav-safety-center').click()
    await expect(win.getByTestId('screen-safety-center')).toBeVisible()

    // Wait for audit to load
    await expect(win.getByTestId('safety-can-commit')).toBeVisible({ timeout: 10000 })

    // IDENTITY_UNSET → can-commit = No
    await expect(win.getByTestId('safety-can-commit')).toContainText('No')
    await expect(win.getByTestId('safety-issue-IDENTITY_UNSET')).toBeVisible()

    // --- Verify CommitScreen agrees (same repo still active) ---
    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
    await expect(win.getByTestId('commit-staged-summary')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('commit-message').fill('test commit')
    // Commit button must be disabled — matching the Safety Center "No"
    await expect(win.getByTestId('commit-btn')).toBeDisabled({ timeout: 5000 })
    await expect(win.getByTestId('commit-blocker')).toBeVisible()
  })

  test('REMOTE_HOST_MISMATCH: Safety Center blocks push, matches RemoteScreen gate', async () => {
    // Profile with github.com constraint — local bare repo has no host
    const profileId = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const res = await api.profiles.create({
        displayName: 'Work',
        gitAuthorName: 'Alice Dev',
        gitAuthorEmail: 'alice@example.com',
        githubUsername: 'alice',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: ['github.com'],
      })
      return res.ok ? res.data.id : null
    })
    expect(profileId).toBeTruthy()

    await win.evaluate(async (id: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.settings.update({ activeProfileId: id })
    }, profileId as string)

    await win.evaluate(
      async ([repoPath, pid]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'remote-fixture',
          localPath: repoPath,
          assignedProfileId: pid,
          isFavorite: false,
        })
      },
      [fixtureRemote, profileId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // --- Check Safety Center (remote-fixture auto-selected) ---
    await win.getByTestId('nav-safety-center').click()
    await expect(win.getByTestId('screen-safety-center')).toBeVisible()

    await expect(win.getByTestId('safety-can-push')).toBeVisible({ timeout: 10000 })

    // Identity is set and matches → can-commit = Yes
    await expect(win.getByTestId('safety-can-commit')).toContainText('Yes')
    // But remote host doesn't match → can-push = No
    await expect(win.getByTestId('safety-can-push')).toContainText('No')
    await expect(win.getByTestId('safety-issue-REMOTE_HOST_MISMATCH')).toBeVisible()

    // --- Verify RemoteScreen agrees (same repo still active) ---
    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })
    // Confirm button must be disabled — matching the Safety Center "No"
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()
    await expect(win.getByTestId('remote-push-blocker')).toBeVisible()
  })
})
