import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// Focus revalidation (Phase 95, W4-cheap): coming back to the app re-reads reality
// instead of leaving whatever screen the user is on stale until they switch repos or
// tabs. This smoke test proves the window-focus listener actually wires through to
// a visible screen, without needing a real OS-level window-manager focus change —
// the app-level listener is driven directly via a synthetic 'focus' DOM event, the
// same way Phase 93's non-reentrant-picker test drives DOM state directly.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-focus-refresh-empty.gitconfig')
const TRACKED_FILE = 'tracked.txt'

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

async function triggerWindowFocus(win: Page): Promise<void> {
  await win.evaluate(() => window.dispatchEvent(new Event('focus')))
}

let fixtureRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-focus-refresh-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })

  fs.writeFileSync(path.join(fixtureRepo, TRACKED_FILE), 'original content\n')
  execSync(`git add ${TRACKED_FILE}`, { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m init', { cwd: fixtureRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Focus revalidation', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    // Reset the fixture to a clean tracked file before every test.
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
        name: 'focus-refresh-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }

  test('an external edit appears in Status after the window regains focus — no tab switch, no repo switch', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()
    await expect(win.getByTestId('unstaged-list')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('unstaged-list')).not.toContainText(TRACKED_FILE)

    // Edit the tracked file OUTSIDE the app entirely — GitWarden has no way to know
    // about this except by re-reading the working tree, which only a refresh does.
    fs.writeFileSync(path.join(fixtureRepo, TRACKED_FILE), 'changed by an external process\n')

    await triggerWindowFocus(win)

    await expect(win.getByTestId('unstaged-list')).toContainText(TRACKED_FILE, { timeout: 10000 })
  })

  test('the always-mounted header branch list also heals on focus, without navigating anywhere', async () => {
    await registerFixtureRepo()

    await expect(win.getByTestId('header-branch-select')).toContainText('main', {
      timeout: 10000,
    })

    // Create a branch OUTSIDE the app — the header picker has no route to see this
    // except a refresh (it never remounts on its own).
    execSync('git branch external-branch', { cwd: fixtureRepo, stdio: 'pipe' })

    await triggerWindowFocus(win)

    await win.getByTestId('header-branch-select').click()
    await expect(win.getByTestId('header-branch-select-option-external-branch')).toBeVisible({
      timeout: 10000,
    })
  })
})
