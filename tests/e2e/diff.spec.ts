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

// fixtureU: hello.txt modified but not staged → unstaged diff
let fixtureU: string
// fixtureS: world.txt staged → staged diff exists
let fixtureS: string

test.beforeAll(() => {
  // Fixture U: unstaged change
  fixtureU = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-diff-u-'))
  execSync('git init', { cwd: fixtureU, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: fixtureU, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: fixtureU, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureU, 'hello.txt'), 'initial\n')
  execSync('git add hello.txt', { cwd: fixtureU, stdio: 'pipe' })
  execSync('git commit -m "init"', { cwd: fixtureU, stdio: 'pipe' })
  // Worktree change, not staged
  fs.writeFileSync(path.join(fixtureU, 'hello.txt'), 'modified content\n')

  // Fixture S: staged change
  fixtureS = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-diff-s-'))
  execSync('git init', { cwd: fixtureS, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: fixtureS, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: fixtureS, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureS, 'world.txt'), 'initial\n')
  execSync('git add world.txt', { cwd: fixtureS, stdio: 'pipe' })
  execSync('git commit -m "init"', { cwd: fixtureS, stdio: 'pipe' })
  // Stage a change
  fs.writeFileSync(path.join(fixtureS, 'world.txt'), 'staged content\n')
  execSync('git add world.txt', { cwd: fixtureS, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureU, { recursive: true, force: true })
  fs.rmSync(fixtureS, { recursive: true, force: true })
})

test.describe('Diff Viewer', () => {
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

  test('shows empty state when no file is selected', async () => {
    // Register fixture U and navigate to Status
    await win.evaluate(async (repoPath: string) => {
      return (window as Window & typeof globalThis).api.repositories.create({
        name: 'fixture-u',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureU)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()

    await win.getByTestId('status-repo-select').selectOption({ label: 'fixture-u' })

    // Diff empty state should show before selecting any file
    await expect(win.getByTestId('diff-empty')).toBeVisible({ timeout: 10000 })
  })

  test('shows diff for an unstaged change', async () => {
    await win.evaluate(async (repoPath: string) => {
      return (window as Window & typeof globalThis).api.repositories.create({
        name: 'fixture-u',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureU)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()

    await win.getByTestId('status-repo-select').selectOption({ label: 'fixture-u' })

    // hello.txt appears in unstaged list
    await expect(win.getByTestId('unstaged-list')).toContainText('hello.txt', { timeout: 10000 })

    // Click the file row to select it
    await win
      .getByTestId('unstaged-section')
      .locator('[data-testid="unstaged-file-row"]')
      .filter({ hasText: 'hello.txt' })
      .click()

    // diff-panel should appear with actual diff lines
    await expect(win.getByTestId('diff-panel')).toBeVisible({ timeout: 10000 })
    // Unstaged toggle should be active (it's selected by default when clicking from unstaged list)
    await expect(win.getByTestId('diff-toggle-unstaged')).toBeVisible()
    // Diff should contain the removed and added lines
    await expect(win.getByTestId('diff-panel')).toContainText('initial')
    await expect(win.getByTestId('diff-panel')).toContainText('modified content')
  })

  test('shows diff for a staged change', async () => {
    await win.evaluate(async (repoPath: string) => {
      return (window as Window & typeof globalThis).api.repositories.create({
        name: 'fixture-s',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureS)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()

    await win.getByTestId('status-repo-select').selectOption({ label: 'fixture-s' })

    // world.txt appears in staged list
    await expect(win.getByTestId('staged-list')).toContainText('world.txt', { timeout: 10000 })

    // Click the staged file row to select it
    await win
      .getByTestId('staged-section')
      .locator('[data-testid="staged-file-row"]')
      .filter({ hasText: 'world.txt' })
      .click()

    // diff-panel should appear with staged diff
    await expect(win.getByTestId('diff-panel')).toBeVisible({ timeout: 10000 })
    // Staged toggle should be active by default when clicking from staged list
    await expect(win.getByTestId('diff-toggle-staged')).toBeVisible()
    // Diff content should contain the change
    await expect(win.getByTestId('diff-panel')).toContainText('initial')
    await expect(win.getByTestId('diff-panel')).toContainText('staged content')
  })
})
