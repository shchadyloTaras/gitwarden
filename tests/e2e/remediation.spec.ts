import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// Guard Quick-Fix Phase 67 — one-click fix UI + failed-push recovery banner.
// Offline: local bare repos as "remotes"; rejecting remotes use a pre-receive hook whose
// stderr matches the ErrorMapper regexes (named permission denial → wrong-account,
// generic 401/403 → auth/scope).

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-remediation-empty.gitconfig')

function launchApp(): Promise<ElectronApplication> {
  return launchIsolatedApp({ GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG, GITWARDEN_E2E_FAKE_GITHUB: '1' })
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

  // Scenario 2 — push rejected as wrong account (GitHub names the denied actor).
  rejectWrongBare = makeRejectingBare(
    'wrong',
    'remote: Permission to octo/repo.git denied to wronguser.'
  )
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

// Diverged-Branch Merge (Phase 71) fixtures — a bare "remote" plus a work repo that
// diverges from it (each side gets a unique commit), built with a helper so each
// scenario (clean / conflicting / dirty-tree) gets its own independent pair.
function makeDivergedPair(label: string, editSameLine: boolean): { bare: string; work: string } {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), `gw-merge-${label}-bare-`))
  execSync('git init --bare -b main', { cwd: bare, stdio: 'pipe' })

  const work = fs.mkdtempSync(path.join(os.tmpdir(), `gw-merge-${label}-work-`))
  gitInWork(work, 'alice@example.com', 'Alice Dev') // already `git init -b main`
  fs.writeFileSync(path.join(work, 'base.txt'), 'one\n')
  execSync('git add base.txt', { cwd: work, stdio: 'pipe' })
  execSync('git commit -m c1', { cwd: work, stdio: 'pipe' })
  execSync(`git remote add origin "${bare}"`, { cwd: work, stdio: 'pipe' })
  execSync('git push origin main', { cwd: work, stdio: 'pipe' })

  // A second clone pushes an extra commit so the remote moves ahead.
  const other = fs.mkdtempSync(path.join(os.tmpdir(), `gw-merge-${label}-other-`))
  execSync(`git clone "${bare}" "${other}"`, { stdio: 'pipe' })
  execSync('git config user.email "other@example.com"', { cwd: other, stdio: 'pipe' })
  execSync('git config user.name "Other Dev"', { cwd: other, stdio: 'pipe' })
  fs.writeFileSync(path.join(other, 'base.txt'), 'one\ntwo\n')
  execSync('git commit -am remote-ahead', { cwd: other, stdio: 'pipe' })
  execSync('git push origin main', { cwd: other, stdio: 'pipe' })

  // The work repo makes its OWN commit → the two branches diverge. Editing the
  // SAME line of base.txt produces a real content conflict; editing an unrelated
  // file diverges cleanly (git can auto-merge both sides).
  if (editSameLine) {
    fs.writeFileSync(path.join(work, 'base.txt'), 'one\nlocal\n')
    execSync('git commit -am local-divergent-conflicting', { cwd: work, stdio: 'pipe' })
  } else {
    fs.writeFileSync(path.join(work, 'local-only.txt'), 'local addition\n')
    execSync('git add local-only.txt', { cwd: work, stdio: 'pipe' })
    execSync('git commit -m local-divergent-clean', { cwd: work, stdio: 'pipe' })
  }

  fs.rmSync(other, { recursive: true, force: true })
  return { bare, work }
}

let mergeCleanBare: string
let mergeCleanWork: string
let mergeConflictBare: string
let mergeConflictWork: string
let mergeDirtyBare: string
let mergeDirtyWork: string

test.beforeAll(() => {
  const clean = makeDivergedPair('clean', false)
  mergeCleanBare = clean.bare
  mergeCleanWork = clean.work

  const conflict = makeDivergedPair('conflict', true)
  mergeConflictBare = conflict.bare
  mergeConflictWork = conflict.work

  const dirty = makeDivergedPair('dirty', false)
  mergeDirtyBare = dirty.bare
  mergeDirtyWork = dirty.work
  // Leave an extra UNCOMMITTED change on top of the dirty scenario's divergence.
  fs.writeFileSync(path.join(mergeDirtyWork, 'uncommitted.txt'), 'not committed\n')
})

test.afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
  for (const d of [
    mergeCleanBare,
    mergeCleanWork,
    mergeConflictBare,
    mergeConflictWork,
    mergeDirtyBare,
    mergeDirtyWork,
  ]) {
    if (d) fs.rmSync(d, { recursive: true, force: true })
  }
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
    await reconnect.click()
    await expect(win.getByTestId('remediation-device-code')).toContainText('WDJB-MJHT')

    // Phase 103: the code must stay readable through the whole wait — the fake GitHub
    // service auto-authorizes after ~1s, exactly the window the OLD code could dismiss
    // this hint in (onSuccess fired the instant the device code was issued, not when
    // authorization actually completed). It must still be showing right before that,
    // and only THEN transition to "Authorized as @octocat".
    await expect(win.getByTestId('remediation-device-code')).toBeVisible()
    await expect(win.getByTestId('remediation-device-code-authorized')).toContainText('octocat', {
      timeout: 10000,
    })
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

test.describe('Diverged-Branch Merge — one-click local merge (Phase 71, feature-complete stop point)', () => {
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

  test('clean divergence: Pull shows a merge button; merging clears the banner and Push then lands in the bare remote', async () => {
    const alice = await createProfile(win, {
      displayName: 'Alice',
      email: 'alice@example.com',
      name: 'Alice Dev',
      user: 'alice',
    })
    await setActive(win, alice)
    await createRepo(win, mergeCleanWork, alice)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('remote-op-pull').click()

    // Diverged → the recovery banner offers the one-click merge, not a generic error.
    const banner = win.getByTestId('remote-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).not.toContainText('An unexpected Git error occurred')
    const mergeBtn = win.getByTestId('remediation-executable-merge-remote-into-local')
    await expect(mergeBtn).toBeVisible()
    await expect(mergeBtn).toContainText('origin/main')
    await mergeBtn.click()

    // Clean merge → the banner clears (deterministic signal).
    await expect(banner).not.toBeVisible({ timeout: 10000 })

    // The user pushes separately (no auto-push) and it lands in the bare remote.
    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('remote-push-confirm-btn').click()
    await expect(win.getByTestId('remote-success')).toBeVisible({ timeout: 15000 })

    const remoteLog = execSync('git log main --format=%s', { cwd: mergeCleanBare }).toString()
    expect(remoteLog).toContain('local-divergent-clean')
    expect(remoteLog).toContain('remote-ahead')
  })

  test('conflicting divergence: the merge button re-diagnoses to "Go to Status", which shows the file conflicted', async () => {
    const alice = await createProfile(win, {
      displayName: 'Alice',
      email: 'alice@example.com',
      name: 'Alice Dev',
      user: 'alice',
    })
    await setActive(win, alice)
    await createRepo(win, mergeConflictWork, alice)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('remote-op-pull').click()

    const banner = win.getByTestId('remote-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10000 })
    const mergeBtn = win.getByTestId('remediation-executable-merge-remote-into-local')
    await expect(mergeBtn).toBeVisible()
    await mergeBtn.click()

    // A real content conflict is NEVER auto-resolved — re-diagnosed to a navigate link.
    const goToStatus = win.getByTestId('remediation-navigate-resolve-conflicts')
    await expect(goToStatus).toBeVisible({ timeout: 10000 })
    await expect(goToStatus).toContainText('Status')
    await goToStatus.click()

    await expect(win.getByTestId('screen-status')).toBeVisible({ timeout: 5000 })
    const conflictedRow = win.getByTestId('staged-file-row').filter({ hasText: 'base.txt' })
    await expect(conflictedRow).toBeVisible({ timeout: 10000 })
    await expect(conflictedRow).toContainText('!') // the conflicted-kind badge

    // Left in git's standard mid-merge state — no auto-resolution.
    expect(fs.existsSync(path.join(mergeConflictWork, '.git', 'MERGE_HEAD'))).toBe(true)
  })

  test('dirty working tree: the merge button refuses with the clean-tree message and never merges', async () => {
    const headBefore = execSync('git rev-parse HEAD', { cwd: mergeDirtyWork }).toString().trim()

    const alice = await createProfile(win, {
      displayName: 'Alice',
      email: 'alice@example.com',
      name: 'Alice Dev',
      user: 'alice',
    })
    await setActive(win, alice)
    await createRepo(win, mergeDirtyWork, alice)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('remote-op-pull').click()

    const banner = win.getByTestId('remote-recovery-banner')
    await expect(banner).toBeVisible({ timeout: 10000 })
    const mergeBtn = win.getByTestId('remediation-executable-merge-remote-into-local')
    await expect(mergeBtn).toBeVisible()
    await mergeBtn.click()

    await expect(banner).toContainText(/commit or stash/i, { timeout: 10000 })
    // No fix button offered for this in-app, message-only refusal.
    await expect(win.getByTestId('remediation-executable-merge-remote-into-local')).toHaveCount(0)

    // Never attempted: HEAD is unchanged and no mid-merge state exists.
    const headAfter = execSync('git rev-parse HEAD', { cwd: mergeDirtyWork }).toString().trim()
    expect(headAfter).toBe(headBefore)
    expect(fs.existsSync(path.join(mergeDirtyWork, '.git', 'MERGE_HEAD'))).toBe(false)
  })
})
