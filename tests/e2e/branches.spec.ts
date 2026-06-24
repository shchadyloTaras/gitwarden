import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-branches-empty.gitconfig')

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

// Fixture repo: main + feature-a (both have at least one commit)
let fixtureRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-branches-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })

  fs.writeFileSync(path.join(fixtureRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "initial commit"', { cwd: fixtureRepo, stdio: 'pipe' })

  // Create feature-a
  execSync('git checkout -b feature-a', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'a.txt'), 'branch a\n')
  execSync('git add a.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "branch a"', { cwd: fixtureRepo, stdio: 'pipe' })

  // Return to main
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

test.describe('Branches', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    // Reset fixture to main so each test starts from a known state
    execSync('git checkout main', { cwd: fixtureRepo, stdio: 'pipe' })

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
        name: 'branches-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }

  test('switch to another branch updates the global header', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    await expect(win.getByTestId('branches-current-branch')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('branches-current-branch')).toContainText('main')

    // Switch to feature-a
    const switchBtns = win.getByTestId('branches-switch-btn')
    await switchBtns.first().click()

    // Header must now show feature-a
    await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
      timeout: 10000,
    })
    await expect(win.getByTestId('branches-current-branch')).toContainText('feature-a')
  })

  test('create a new branch creates and switches to it', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    await expect(win.getByTestId('branches-current-branch')).toBeVisible({ timeout: 10000 })

    // Create feature-b
    await win.getByTestId('branches-create-input').fill('feature-b')
    await win.getByTestId('branches-create-btn').click()

    // Header shows feature-b
    await expect(win.getByTestId('header-branch-select')).toContainText('feature-b', {
      timeout: 10000,
    })
    await expect(win.getByTestId('branches-current-branch')).toContainText('feature-b')

    // feature-b appears in local list
    await expect(win.getByTestId('branches-local-list')).toContainText('feature-b')
  })

  test('delete a branch removes it from the list', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    // Wait for branches to load
    await expect(win.getByTestId('branches-local-list')).toContainText('feature-a', {
      timeout: 10000,
    })

    // Click Delete on the feature-a row specifically
    const featureARow = win.getByTestId('branches-local-item-feature-a')
    await expect(featureARow).toBeVisible({ timeout: 10000 })
    await featureARow.getByTestId('branches-delete-btn').click()

    // Confirm prompt appears — click "Yes, delete"
    await featureARow.getByTestId('branches-delete-confirm-btn').click()

    // feature-a is gone from the list
    await expect(win.getByTestId('branches-local-list')).not.toContainText('feature-a', {
      timeout: 10000,
    })
    await expect(win.getByTestId('branches-success')).toBeVisible()
  })
})
