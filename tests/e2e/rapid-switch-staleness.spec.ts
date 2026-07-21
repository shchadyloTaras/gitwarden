import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// Rapid switching is truthful (acceptance criterion #1): switching main → feature →
// dev as fast as the picker allows always settles with every tab showing dev's
// data. "As fast as the picker allows" is exactly what this drives — the picker
// disables itself mid-switch (Phase 93, fix B) and each store is stale-request
// guarded (Phase 89), so clicking through main → feature → dev with only the
// picker's own re-enable as the pacing (no manual settle-and-wait per screen) must
// still converge cleanly, never landing an earlier switch's async response over a
// later one's.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-rapid-switch-empty.gitconfig')

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

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rapid-switch-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })

  fs.writeFileSync(path.join(fixtureRepo, 'main.txt'), 'main\n')
  execSync('git add main.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "main commit"', { cwd: fixtureRepo, stdio: 'pipe' })

  execSync('git checkout -b feature', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'feature.txt'), 'feature\n')
  execSync('git add feature.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "feature commit"', { cwd: fixtureRepo, stdio: 'pipe' })

  execSync('git checkout -b dev', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'dev.txt'), 'dev\n')
  execSync('git add dev.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "dev commit"', { cwd: fixtureRepo, stdio: 'pipe' })

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

test.describe('Rapid-switch staleness', () => {
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

  async function switchViaHeader(branch: string): Promise<void> {
    await win.getByTestId('header-branch-select').click()
    await win.getByTestId(`header-branch-select-option-${branch}`).click()
    // The picker's own re-enable IS the pacing signal (fix B): once it shows the
    // target branch again it is safe to click, no separate settle-and-wait per tab.
    await expect(win.getByTestId('header-branch-select')).toContainText(branch, {
      timeout: 10000,
    })
    await expect(win.getByTestId('header-branch-select')).toBeEnabled()
  }

  test('main → feature → dev settles with every tab showing dev — header, Branches, Remote, History, Safety Center', async () => {
    await win.evaluate(async (repoPath: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'rapid-switch-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await expect(win.getByTestId('header-branch-select')).toContainText('main', {
      timeout: 10000,
    })

    await switchViaHeader('feature')
    await switchViaHeader('dev')

    // Header (always mounted) — the fastest-settling surface, already asserted by
    // switchViaHeader above; re-asserted here for clarity of what this test proves.
    await expect(win.getByTestId('header-branch-select')).toContainText('dev')

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()
    await expect(win.getByTestId('branches-current-branch')).toContainText('dev', {
      timeout: 10000,
    })
    // The refreshed UI (v0.6.0) marks the current branch with a row badge, not "* name".
    const devRow = win.getByTestId('branches-local-item-dev')
    await expect(devRow.getByTestId('branches-current-badge')).toHaveText('Current branch')

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toContainText('dev', {
      timeout: 10000,
    })

    await win.getByTestId('nav-history').click()
    await expect(win.getByTestId('screen-history')).toBeVisible()
    await expect(win.getByTestId('history-commit-list')).toContainText('dev commit', {
      timeout: 10000,
    })
    // main's and feature's commits are still in dev's ancestry (a straight chain),
    // so their presence is expected — what matters is dev's OWN commit is there too,
    // proving History is reading dev's actual log, not a stale cached one.

    await win.getByTestId('nav-safety-center').click()
    await expect(win.getByTestId('screen-safety-center')).toBeVisible()
    await expect(win.getByTestId('safety-current-branch')).toContainText('dev', {
      timeout: 10000,
    })

    // Status/Commit/Inspector have no branch-NAME display to assert against
    // directly, but must still render cleanly on dev without error.
    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('screen-status')).toBeVisible()
    await expect(win.getByTestId('status-error')).toHaveCount(0)

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
  })
})
