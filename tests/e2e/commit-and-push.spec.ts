import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { profileFixture, type ProfileInput } from '../fixtures/profiles'
import { launchApp as launchIsolatedApp } from '../fixtures/launchApp'

// Phase 116 — the "Commit & Push" button: one pre-flight sheet, one Confirm, then
// commit + push in one go. Offline against local bare repos as the push "remote"
// (no network), mirroring the conventions in remote.spec.ts / remediation.spec.ts.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-commit-and-push-empty.gitconfig')

function launchApp(): Promise<ElectronApplication> {
  return launchIsolatedApp({ GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG })
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

async function createProfile(win: Page, input: ProfileInput): Promise<string> {
  const id = await win.evaluate(async (p: ProfileInput) => {
    const api = (window as Window & typeof globalThis).api
    const res = await api.profiles.create(p)
    return res.ok ? res.data.id : null
  }, input)
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

function gitLog(cwd: string, format: string): string {
  return execSync(`git log --format="${format}" -n 1`, { cwd, stdio: 'pipe' }).toString().trim()
}

/** A working repo + bare "remote", both already in sync at one initial commit
 *  authored by the given identity, with `origin` configured and upstream tracking set. */
function makeSyncedPair(
  label: string,
  email: string,
  name: string
): { bare: string; work: string } {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), `gw-cap-${label}-bare-`))
  execSync('git init --bare -b main', { cwd: bare, stdio: 'pipe' })

  const work = fs.mkdtempSync(path.join(os.tmpdir(), `gw-cap-${label}-work-`))
  execSync('git init -b main', { cwd: work, stdio: 'pipe' })
  execSync(`git config user.email "${email}"`, { cwd: work, stdio: 'pipe' })
  execSync(`git config user.name "${name}"`, { cwd: work, stdio: 'pipe' })
  fs.writeFileSync(path.join(work, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: work, stdio: 'pipe' })
  execSync('git commit -m init', { cwd: work, stdio: 'pipe' })
  execSync(`git remote add origin "${bare}"`, { cwd: work, stdio: 'pipe' })
  execSync('git push -u origin main', { cwd: work, stdio: 'pipe' })

  return { bare, work }
}

let happyBare: string
let happyWork: string
let blockedWork: string
let partialBare: string
let partialWork: string
let cancelBare: string
let cancelWork: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  // Happy path: clean identity, one remote, one staged file.
  const happy = makeSyncedPair('happy', 'alice@example.com', 'Alice Dev')
  happyBare = happy.bare
  happyWork = happy.work
  fs.writeFileSync(path.join(happyWork, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: happyWork, stdio: 'pipe' })

  // Blocked path: repo committed under Alice's identity but left assigned to Alice
  // while a DIFFERENT profile is made active (PROFILE_MISMATCH — a blocker in both
  // the commit gate and the push gate).
  const blocked = makeSyncedPair('blocked', 'alice@example.com', 'Alice Dev')
  blockedWork = blocked.work
  fs.rmSync(blocked.bare, { recursive: true, force: true })

  // Partial-failure path: a second clone pushes an extra commit so origin moves
  // ahead of what the work repo's local refs know about — the commit succeeds, but
  // the subsequent push is rejected non-fast-forward.
  const partial = makeSyncedPair('partial', 'alice@example.com', 'Alice Dev')
  partialBare = partial.bare
  partialWork = partial.work
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-cap-partial-other-'))
  execSync(`git clone "${partialBare}" "${other}"`, { stdio: 'pipe' })
  execSync('git config user.email "other@example.com"', { cwd: other, stdio: 'pipe' })
  execSync('git config user.name "Other Dev"', { cwd: other, stdio: 'pipe' })
  fs.writeFileSync(path.join(other, 'remote-ahead.txt'), 'remote moved on\n')
  execSync('git add remote-ahead.txt', { cwd: other, stdio: 'pipe' })
  execSync('git commit -m remote-ahead', { cwd: other, stdio: 'pipe' })
  execSync('git push origin main', { cwd: other, stdio: 'pipe' })
  fs.rmSync(other, { recursive: true, force: true })
  fs.writeFileSync(path.join(partialWork, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: partialWork, stdio: 'pipe' })

  // Cancel path: same shape as happy path — proves Cancel touches neither the repo
  // nor the remote.
  const cancel = makeSyncedPair('cancel', 'alice@example.com', 'Alice Dev')
  cancelBare = cancel.bare
  cancelWork = cancel.work
  fs.writeFileSync(path.join(cancelWork, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: cancelWork, stdio: 'pipe' })
})

test.afterAll(() => {
  for (const d of [
    happyBare,
    happyWork,
    blockedWork,
    partialBare,
    partialWork,
    cancelBare,
    cancelWork,
  ]) {
    fs.rmSync(d, { recursive: true, force: true })
  }
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Commit & Push', () => {
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

  test('happy path: one Confirm commits and pushes in one go', async () => {
    const aliceId = await createProfile(win, profileFixture('alice'))
    await createRepo(win, happyWork, aliceId)
    await setActive(win, aliceId)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
    await expect(win.getByTestId('commit-staged-summary')).toContainText('feature.txt', {
      timeout: 10000,
    })
    await win.getByTestId('commit-message').fill('add feature (commit and push)')

    await expect(win.getByTestId('commit-and-push-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('commit-and-push-btn').click()
    await expect(win.getByTestId('commit-and-push-sheet')).toBeVisible({ timeout: 5000 })

    await expect(win.getByTestId('commit-and-push-confirm-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('commit-and-push-confirm-btn').click()

    await expect(win.getByTestId('commit-and-push-sheet')).not.toBeVisible()
    await expect(win.getByTestId('commit-and-push-success')).toBeVisible({ timeout: 15000 })

    const bareSubject = gitLog(happyBare, '%s')
    expect(bareSubject).toBe('add feature (commit and push)')
    const bareAuthor = gitLog(happyBare, '%an %ae')
    expect(bareAuthor).toBe('Alice Dev alice@example.com')
  })

  test('blocked path: a profile mismatch disables Confirm and shows the union verdict', async () => {
    const aliceId = await createProfile(win, profileFixture('alice'))
    await createProfile(win, profileFixture('work'))
    await createRepo(win, blockedWork, aliceId) // assigned to Alice
    await setActive(win, aliceId) // start matched, so auto-select doesn't just re-sync it

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // Deliberately move OFF the assigned profile via the Profiles UI (the user-override
    // path) so PROFILE_MISMATCH persists — selecting the repo would otherwise re-sync it
    // (appStore.setActiveRepo's syncProfileToRepo).
    await win.getByTestId('nav-profiles').click()
    await expect(win.getByTestId('screen-profiles')).toBeVisible()
    await win
      .getByTestId('profile-item')
      .filter({ hasText: 'Work' })
      .getByTestId('profile-row-set-active-btn')
      .click()
    await expect(
      win
        .getByTestId('profile-item')
        .filter({ hasText: 'Work' })
        .getByTestId('profile-active-badge')
    ).toBeVisible({ timeout: 10000 })

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()

    await expect(win.getByTestId('commit-and-push-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('commit-and-push-btn').click()
    await expect(win.getByTestId('commit-and-push-sheet')).toBeVisible({ timeout: 5000 })

    await expect(win.getByTestId('commit-and-push-issue-PROFILE_MISMATCH')).toBeVisible({
      timeout: 10000,
    })
    await expect(win.getByTestId('commit-and-push-confirm-btn')).toBeDisabled()

    // Nothing ran — cancel and confirm the repo is untouched.
    await win.getByTestId('commit-and-push-cancel-btn').click()
    await expect(win.getByTestId('commit-and-push-sheet')).not.toBeVisible()
  })

  test('partial-failure path: the commit lands but a non-fast-forward push is recovered, not lost', async () => {
    const aliceId = await createProfile(win, profileFixture('alice'))
    await createRepo(win, partialWork, aliceId)
    await setActive(win, aliceId)

    const headBefore = execSync('git rev-parse HEAD', { cwd: partialWork, stdio: 'pipe' })
      .toString()
      .trim()

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
    await expect(win.getByTestId('commit-staged-summary')).toContainText('feature.txt', {
      timeout: 10000,
    })
    await win.getByTestId('commit-message').fill('add feature (partial failure)')

    await expect(win.getByTestId('commit-and-push-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('commit-and-push-btn').click()
    await expect(win.getByTestId('commit-and-push-sheet')).toBeVisible({ timeout: 5000 })
    // The local safety gate cannot see the remote's moved-on state ahead of time.
    await expect(win.getByTestId('commit-and-push-confirm-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('commit-and-push-confirm-btn').click()

    // The commit is real and stays visible even though the push failed.
    await expect(win.getByTestId('commit-success')).toBeVisible({ timeout: 15000 })
    await expect(win.getByTestId('remote-recovery-banner')).toBeVisible({ timeout: 15000 })

    const headAfter = execSync('git rev-parse HEAD', { cwd: partialWork, stdio: 'pipe' })
      .toString()
      .trim()
    expect(headAfter).not.toBe(headBefore)

    const bareSubject = gitLog(partialBare, '%s')
    expect(bareSubject).toBe('remote-ahead') // the failed push never reached the bare remote
  })

  test('cancel path: Cancel leaves the working repo and the remote untouched', async () => {
    const aliceId = await createProfile(win, profileFixture('alice'))
    await createRepo(win, cancelWork, aliceId)
    await setActive(win, aliceId)

    const headBefore = execSync('git rev-parse HEAD', { cwd: cancelWork, stdio: 'pipe' })
      .toString()
      .trim()

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
    await expect(win.getByTestId('commit-staged-summary')).toContainText('feature.txt', {
      timeout: 10000,
    })
    await win.getByTestId('commit-message').fill('add feature (should never land)')

    await expect(win.getByTestId('commit-and-push-btn')).toBeEnabled({ timeout: 10000 })
    await win.getByTestId('commit-and-push-btn').click()
    await expect(win.getByTestId('commit-and-push-sheet')).toBeVisible({ timeout: 5000 })
    await expect(win.getByTestId('commit-and-push-confirm-btn')).toBeEnabled({ timeout: 10000 })

    await win.getByTestId('commit-and-push-cancel-btn').click()
    await expect(win.getByTestId('commit-and-push-sheet')).not.toBeVisible()
    await expect(win.getByTestId('commit-success')).not.toBeVisible()

    const headAfter = execSync('git rev-parse HEAD', { cwd: cancelWork, stdio: 'pipe' })
      .toString()
      .trim()
    expect(headAfter).toBe(headBefore)
    expect(
      execSync('git log --format=%s -n 1', { cwd: cancelBare, stdio: 'pipe' }).toString().trim()
    ).toBe('init')
  })
})
