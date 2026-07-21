import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// Merge a Branch (Phase 84) — one-click "Merge into <current>" on the Branches screen.
// Each scenario gets its own repo (not the shared branches.spec.ts fixture) because a
// merge permanently mutates history / leaves mid-merge state, unlike the read-mostly
// switch/create/delete tests in that file.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-branch-merge-empty.gitconfig')

function launchApp(): Promise<ElectronApplication> {
  return launchIsolatedApp({ GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG })
}

async function cleanupAll(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const reposRes = await api.repositories.list()
    if (reposRes.ok) {
      for (const r of reposRes.data) await api.repositories.delete(r.id)
    }
  })
}

function gitInit(cwd: string): void {
  execSync('git init -b main', { cwd, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd, stdio: 'pipe' })
}

let cleanRepo: string
let conflictRepo: string
let dirtyRepo: string
let detachedRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  // Clean / fast-forwardable: feature-clean adds an unrelated file.
  cleanRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-branch-merge-clean-'))
  gitInit(cleanRepo)
  fs.writeFileSync(path.join(cleanRepo, 'base.txt'), 'one\n')
  execSync('git add base.txt', { cwd: cleanRepo, stdio: 'pipe' })
  execSync('git commit -m c1', { cwd: cleanRepo, stdio: 'pipe' })
  execSync('git checkout -b feature-clean', { cwd: cleanRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(cleanRepo, 'feature.txt'), 'feature work\n')
  execSync('git add feature.txt', { cwd: cleanRepo, stdio: 'pipe' })
  execSync('git commit -m "feature commit"', { cwd: cleanRepo, stdio: 'pipe' })
  execSync('git checkout main', { cwd: cleanRepo, stdio: 'pipe' })

  // Conflicting: both branches edit the SAME line of clash.txt.
  conflictRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-branch-merge-conflict-'))
  gitInit(conflictRepo)
  fs.writeFileSync(path.join(conflictRepo, 'clash.txt'), 'base\n')
  execSync('git add clash.txt', { cwd: conflictRepo, stdio: 'pipe' })
  execSync('git commit -m c1', { cwd: conflictRepo, stdio: 'pipe' })
  execSync('git checkout -b feature-conflict', { cwd: conflictRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(conflictRepo, 'clash.txt'), 'feature edit\n')
  execSync('git commit -am "feature edit"', { cwd: conflictRepo, stdio: 'pipe' })
  execSync('git checkout main', { cwd: conflictRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(conflictRepo, 'clash.txt'), 'main edit\n')
  execSync('git commit -am "main edit"', { cwd: conflictRepo, stdio: 'pipe' })

  // Dirty working tree: feature-dirty exists, but main has an uncommitted change.
  dirtyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-branch-merge-dirty-'))
  gitInit(dirtyRepo)
  fs.writeFileSync(path.join(dirtyRepo, 'base.txt'), 'one\n')
  execSync('git add base.txt', { cwd: dirtyRepo, stdio: 'pipe' })
  execSync('git commit -m c1', { cwd: dirtyRepo, stdio: 'pipe' })
  execSync('git branch feature-dirty', { cwd: dirtyRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(dirtyRepo, 'base.txt'), 'dirty\n') // uncommitted on top

  // Detached HEAD: no current branch, so the Merge action must not render anywhere.
  detachedRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-branch-merge-detached-'))
  gitInit(detachedRepo)
  fs.writeFileSync(path.join(detachedRepo, 'base.txt'), 'one\n')
  execSync('git add base.txt', { cwd: detachedRepo, stdio: 'pipe' })
  execSync('git commit -m c1', { cwd: detachedRepo, stdio: 'pipe' })
  execSync('git branch other-branch', { cwd: detachedRepo, stdio: 'pipe' })
  const sha = execSync('git rev-parse HEAD', { cwd: detachedRepo }).toString().trim()
  execSync(`git checkout ${sha}`, { cwd: detachedRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  for (const d of [cleanRepo, conflictRepo, dirtyRepo, detachedRepo]) {
    fs.rmSync(d, { recursive: true, force: true })
  }
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Branches — Merge a Branch', () => {
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

  async function registerRepo(repoPath: string): Promise<void> {
    await win.evaluate(async (p: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({ name: 'merge-fixture', localPath: p, isFavorite: false })
    }, repoPath)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }

  test('a clean merge folds the feature branch in, shows success, and refreshes the list', async () => {
    await registerRepo(cleanRepo)
    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()
    await expect(win.getByTestId('branches-current-branch')).toContainText('main', {
      timeout: 10000,
    })

    const row = win.getByTestId('branches-local-item-feature-clean')
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.getByTestId('branches-merge-btn')).toContainText('main')
    await row.getByTestId('branches-merge-btn').click()
    await expect(row.getByTestId('branches-merge-confirm-btn')).toBeVisible()
    await row.getByTestId('branches-merge-confirm-btn').click()

    await expect(win.getByTestId('branches-success')).toBeVisible({ timeout: 10000 })
    expect(execSync('git show HEAD:feature.txt', { cwd: cleanRepo }).toString().trim()).toBe(
      'feature work'
    )
  })

  test('a conflicting merge re-diagnoses to "Go to Status", which shows the file conflicted', async () => {
    await registerRepo(conflictRepo)
    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    const row = win.getByTestId('branches-local-item-feature-conflict')
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.getByTestId('branches-merge-btn').click()
    await row.getByTestId('branches-merge-confirm-btn').click()

    // A real content conflict is NEVER auto-resolved — re-diagnosed to a navigate link.
    const goToStatus = win.getByTestId('remediation-navigate-resolve-conflicts')
    await expect(goToStatus).toBeVisible({ timeout: 10000 })
    await expect(goToStatus).toContainText('Status')
    await goToStatus.click()

    await expect(win.getByTestId('screen-status')).toBeVisible({ timeout: 5000 })
    const conflictedRow = win.getByTestId('staged-file-row').filter({ hasText: 'clash.txt' })
    await expect(conflictedRow).toBeVisible({ timeout: 10000 })
    await expect(conflictedRow).toContainText('!') // the conflicted-kind badge

    // Left in git's standard mid-merge state — no auto-resolution.
    expect(fs.existsSync(path.join(conflictRepo, '.git', 'MERGE_HEAD'))).toBe(true)
  })

  test('a dirty working tree refuses the merge with a clear message and never merges', async () => {
    const headBefore = execSync('git rev-parse HEAD', { cwd: dirtyRepo }).toString().trim()

    await registerRepo(dirtyRepo)
    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    const row = win.getByTestId('branches-local-item-feature-dirty')
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.getByTestId('branches-merge-btn').click()
    await row.getByTestId('branches-merge-confirm-btn').click()

    await expect(win.getByTestId('branches-error')).toContainText(/commit or stash/i, {
      timeout: 10000,
    })

    // Never attempted: HEAD is unchanged and no mid-merge state exists.
    const headAfter = execSync('git rev-parse HEAD', { cwd: dirtyRepo }).toString().trim()
    expect(headAfter).toBe(headBefore)
    expect(fs.existsSync(path.join(dirtyRepo, '.git', 'MERGE_HEAD'))).toBe(false)
  })

  test('the merge action is hidden entirely on a detached HEAD', async () => {
    await registerRepo(detachedRepo)
    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()
    await expect(win.getByTestId('branches-local-list')).toContainText('other-branch', {
      timeout: 10000,
    })

    await expect(win.getByTestId('branches-merge-btn')).toHaveCount(0)
  })
})
