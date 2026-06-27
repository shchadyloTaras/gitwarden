/**
 * E2E tests for Phase 59 — Push Policy UI.
 *
 * Tests run against local fixture repos with a local bare "remote" (offline — no
 * network calls, no GitHub account required). All push target checks use locally-
 * parseable SSH or HTTPS URLs set on the working repo's remote.
 */

import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-push-policy-empty.gitconfig')

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

// ── Fixture repos ─────────────────────────────────────────────────────────────

/** Bare "remote" + working repo on main. */
let mainBareRepo: string
let mainWorkingRepo: string

/** Bare "remote" + working repo on feature/taras/fix (allowed branch). */
let featureBareRepo: string
let featureWorkingRepo: string

/** Working repo whose remote URL uses a fake SSH address (for owner/repo checks). */
let wrongOwnerWorkingRepo: string
let wrongOwnerBareRepo: string

function initRepo(
  cwd: string,
  opts: { branch: string; remoteName: string; remoteUrl: string }
): void {
  execSync(`git init -b ${opts.branch}`, { cwd, stdio: 'pipe' })
  execSync('git config user.email "taras@example.com"', { cwd, stdio: 'pipe' })
  execSync('git config user.name "Taras Dev"', { cwd, stdio: 'pipe' })
  fs.writeFileSync(path.join(cwd, 'init.txt'), 'init\n')
  execSync('git add init.txt', { cwd, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd, stdio: 'pipe' })
  execSync(`git remote add ${opts.remoteName} "${opts.remoteUrl}"`, { cwd, stdio: 'pipe' })
}

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  // main-branch fixture
  mainBareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pp-main-bare-'))
  execSync('git init --bare', { cwd: mainBareRepo, stdio: 'pipe' })
  mainWorkingRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pp-main-work-'))
  initRepo(mainWorkingRepo, { branch: 'main', remoteName: 'origin', remoteUrl: mainBareRepo })
  execSync('git push origin main', { cwd: mainWorkingRepo, stdio: 'pipe' })

  // feature-branch fixture
  featureBareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pp-feat-bare-'))
  execSync('git init --bare', { cwd: featureBareRepo, stdio: 'pipe' })
  featureWorkingRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pp-feat-work-'))
  initRepo(featureWorkingRepo, {
    branch: 'feature/taras/fix',
    remoteName: 'origin',
    remoteUrl: featureBareRepo,
  })

  // wrong-owner fixture: remote URL is a parseable SSH URL pointing to a wrong org
  wrongOwnerBareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pp-wrong-bare-'))
  execSync('git init --bare', { cwd: wrongOwnerBareRepo, stdio: 'pipe' })
  wrongOwnerWorkingRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pp-wrong-work-'))
  initRepo(wrongOwnerWorkingRepo, {
    branch: 'feature/taras/fix',
    remoteName: 'origin',
    // deliberately wrong org — client policy expects 'right-org'
    remoteUrl: 'git@github.com:wrong-org/project.git',
  })
})

test.afterAll(() => {
  for (const d of [
    mainWorkingRepo,
    mainBareRepo,
    featureWorkingRepo,
    featureBareRepo,
    wrongOwnerWorkingRepo,
    wrongOwnerBareRepo,
  ]) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function setupProfileAndRepo(
  win: Page,
  opts: {
    repoPath: string
    pushPolicy: {
      mode: 'unrestricted' | 'branchScoped'
      allowedBranchPatterns: string[]
      blockedBranchPatterns: string[]
      expectedRemoteOwner?: string
      expectedRemoteRepo?: string
    }
  }
): Promise<void> {
  const profileId = await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const res = await api.profiles.create({
      displayName: 'Taras',
      gitAuthorName: 'Taras Dev',
      gitAuthorEmail: 'taras@example.com',
      githubUsername: 'taras',
      authenticationMethod: 'ssh',
      expectedRemoteHosts: [],
    })
    return res.ok ? res.data.id : null
  })
  expect(profileId).toBeTruthy()

  await win.evaluate(async (id: string) => {
    const api = (window as Window & typeof globalThis).api
    await api.settings.update({ activeProfileId: id })
  }, profileId as string)

  await win.evaluate(
    async ([repoPath, pId, policy]: [string, string, typeof opts.pushPolicy]) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'test-repo',
        localPath: repoPath,
        assignedProfileId: pId,
        isFavorite: false,
        pushPolicy: policy,
      })
    },
    [opts.repoPath, profileId as string, opts.pushPolicy] as [
      string,
      string,
      typeof opts.pushPolicy,
    ]
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Push Policy — Branch Access', () => {
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

  test('allowed branch shows Safe verdict and Confirm Push is enabled', async () => {
    await setupProfileAndRepo(win, {
      repoPath: featureWorkingRepo,
      pushPolicy: {
        mode: 'branchScoped',
        allowedBranchPatterns: ['feature/taras/*'],
        blockedBranchPatterns: ['main'],
      },
    })

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('remote-current-branch')).toContainText('feature/taras/fix')

    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    // Branch Access block should show "allowed"
    await expect(win.getByTestId('remote-push-branch-access')).toBeVisible()
    await expect(win.getByTestId('remote-push-branch-verdict')).toContainText('Allowed')

    // Confirm Push must be enabled (no blockers)
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled()
  })

  test('blocked branch (main) shows Blocked verdict and Confirm Push is disabled', async () => {
    await setupProfileAndRepo(win, {
      repoPath: mainWorkingRepo,
      pushPolicy: {
        mode: 'branchScoped',
        allowedBranchPatterns: ['feature/taras/*'],
        blockedBranchPatterns: ['main'],
      },
    })

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('remote-current-branch')).toContainText('main')

    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    // Branch Access block shows blocked verdict
    await expect(win.getByTestId('remote-push-branch-access')).toBeVisible()
    await expect(win.getByTestId('remote-push-branch-verdict')).toContainText('Blocked')

    // PROTECTED_BRANCH_PUSH safety issue should fire
    await expect(win.getByTestId('remote-push-issue-PROTECTED_BRANCH_PUSH')).toBeVisible()

    // Confirm Push must be disabled
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()
  })

  test('wrong remote owner is judged Blocked with REMOTE_OWNER_MISMATCH', async () => {
    await setupProfileAndRepo(win, {
      repoPath: wrongOwnerWorkingRepo,
      pushPolicy: {
        mode: 'unrestricted',
        allowedBranchPatterns: [],
        blockedBranchPatterns: [],
        expectedRemoteOwner: 'right-org',
        expectedRemoteRepo: 'project',
      },
    })

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    // REMOTE_OWNER_MISMATCH issue must appear
    await expect(win.getByTestId('remote-push-issue-REMOTE_OWNER_MISMATCH')).toBeVisible()

    // Confirm Push must be disabled
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()
  })
})
