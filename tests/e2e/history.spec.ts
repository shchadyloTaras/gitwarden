import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-history-empty.gitconfig')

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

// Fixture repo with 6 commits so we can verify load-more paging
let fixtureRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-history-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })

  // Create 6 commits
  for (let i = 1; i <= 6; i++) {
    fs.writeFileSync(path.join(fixtureRepo, `file${i}.txt`), `content ${i}\n`)
    execSync(`git add file${i}.txt`, { cwd: fixtureRepo, stdio: 'pipe' })
    execSync(`git commit -m "commit number ${i}"`, { cwd: fixtureRepo, stdio: 'pipe' })
  }
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('History', () => {
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

  async function registerFixtureRepo(): Promise<void> {
    await win.evaluate(async (repoPath: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'history-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }

  test('history screen renders commits for a fixture repo', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-history').click()
    await expect(win.getByTestId('screen-history')).toBeVisible()

    // Select the repo
    await win.getByTestId('history-repo-select').selectOption({ label: 'history-fixture' })

    // All 6 commits should appear
    await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10_000 })
    const rows = win.getByTestId('history-commit-row')
    await expect(rows).toHaveCount(6, { timeout: 10_000 })

    // The most recent commit message should be visible
    await expect(win.getByTestId('history-commit-list')).toContainText('commit number 6')

    // Author column shows the committer name
    await expect(win.getByTestId('history-commit-list')).toContainText('Alice Dev')
  })

  test('"load more" pages additional commits without duplicates', async () => {
    // Build a repo with 55 commits so PAGE_SIZE=50 triggers hasMore
    const bigRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-history-big-'))
    execSync('git init -b main', { cwd: bigRepo, stdio: 'pipe' })
    execSync('git config user.email "alice@example.com"', { cwd: bigRepo, stdio: 'pipe' })
    execSync('git config user.name "Alice Dev"', { cwd: bigRepo, stdio: 'pipe' })

    for (let i = 1; i <= 55; i++) {
      fs.writeFileSync(path.join(bigRepo, `f${i}.txt`), `${i}\n`)
      execSync(`git add f${i}.txt`, { cwd: bigRepo, stdio: 'pipe' })
      execSync(`git commit -m "big commit ${i}"`, { cwd: bigRepo, stdio: 'pipe' })
    }

    try {
      // Register the big repo
      await win.evaluate(async (repoPath: string) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'history-big',
          localPath: repoPath,
          isFavorite: false,
        })
      }, bigRepo)

      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('screen-history')).toBeVisible()

      await win.getByTestId('history-repo-select').selectOption({ label: 'history-big' })
      await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10_000 })

      // First page: exactly 50 rows
      await expect(win.getByTestId('history-commit-row')).toHaveCount(50, { timeout: 10_000 })

      // "Load more" button is visible
      await expect(win.getByTestId('history-load-more')).toBeVisible()

      // Collect hashes before load more
      const hashesBeforeText = await win
        .getByTestId('history-commit-list')
        .locator('[data-testid="history-commit-row"]')
        .allTextContents()

      await win.getByTestId('history-load-more').click()

      // After loading more: 55 rows total
      await expect(win.getByTestId('history-commit-row')).toHaveCount(55, { timeout: 10_000 })

      // No duplicates: all short hashes in the list are unique
      const allRows = await win
        .getByTestId('history-commit-list')
        .locator('[data-testid="history-commit-row"]')
        .allTextContents()
      expect(allRows.length).toBe(55)
      expect(allRows.length).toBe(new Set(allRows).size)

      // Load more button is gone (no more pages)
      await expect(win.getByTestId('history-load-more')).not.toBeVisible()

      // hashesBeforeText used to silence the unused-variable lint
      expect(hashesBeforeText.length).toBe(50)
    } finally {
      fs.rmSync(bigRepo, { recursive: true, force: true })
    }
  })
})
