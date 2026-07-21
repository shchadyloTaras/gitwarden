import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// Wrong-target refusal (Phase 91, W1/W8 — acceptance criterion #4, "as far as e2e
// can drive it"): a compound write verifies HEAD is still the branch it observed
// before mutating. `doMerge` reads `currentBranchName` from the renderer's cached
// branch list at CLICK time, not a fresh query — so an external `git switch`
// between that load and the confirm click reliably produces the exact mismatch
// the in-queue check exists to catch, with no timing race needed: nothing in the
// app refreshes on its own between "branches loaded" and "confirm clicked" unless
// the .git watcher's ~400ms debounce elapses first, which a normal Playwright
// click sequence comfortably beats.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-wrong-target-empty.gitconfig')

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

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-wrong-target-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })

  fs.writeFileSync(path.join(fixtureRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m init', { cwd: fixtureRepo, stdio: 'pipe' })

  execSync('git checkout -b feature-a', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'a.txt'), 'feature work\n')
  execSync('git add a.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "feature commit"', { cwd: fixtureRepo, stdio: 'pipe' })

  execSync('git checkout -b side-branch main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git checkout main', { cwd: fixtureRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Wrong-target refusal', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    execSync('git checkout -f main', { cwd: fixtureRepo, stdio: 'pipe' })

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

  test('a merge refuses with a clear message when HEAD moved since the branch list was loaded — never merges onto the wrong branch', async () => {
    await win.evaluate(async (repoPath: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'wrong-target-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()
    // The branch list (and the "Merge into main" label's captured currentBranch)
    // is now loaded and showing main — this is the stale snapshot the click below
    // will act on.
    await expect(win.getByTestId('branches-current-branch')).toContainText('main', {
      timeout: 10000,
    })
    const featureARow = win.getByTestId('branches-local-item-feature-a')
    await expect(featureARow).toBeVisible({ timeout: 10000 })

    // HEAD moves OUTSIDE the app — the renderer has no way to know yet.
    execSync('git checkout side-branch', { cwd: fixtureRepo, stdio: 'pipe' })

    await featureARow.getByTestId('branches-merge-btn').click()
    await featureARow.getByTestId('branches-merge-confirm-btn').click()

    const err = win.getByTestId('branches-error')
    await expect(err).toBeVisible({ timeout: 10000 })
    await expect(err).toContainText(/changed since you opened this/i)

    // The real HEAD (side-branch, untouched by main's history) proves no merge
    // landed anywhere — the refusal was real, not cosmetic.
    const headAfter = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: fixtureRepo,
      encoding: 'utf8',
    }).trim()
    expect(headAfter).toBe('side-branch')
    const sideBranchLog = execSync('git log --oneline side-branch', {
      cwd: fixtureRepo,
      encoding: 'utf8',
    })
    expect(sideBranchLog).not.toContain('feature commit')
  })
})
