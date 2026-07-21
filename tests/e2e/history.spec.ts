import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-history-empty.gitconfig')

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

    // history-fixture is auto-selected as active repo

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

      // history-big is auto-selected as active repo
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

  test('History scrolls internally with a reachable sticky header/footer at a constrained height', async () => {
    // 55 commits so PAGE_SIZE=50 also exercises pagination inside the constrained pane.
    const scrollRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-history-scroll-'))
    execSync('git init -b main', { cwd: scrollRepo, stdio: 'pipe' })
    execSync('git config user.email "alice@example.com"', { cwd: scrollRepo, stdio: 'pipe' })
    execSync('git config user.name "Alice Dev"', { cwd: scrollRepo, stdio: 'pipe' })
    for (let i = 1; i <= 55; i++) {
      fs.writeFileSync(path.join(scrollRepo, `s${i}.txt`), `${i}\n`)
      execSync(`git add s${i}.txt`, { cwd: scrollRepo, stdio: 'pipe' })
      execSync(`git commit -m "scroll commit ${i}"`, { cwd: scrollRepo, stdio: 'pipe' })
    }

    try {
      await win.evaluate(async (repoPath: string) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'history-scroll',
          localPath: repoPath,
          isFavorite: false,
        })
      }, scrollRepo)

      await win.setViewportSize({ width: 1000, height: 480 })
      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('screen-history')).toBeVisible()
      await expect(win.getByTestId('history-commit-row')).toHaveCount(50, { timeout: 10_000 })

      // The commit list itself has real scroll overflow — not the outer app shell.
      const body = win.getByTestId('history-body')
      await expect(body).toBeVisible()
      const hasRealOverflow = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
      expect(hasRealOverflow).toBe(true)

      // Scroll the internal pane to the bottom — the sticky footer stays reachable and
      // the sticky header stays visible, without resizing the window.
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect(win.getByTestId('history-load-more')).toBeVisible()
      await expect(
        win.getByTestId('screen-history').locator('.gw-history-grid--header')
      ).toBeVisible()

      await win.getByTestId('history-load-more').click()
      await expect(win.getByTestId('history-commit-row')).toHaveCount(55, { timeout: 10_000 })

      const rows = await win
        .getByTestId('history-commit-list')
        .locator('[data-testid="history-commit-row"]')
        .allTextContents()
      expect(rows.length).toBe(new Set(rows).size)
      await expect(win.getByTestId('history-load-more')).not.toBeVisible()
    } finally {
      fs.rmSync(scrollRepo, { recursive: true, force: true })
    }
  })

  test('switching branch via the header dropdown refreshes the commit list without navigating away', async () => {
    const branchRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-history-branch-'))
    execSync('git init -b main', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git config user.email "alice@example.com"', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git config user.name "Alice Dev"', { cwd: branchRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(branchRepo, 'base.txt'), 'base\n')
    execSync('git add base.txt', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git commit -m "base commit"', { cwd: branchRepo, stdio: 'pipe' })

    execSync('git checkout -b feature-a', { cwd: branchRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(branchRepo, 'a.txt'), 'a\n')
    execSync('git add a.txt', { cwd: branchRepo, stdio: 'pipe' })
    execSync('git commit -m "feature-a commit"', { cwd: branchRepo, stdio: 'pipe' })

    execSync('git checkout main', { cwd: branchRepo, stdio: 'pipe' })

    try {
      await win.evaluate(async (repoPath: string) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'history-branch-fixture',
          localPath: repoPath,
          isFavorite: false,
        })
      }, branchRepo)

      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('screen-history')).toBeVisible()
      await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10_000 })
      await expect(win.getByTestId('history-commit-row')).toHaveCount(1, { timeout: 10_000 })
      await expect(win.getByTestId('history-commit-list')).toContainText('base commit')

      // Switch branch via the HEADER dropdown — not the Branches screen — while staying
      // on the History screen the whole time (no navigation, no reload).
      await win.getByTestId('header-branch-select').click()
      await win.getByTestId('header-branch-select-option-feature-a').click()
      await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
        timeout: 10000,
      })

      // History must reflect feature-a's 2 commits, not main's stale 1.
      await expect(win.getByTestId('history-commit-row')).toHaveCount(2, { timeout: 10_000 })
      await expect(win.getByTestId('history-commit-list')).toContainText('feature-a commit')
    } finally {
      fs.rmSync(branchRepo, { recursive: true, force: true })
    }
  })
})
