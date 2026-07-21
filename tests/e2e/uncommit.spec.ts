import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-uncommit-empty.gitconfig')

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

/** A fresh working repo + a local bare "remote", with `main` pushed and tracking set up. */
function createTrackedRepo(prefix: string): string {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), `gw-${prefix}-`))
  const remotePath = fs.mkdtempSync(path.join(os.tmpdir(), `gw-${prefix}-remote-`))
  execSync('git init -b main', { cwd: repoPath, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: repoPath, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: repoPath, stdio: 'pipe' })
  execSync('git init --bare -b main', { cwd: remotePath, stdio: 'pipe' })
  fs.writeFileSync(path.join(repoPath, 'base.txt'), 'one\n')
  execSync('git add base.txt', { cwd: repoPath, stdio: 'pipe' })
  execSync('git commit -m "base commit"', { cwd: repoPath, stdio: 'pipe' })
  execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'pipe' })
  execSync('git push -u origin main', { cwd: repoPath, stdio: 'pipe' })
  return repoPath
}

function addCommit(repoPath: string, name: string): void {
  fs.writeFileSync(path.join(repoPath, `${name}.txt`), `${name}\n`)
  execSync(`git add ${name}.txt`, { cwd: repoPath, stdio: 'pipe' })
  execSync(`git commit -m "${name}"`, { cwd: repoPath, stdio: 'pipe' })
}

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')
})

test.afterAll(() => {
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Uncommit to Working Changes', () => {
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

  async function registerRepo(repoPath: string, name: string): Promise<void> {
    await win.evaluate(
      async ({ repoPath, name }: { repoPath: string; name: string }) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({ name, localPath: repoPath, isFavorite: false })
      },
      { repoPath, name }
    )
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }

  test('returns the last unpushed commit to Status as an unstaged change', async () => {
    const repoPath = createTrackedRepo('uncommit-last')
    addCommit(repoPath, 'second')
    try {
      await registerRepo(repoPath, 'uncommit-last-fixture')

      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('screen-history')).toBeVisible()
      await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10_000 })
      await expect(win.getByTestId('history-unpushed-marker')).toHaveCount(1)
      await expect(win.getByTestId('history-return-last')).toBeVisible()
      // Phase 105: the panel identifies itself instead of floating an unlabeled refusal.
      await expect(win.getByTestId('history-return-panel')).toContainText('Undo a commit')
      // Only one unpushed commit — "return all" is not offered.
      await expect(win.getByTestId('history-return-all')).toHaveCount(0)

      await win.getByTestId('history-return-last').click()
      await win.getByTestId('history-return-last-confirm').click()

      await expect(win.getByTestId('screen-status')).toBeVisible({ timeout: 10_000 })
      await expect(win.getByTestId('untracked-list')).toContainText('second.txt', {
        timeout: 10_000,
      })

      // Back on History, the returned commit is gone and nothing is unpushed anymore.
      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('history-return-last')).toHaveCount(0)
      await expect(win.getByTestId('history-unpushed-marker')).toHaveCount(0)
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true })
    }
  })

  test('collapses three unpushed commits into one unstaged set via "Return all"', async () => {
    const repoPath = createTrackedRepo('uncommit-all')
    addCommit(repoPath, 'c2')
    addCommit(repoPath, 'c3')
    addCommit(repoPath, 'c4')
    try {
      await registerRepo(repoPath, 'uncommit-all-fixture')

      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('screen-history')).toBeVisible()
      await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10_000 })
      await expect(win.getByTestId('history-unpushed-marker')).toHaveCount(3)
      await expect(win.getByTestId('history-return-all')).toContainText(
        'Return all 3 unpushed commits'
      )

      await win.getByTestId('history-return-all').click()
      await win.getByTestId('history-return-all-confirm').click()

      await expect(win.getByTestId('screen-status')).toBeVisible({ timeout: 10_000 })
      for (const name of ['c2', 'c3', 'c4']) {
        await expect(win.getByTestId('untracked-list')).toContainText(`${name}.txt`, {
          timeout: 10_000,
        })
      }
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true })
    }
  })

  test('offers no return action when the commit is already pushed', async () => {
    const repoPath = createTrackedRepo('uncommit-pushed')
    try {
      await registerRepo(repoPath, 'uncommit-pushed-fixture')

      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('screen-history')).toBeVisible()
      await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10_000 })
      await expect(win.getByTestId('history-return-panel')).toHaveCount(0)
      await expect(win.getByTestId('history-unpushed-marker')).toHaveCount(0)
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true })
    }
  })

  test('refuses to return with the clean-tree message when the working tree is dirty', async () => {
    const repoPath = createTrackedRepo('uncommit-dirty')
    addCommit(repoPath, 'second')
    fs.writeFileSync(path.join(repoPath, 'dirty.txt'), 'uncommitted\n')
    try {
      await registerRepo(repoPath, 'uncommit-dirty-fixture')

      await win.getByTestId('nav-history').click()
      await expect(win.getByTestId('screen-history')).toBeVisible()
      await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10_000 })
      await expect(win.getByTestId('history-return-last')).toHaveCount(0)
      await expect(win.getByTestId('history-return-last-refusal')).toContainText(
        'Commit or discard your current changes first.'
      )

      const headBefore = execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim()
      expect(execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim()).toBe(headBefore)
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true })
    }
  })
})
