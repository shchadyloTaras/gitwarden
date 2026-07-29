import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
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
}

// fixture A: hello.txt modified in worktree, not staged
let fixtureA: string
// fixture B: world.txt staged in index AND further modified in worktree (MM)
let fixtureB: string
// fixture C: enough staged, unstaged, and untracked files to overflow every status list
let fixtureC: string

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

  // Fixture C: three independently overflowing status lists
  fixtureC = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-status-scroll-'))
  execSync('git init -b main', { cwd: fixtureC, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: fixtureC, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: fixtureC, stdio: 'pipe' })

  const stagedFiles = Array.from({ length: 16 }, (_, index) => `staged-${index}.txt`)
  const unstagedFiles = Array.from({ length: 16 }, (_, index) => `unstaged-${index}.txt`)

  for (const fileName of [...stagedFiles, ...unstagedFiles]) {
    fs.writeFileSync(path.join(fixtureC, fileName), 'initial\n')
  }
  execSync('git add .', { cwd: fixtureC, stdio: 'pipe' })
  execSync('git commit -m "init"', { cwd: fixtureC, stdio: 'pipe' })

  for (const fileName of stagedFiles) {
    fs.writeFileSync(path.join(fixtureC, fileName), 'staged change\n')
  }
  execFileSync('git', ['add', '--', ...stagedFiles], { cwd: fixtureC, stdio: 'pipe' })

  for (const fileName of unstagedFiles) {
    fs.writeFileSync(path.join(fixtureC, fileName), 'unstaged change\n')
  }
  for (let index = 0; index < 16; index += 1) {
    fs.writeFileSync(path.join(fixtureC, `new-${index}.txt`), 'new file\n')
  }
})

test.afterAll(() => {
  fs.rmSync(fixtureA, { recursive: true, force: true })
  fs.rmSync(fixtureB, { recursive: true, force: true })
  fs.rmSync(fixtureC, { recursive: true, force: true })
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
    await expect(win.getByTestId('working-copy-destination-card')).toContainText(
      '1 uncommitted change'
    )
    await expect(win.getByTestId('working-copy-destination-card')).toContainText(
      'Not in any branch yet.'
    )
  })

  test('keeps staged, unstaged, and new-file lists independently scrollable', async () => {
    await win.evaluate(async (repoPath: string) => {
      return (window as Window & typeof globalThis).api.repositories.create({
        name: 'status-scroll-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureC)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.getByTestId('nav-status').click()
    await win.setViewportSize({ width: 1100, height: 720 })

    const listTestIds = ['staged-list', 'unstaged-list', 'untracked-list'] as const
    for (const testId of listTestIds) {
      const metrics = await win.getByTestId(testId).evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }))

      expect(metrics.overflowY).toBe('auto')
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
    }

    await win.getByTestId('staged-list').evaluate((element) => {
      element.scrollTop = 120
    })

    await expect
      .poll(() => win.getByTestId('staged-list').evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    expect(await win.getByTestId('unstaged-list').evaluate((element) => element.scrollTop)).toBe(0)
    expect(await win.getByTestId('untracked-list').evaluate((element) => element.scrollTop)).toBe(0)

    const changesPane = win.getByTestId('status-changes-pane')
    await expect(changesPane).toHaveCSS('overflow-y', 'hidden')
    expect(await changesPane.evaluate((element) => element.scrollTop)).toBe(0)
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
      await expect(win.getByTestId('working-copy-destination-card')).toContainText(
        'Working copy clean'
      )
      await expect(win.getByTestId('working-copy-destination-card')).toContainText(
        'No changes are waiting to commit.'
      )
      await expect(win.getByTestId('working-copy-destination-card')).toContainText(
        'Checked out: main'
      )
      await expect(win.getByTestId('global-header')).toContainText('Checked out:')
      await expect(win.getByTestId('untracked-section')).toContainText('NEW FILES')
      await expect(win.getByTestId('untracked-section')).toContainText('Not yet in Git history.')

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
      await expect(win.getByTestId('working-copy-destination-card')).toContainText(
        'Checked out: feature-a'
      )

      await win.setViewportSize({ width: 640, height: 800 })
      await expect(win.getByTestId('working-copy-destination-card')).toHaveCSS(
        'flex-direction',
        'column'
      )
    } finally {
      fs.rmSync(branchRepo, { recursive: true, force: true })
    }
  })

  test('names detached HEAD instead of inventing a destination branch', async () => {
    const detachedRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-status-detached-'))
    execSync('git init -b main', { cwd: detachedRepo, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', { cwd: detachedRepo, stdio: 'pipe' })
    execSync('git config user.name "Test"', { cwd: detachedRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(detachedRepo, 'base.txt'), 'base\n')
    execSync('git add base.txt', { cwd: detachedRepo, stdio: 'pipe' })
    execSync('git commit -m "init"', { cwd: detachedRepo, stdio: 'pipe' })
    execSync('git checkout --detach', { cwd: detachedRepo, stdio: 'pipe' })

    try {
      await win.evaluate(async (repoPath: string) => {
        return (window as Window & typeof globalThis).api.repositories.create({
          name: 'status-detached-fixture',
          localPath: repoPath,
          isFavorite: false,
        })
      }, detachedRepo)

      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await win.getByTestId('nav-status').click()

      const card = win.getByTestId('working-copy-destination-card')
      await expect(card).toContainText('Detached HEAD', { timeout: 10000 })
      await expect(card).toContainText('A commit will not join a branch until you create one.')
      await expect(card).not.toContainText('Checked out: main')
    } finally {
      fs.rmSync(detachedRepo, { recursive: true, force: true })
    }
  })
})
