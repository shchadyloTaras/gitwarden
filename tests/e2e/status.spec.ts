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
}

// fixture A: hello.txt modified in worktree, not staged
let fixtureA: string
// fixture B: world.txt staged in index AND further modified in worktree (MM)
let fixtureB: string

test.beforeAll(() => {
  // Fixture A: one modified (not staged) file
  fixtureA = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-status-a-'))
  execSync('git init', { cwd: fixtureA, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: fixtureA, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: fixtureA, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureA, 'hello.txt'), 'initial\n')
  execSync('git add hello.txt', { cwd: fixtureA, stdio: 'pipe' })
  execSync('git commit -m "init"', { cwd: fixtureA, stdio: 'pipe' })
  // Modify hello.txt — worktree change, not staged
  fs.writeFileSync(path.join(fixtureA, 'hello.txt'), 'modified\n')

  // Fixture B: staged-and-modified scenario
  fixtureB = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-status-b-'))
  execSync('git init', { cwd: fixtureB, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: fixtureB, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: fixtureB, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureB, 'world.txt'), 'initial\n')
  execSync('git add world.txt', { cwd: fixtureB, stdio: 'pipe' })
  execSync('git commit -m "init"', { cwd: fixtureB, stdio: 'pipe' })
  // Stage a change
  fs.writeFileSync(path.join(fixtureB, 'world.txt'), 'staged content\n')
  execSync('git add world.txt', { cwd: fixtureB, stdio: 'pipe' })
  // Make a further worktree change (not staged) — now world.txt is MM
  fs.writeFileSync(path.join(fixtureB, 'world.txt'), 'staged content + worktree change\n')
})

test.afterAll(() => {
  fs.rmSync(fixtureA, { recursive: true, force: true })
  fs.rmSync(fixtureB, { recursive: true, force: true })
})

test.describe('Status & Staging UI', () => {
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

  test('stages and unstages a file', async () => {
    // Register fixture A via IPC
    await win.evaluate(async (repoPath: string) => {
      return (window as Window & typeof globalThis).api.repositories.create({
        name: 'fixture-a',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureA)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // Navigate to Status screen
    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()

    // fixture-a is auto-selected as active repo

    // hello.txt should appear in unstaged section (modified, not staged)
    await expect(win.getByTestId('unstaged-list')).toContainText('hello.txt', { timeout: 10000 })
    await expect(win.getByTestId('staged-list')).not.toContainText('hello.txt')

    // Stage hello.txt
    await win
      .getByTestId('unstaged-section')
      .locator('[data-testid="unstaged-file-row"]')
      .filter({ hasText: 'hello.txt' })
      .getByTestId('stage-btn')
      .click()

    // Now staged, gone from unstaged
    await expect(win.getByTestId('staged-list')).toContainText('hello.txt', { timeout: 10000 })
    await expect(win.getByTestId('unstaged-list')).not.toContainText('hello.txt')

    // Unstage hello.txt
    await win
      .getByTestId('staged-section')
      .locator('[data-testid="staged-file-row"]')
      .filter({ hasText: 'hello.txt' })
      .getByTestId('unstage-btn')
      .click()

    // Back to unstaged
    await expect(win.getByTestId('unstaged-list')).toContainText('hello.txt', { timeout: 10000 })
    await expect(win.getByTestId('staged-list')).not.toContainText('hello.txt')
  })

  test('staged-and-modified file appears on both staged and unstaged sides', async () => {
    // Register fixture B via IPC
    await win.evaluate(async (repoPath: string) => {
      return (window as Window & typeof globalThis).api.repositories.create({
        name: 'fixture-b',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureB)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // Navigate to Status screen
    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()

    // fixture-b is auto-selected as active repo

    // world.txt is MM: appears in BOTH staged and unstaged sections
    await expect(win.getByTestId('staged-list')).toContainText('world.txt', { timeout: 10000 })
    await expect(win.getByTestId('unstaged-list')).toContainText('world.txt')
  })

  test('switching branch via the header dropdown refreshes status without navigating away', async () => {
    const branchRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-status-branch-'))
    execSync('git init -b main', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: branchRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(branchRepo, 'base.txt'), 'base\n')
    execSync('git add base.txt', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git commit -m "init"', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git checkout -b feature-a', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git checkout main', { cwd: branchRepo, stdio: 'pipe' })

    try {
      await win.evaluate(async (repoPath: string) => {
        return (window as Window & typeof globalThis).api.repositories.create({
          name: 'status-branch-fixture',
          localPath: repoPath,
          isFavorite: false,
        })
      }, branchRepo)

      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await win.getByTestId('nav-status').click()
      await expect(win.getByTestId('screen-status')).toBeVisible()
      await expect(win.getByTestId('untracked-list')).toContainText('No untracked files', {
        timeout: 10000,
      })

      // A file appears in the working tree AFTER the initial load — not through the app —
      // simulating the real-world case where the tree changed underneath the open screen.
      fs.writeFileSync(path.join(branchRepo, 'stale-check.txt'), 'x\n')

      // Switch branch via the HEADER dropdown while staying on the Status screen.
      await win.getByTestId('header-branch-select').click()
      await win.getByTestId('header-branch-select-option-feature-a').click()
      await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
        timeout: 10000,
      })

      // Status must refresh for the newly active branch, showing the file that appeared.
      await expect(win.getByTestId('untracked-list')).toContainText('stale-check.txt', {
        timeout: 10000,
      })
    } finally {
      fs.rmSync(branchRepo, { recursive: true, force: true })
    }
  })
})
