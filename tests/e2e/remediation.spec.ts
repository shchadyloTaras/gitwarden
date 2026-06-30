import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// Guard Quick-Fix Phase 67 — one-click fix UI + failed-push recovery banner.
// Offline: local bare repos as "remotes"; rejecting remotes use a pre-receive hook whose
// stderr matches the ErrorMapper regexes (error: 403 → wrong-account, error: 401 → auth).

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-remediation-empty.gitconfig')

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
    if (reposRes.ok) for (const r of reposRes.data) await api.repositories.delete(r.id)
    const profilesRes = await api.profiles.list()
    if (profilesRes.ok) for (const p of profilesRes.data) await api.profiles.delete(p.id)
    await api.settings.update({ activeProfileId: undefined })
  })
}

function gitInWork(cwd: string, email: string, name: string): void {
  execSync('git init -b main', { cwd, stdio: 'pipe' })
  execSync(`git config user.email "${email}"`, { cwd, stdio: 'pipe' })
  execSync(`git config user.name "${name}"`, { cwd, stdio: 'pipe' })
  fs.writeFileSync(path.join(cwd, 'a.txt'), 'hello\n')
  execSync('git add a.txt', { cwd, stdio: 'pipe' })
  execSync('git commit -m init', { cwd, stdio: 'pipe' })
}

/** A bare repo whose pre-receive hook always rejects with the given stderr line. */
function makeRejectingBare(label: string, stderrLine: string): string {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), `gw-rem-${label}-bare-`))
  execSync('git init --bare', { cwd: bare, stdio: 'pipe' })
  const hook = path.join(bare, 'hooks', 'pre-receive')
  fs.writeFileSync(hook, `#!/bin/sh\necho "${stderrLine}" >&2\nexit 1\n`)
  fs.chmodSync(hook, 0o755)
  return bare
}

// Fixtures
let switchBare: string // normal bare (accepts the push after the profile switch)
let switchWork: string // committed with WORK identity, assigned to Work, active = Personal
let rejectWrongBare: string
let rejectWrongWork: string
let rejectTokenBare: string
let rejectTokenWork: string
let unassignedWork: string
const dirs: string[] = []

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  // Scenario 1 — switch profile then push succeeds.
  switchBare = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rem-switch-bare-'))
  execSync('git init --bare', { cwd: switchBare, stdio: 'pipe' })
  switchWork = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rem-switch-work-'))
  gitInWork(switchWork, 'jane@work.com', 'Jane Work')
  execSync(`git remote add origin "${switchBare}"`, { cwd: switchWork, stdio: 'pipe' })

  // Scenario 2 — push rejected as wrong account (403).
  rejectWrongBare = makeRejectingBare('wrong', 'error: 403 Forbidden')
  rejectWrongWork = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rem-wrong-work-'))
  gitInWork(rejectWrongWork, 'alice@example.com', 'Alice Dev')
  execSync(`git remote add origin "${rejectWrongBare}"`, { cwd: rejectWrongWork, stdio: 'pipe' })

  // Scenario 3 — push rejected as bad credentials (401).
  rejectTokenBare = makeRejectingBare('token', 'error: 401 Unauthorized')
  rejectTokenWork = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rem-token-work-'))
  gitInWork(rejectTokenWork, 'alice@example.com', 'Alice Dev')
  execSync(`git remote add origin "${rejectTokenBare}"`, { cwd: rejectTokenWork, stdio: 'pipe' })

  // Scenario 4 — unassigned repo (navigate-only fix).
  unassignedWork = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rem-unassigned-work-'))
  gitInWork(unassignedWork, 'alice@example.com', 'Alice Dev')

  dirs.push(
    switchBare,
    switchWork,
    rejectWrongBare,
    rejectWrongWork,
    rejectTokenBare,
    rejectTokenWork,
    unassignedWork
  )
})

test.afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    /* ignore */
  }
})

/** Create a profile, return its id. */
async function createProfile(
  win: Page,
  p: { displayName: string; email: string; name: string; user: string }
): Promise<string> {
  const id = await win.evaluate(async (input) => {
    const api = (window as Window & typeof globalThis).api
    const res = await api.profiles.create({
      displayName: input.displayName,
      gitAuthorName: input.name,
      gitAuthorEmail: input.email,
      githubUsername: input.user,
      authenticationMethod: 'ssh',
      expectedRemoteHosts: [],
    })
    return res.ok ? res.data.id : null
  }, p)
  expect(id).toBeTruthy()
  return id as string
}

async function setActive(win: Page, id: string): Promise<void> {
  await win.evaluate(async (pid: string) => {
    await (window as Window & typeof globalThis).api.settings.update({ activeProfileId: pid })
  }, id)
}

async function createRepo(win: Page, repoPath: string, assignedProfileId?: string): Promise<void> {
  await win.evaluate(
    async (args: { repoPath: string; assignedProfileId?: string }) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'fixture',
        localPath: args.repoPath,
        assignedProfileId: args.assignedProfileId,
        isFavorite: false,
      })
    },
    { repoPath, assignedProfileId }
  )
}

test.describe('Guard Quick-Fix — one-click fixes & recovery banner', () => {
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

  test('active ≠ assigned: push-sheet fix switches profile, then push succeeds', async () => {
    const work = await createProfile(win, {
      displayName: 'Work',
      email: 'jane@work.com',
      name: 'Jane Work',
      user: 'janework',
    })
    await createProfile(win, {
      displayName: 'Personal',
      email: 'jane@personal.dev',
      name: 'Jane Personal',
      user: 'janepersonal',
    })
    // Start with active = assigned (Work) so the load-time auto-switch is a no-op.
    await setActive(win, work)
    await createRepo(win, switchWork, work)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // Deliberately move OFF the assigned profile via the Profiles UI (the user-override
    // path) so PROFILE_MISMATCH persists — selecting the repo would otherwise re-sync it.
    await win.getByTestId('nav-profiles').click()
    await expect(win.getByTestId('screen-profiles')).toBeVisible()
    await win
      .getByTestId('profile-item')
      .filter({ hasText: 'Personal' })
      .getByTestId('profile-row-set-active-btn')
      .click()
    await expect(
      win
        .getByTestId('profile-item')
        .filter({ hasText: 'Personal' })
        .getByTestId('profile-active-badge')
    ).toBeVisible({ timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })

    // Profile mismatch blocks the push; the one-click fix offers to switch to Work.
    await expect(win.getByTestId('remote-push-issue-PROFILE_MISMATCH')).toBeVisible()
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()
    const switchBtn = win.getByTestId('remediation-executable-switch-active-profile')
    await expect(switchBtn).toContainText('Work')
    await switchBtn.click()

    // After switching, the mismatch clears (deterministic signal) → push is allowed → success.
    await expect(win.getByTestId('remote-push-issue-PROFILE_MISMATCH')).toHaveCount(0, {
      timeout: 10000,
    })
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('remote-push-confirm-btn').click()
    await expect(win.getByTestId('remote-success')).toBeVisible({ timeout: 10000 })
  })

  test('rejected push (403 wrong account): recovery banner diagnoses + offers switch-and-push', async () => {
    const alice = await createProfile(win, {
      displayName: 'Alice',
      email: 'alice@example.com',
      name: 'Alice Dev',
      user: 'alice',
    })
    await setActive(win, alice)
    await createRepo(win, rejectWrongWork, alice)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('remote-push-confirm-btn').click()

    // Diagnosed recovery banner — NOT the opaque generic error.
    const banner = win.getByTestId('remote-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).not.toContainText('An unexpected Git error occurred')
    await expect(banner).toContainText('different account')
    await expect(
      win.getByTestId('remediation-executable-switch-profile-and-retry-push')
    ).toBeVisible()
  })

  test('rejected push (401 bad credentials): recovery banner offers Reconnect GitHub', async () => {
    const alice = await createProfile(win, {
      displayName: 'Alice',
      email: 'alice@example.com',
      name: 'Alice Dev',
      user: 'alice',
    })
    await setActive(win, alice)
    await createRepo(win, rejectTokenWork, alice)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('remote-push-confirm-btn').click()

    const banner = win.getByTestId('remote-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).not.toContainText('An unexpected Git error occurred')
    const reconnect = win.getByTestId('remediation-executable-reconnect-github')
    await expect(reconnect).toBeVisible()
    await expect(reconnect).toContainText('Reconnect GitHub')
  })

  test('navigate-only issue (unassigned repo): Commit shows a "Go to Repositories" link, not a fix button', async () => {
    const alice = await createProfile(win, {
      displayName: 'Alice',
      email: 'alice@example.com',
      name: 'Alice Dev',
      user: 'alice',
    })
    await setActive(win, alice)
    await createRepo(win, unassignedWork) // UNASSIGNED

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
    await expect(win.getByTestId('commit-blocker').first()).toBeVisible({ timeout: 10000 })

    // REPO_UNASSIGNED → assign-repo-profile is a NAVIGATE remediation (a link, not a fix button).
    const goLink = win.getByTestId('remediation-navigate-assign-repo-profile')
    await expect(goLink).toBeVisible()
    await expect(goLink).toContainText('Repositories')
    await goLink.click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible({ timeout: 5000 })
  })
})
