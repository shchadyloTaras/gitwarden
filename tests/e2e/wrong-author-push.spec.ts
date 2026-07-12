import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { profileFixture, type ProfileInput } from '../fixtures/profiles'

// Phase 100 (QA Fixes): the exact QA repro — a commit authored `eleken-git
// <marketing@eleken.co>` reached GitHub with nothing but a soft warning (evidence
// commit 97a09a9). This spec proves the outgoing-authorship gate catches that ALREADY-
// MADE commit even after the repo's local identity config is fixed back, and that
// Uncommit + re-commit is the paved path to clear it (never an automatic history rewrite).

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-wrong-author-empty.gitconfig')

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

let bareRepo: string
let workingRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  bareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-wrong-author-bare-'))
  execSync('git init --bare -b main', { cwd: bareRepo, stdio: 'pipe' })

  workingRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-wrong-author-work-'))
  execSync('git init -b main', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: workingRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(workingRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: workingRepo, stdio: 'pipe' })
  execSync(`git remote add origin "${bareRepo}"`, { cwd: workingRepo, stdio: 'pipe' })
  execSync('git push -u origin main', { cwd: workingRepo, stdio: 'pipe' })

  // The QA-repro scenario: an unpushed commit made under the WRONG identity.
  execSync('git config user.email "marketing@eleken.co"', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.name "eleken-git"', { cwd: workingRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(workingRepo, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git commit -m "add feature"', { cwd: workingRepo, stdio: 'pipe' })

  // The config is fixed back to the correct identity AFTER the bad commit already
  // exists — proving the gate catches the commit itself, not just the current config.
  execSync('git config user.email "alice@example.com"', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: workingRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(workingRepo, { recursive: true, force: true })
  fs.rmSync(bareRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Outgoing-authorship push gate', () => {
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

  test('a wrong-author commit already outgoing blocks Push even after identity is fixed — uncommit + re-commit clears it', async () => {
    const aliceInput = profileFixture('alice')
    const aliceId = await win.evaluate(async (input: ProfileInput) => {
      const api = (window as Window & typeof globalThis).api
      const res = await api.profiles.create({ ...input })
      return res.ok ? res.data.id : null
    }, aliceInput)
    expect(aliceId).toBeTruthy()

    await win.evaluate(async (id: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.settings.update({ activeProfileId: id })
    }, aliceId as string)

    await win.evaluate(
      async ([repoPath, profileId]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'wrong-author-fixture',
          localPath: repoPath,
          assignedProfileId: profileId,
          isFavorite: false,
        })
      },
      [workingRepo, aliceId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // Open the push sheet — the wrong-author commit is still in the outgoing range.
    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    await expect(win.getByTestId('remote-push-issue-OUTGOING_WRONG_AUTHOR')).toBeVisible({
      timeout: 10000,
    })
    await expect(win.getByTestId('remote-push-issue-OUTGOING_WRONG_AUTHOR')).toContainText(
      'eleken-git'
    )
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()

    // Return the wrong-author commit to working changes (Uncommit), then re-commit it
    // with the correct identity — the explain-only remediation path, never an automatic
    // history rewrite.
    await win.getByTestId('remote-push-cancel-btn').click()
    await win.getByTestId('nav-history').click()
    await expect(win.getByTestId('screen-history')).toBeVisible()
    await expect(win.getByTestId('history-commit-list')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('history-return-last').click()
    await win.getByTestId('history-return-last-confirm').click()

    await expect(win.getByTestId('screen-status')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('untracked-list')).toContainText('feature.txt', {
      timeout: 10000,
    })
    await win.getByTestId('status-stage-untracked-all').click()

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
    await expect(win.getByTestId('commit-staged-summary')).toContainText('feature.txt', {
      timeout: 10000,
    })
    await win.getByTestId('commit-message').fill('add feature (re-committed)')
    await expect(win.getByTestId('commit-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('commit-btn').click()

    // Push again — the outgoing range is now correctly authored, and it succeeds.
    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    await expect(win.getByTestId('remote-push-issue-OUTGOING_WRONG_AUTHOR')).toHaveCount(0, {
      timeout: 10000,
    })
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('remote-push-confirm-btn').click()

    await expect(win.getByTestId('remote-push-sheet')).not.toBeVisible({ timeout: 15000 })
    await expect(win.getByTestId('remote-success')).toBeVisible({ timeout: 15000 })

    const latestSubject = execSync('git log main --format=%s -n 1', { cwd: bareRepo })
      .toString()
      .trim()
    expect(latestSubject).toBe('add feature (re-committed)')
    const latestAuthor = execSync('git log main --format="%an %ae" -n 1', { cwd: bareRepo })
      .toString()
      .trim()
    expect(latestAuthor).toBe('Alice Dev alice@example.com')
  })
})
