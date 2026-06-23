import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-remote-empty.gitconfig')

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

let bareRepo: string
let workingRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  // Create a bare repo that acts as the "remote"
  bareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-bare-'))
  execSync('git init --bare', { cwd: bareRepo, stdio: 'pipe' })

  // Create a working repo with an initial commit and push it to bare
  workingRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-work-'))
  execSync('git init -b main', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: workingRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(workingRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: workingRepo, stdio: 'pipe' })
  execSync(`git remote add origin "${bareRepo}"`, { cwd: workingRepo, stdio: 'pipe' })
  execSync('git push origin main', { cwd: workingRepo, stdio: 'pipe' })

  // Add a second commit that has NOT been pushed — this is what the app will push
  fs.writeFileSync(path.join(workingRepo, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git commit -m "add feature"', { cwd: workingRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(workingRepo, { recursive: true, force: true })
  fs.rmSync(bareRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Remote Operations', () => {
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

  test('push is blocked on REMOTE_HOST_MISMATCH when profile has github.com constraint', async () => {
    // Create profile expecting github.com — local bare repo has no host
    const aliceId = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const res = await api.profiles.create({
        displayName: 'Alice',
        gitAuthorName: 'Alice Dev',
        gitAuthorEmail: 'alice@example.com',
        githubUsername: 'alice',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: ['github.com'],
      })
      return res.ok ? res.data.id : null
    })
    expect(aliceId).toBeTruthy()

    await win.evaluate(async (id: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.settings.update({ activeProfileId: id })
    }, aliceId as string)

    await win.evaluate(
      async ([repoPath, profileId]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'work-repo',
          localPath: repoPath,
          assignedProfileId: profileId,
          isFavorite: false,
        })
      },
      [workingRepo, aliceId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()

    await win.getByTestId('remote-repo-select').selectOption({ label: 'work-repo' })
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('remote-current-branch')).toContainText('main')

    // Open push sheet for origin
    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    // REMOTE_HOST_MISMATCH blocker must be visible
    await expect(win.getByTestId('remote-push-blocker')).toBeVisible()
    await expect(win.getByTestId('remote-push-blocker')).toContainText('remote host does not match')

    // Confirm Push button must be disabled
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()
  })

  test('push succeeds with explicit confirmation when no blockers', async () => {
    // Profile with no host constraints — all remotes are acceptable
    const aliceId = await win.evaluate(async () => {
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
    expect(aliceId).toBeTruthy()

    await win.evaluate(async (id: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.settings.update({ activeProfileId: id })
    }, aliceId as string)

    await win.evaluate(
      async ([repoPath, profileId]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'work-repo',
          localPath: repoPath,
          assignedProfileId: profileId,
          isFavorite: false,
        })
      },
      [workingRepo, aliceId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()

    await win.getByTestId('remote-repo-select').selectOption({ label: 'work-repo' })
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })

    // Open push sheet
    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    // No blockers — confirm button must be enabled
    await expect(win.getByTestId('remote-push-blocker')).not.toBeVisible()
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled()

    // Confirm the push
    await win.getByTestId('remote-push-confirm-btn').click()

    // Sheet closes and success message appears
    await expect(win.getByTestId('remote-push-sheet')).not.toBeVisible({ timeout: 15000 })
    await expect(win.getByTestId('remote-success')).toBeVisible({ timeout: 15000 })
    await expect(win.getByTestId('remote-success')).toContainText('Pushed main to origin')

    // Verify the bare repo received the commit on main
    const latestSubject = execSync('git log main --format=%s -n 1', { cwd: bareRepo })
      .toString()
      .trim()
    expect(latestSubject).toBe('add feature')
  })
})
