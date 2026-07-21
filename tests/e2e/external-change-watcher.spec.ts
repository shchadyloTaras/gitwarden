import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// External changes appear (acceptance criterion #2): `git switch`/`git commit` in a
// terminal shows up in the app within ~1s via the Phase 96 `.git` watcher — no
// window refocus, no tab switch, nothing synthetic. This is the watcher-specific
// counterpart to `focus-refresh.spec.ts` (which drives the SAME healing via a
// synthetic focus event, deliberately not the watcher) — together they prove
// external changes appear through EITHER layer on its own.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-external-watcher-empty.gitconfig')

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

let fixtureRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-external-watcher-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m init', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git branch feature-a', { cwd: fixtureRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('External-change detection via the .git watcher', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    execSync('git checkout -f main', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git clean -fd', { cwd: fixtureRepo, stdio: 'pipe' })

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
        name: 'external-watcher-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }

  test('an external `git switch` updates the header branch picker within ~1s, with no refocus or tab switch', async () => {
    await registerFixtureRepo()
    await expect(win.getByTestId('header-branch-select')).toContainText('main', {
      timeout: 10000,
    })

    execSync('git switch feature-a', { cwd: fixtureRepo, stdio: 'pipe' })

    // No focus/visibility event, no navigation — only the watcher can explain this.
    await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
      timeout: 2000,
    })
  })

  test('an external `git commit` updates the on-screen History list within ~1s', async () => {
    await registerFixtureRepo()
    await win.getByTestId('nav-history').click()
    await expect(win.getByTestId('screen-history')).toBeVisible()
    await expect(win.getByTestId('history-commit-list')).toContainText('init', { timeout: 10000 })
    await expect(win.getByTestId('history-commit-list')).not.toContainText('external commit')

    fs.writeFileSync(path.join(fixtureRepo, 'external.txt'), 'from outside\n')
    execSync('git add external.txt', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git commit -m "external commit"', { cwd: fixtureRepo, stdio: 'pipe' })

    await expect(win.getByTestId('history-commit-list')).toContainText('external commit', {
      timeout: 2000,
    })
  })

  test('an external stage (`git add`) updates the on-screen Status list within ~1s', async () => {
    await registerFixtureRepo()
    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()
    await expect(win.getByTestId('staged-list')).not.toContainText('staged-outside.txt')

    fs.writeFileSync(path.join(fixtureRepo, 'staged-outside.txt'), 'staged from outside\n')
    execSync('git add staged-outside.txt', { cwd: fixtureRepo, stdio: 'pipe' })

    await expect(win.getByTestId('staged-list')).toContainText('staged-outside.txt', {
      timeout: 2000,
    })
  })
})
