import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// Phase 27 — push safety with the GitHub account check.
//
// Uses the injected fake GitHub service (token resolves to @octocat). A repo with an
// HTTPS GitHub remote is assigned to a profile; when the profile's linked @login differs
// from the token's real account, the push is blocked by GITHUB_ACCOUNT_MISMATCH and the
// Confirm button is disabled. When they match, no GitHub blocker appears and Confirm is
// enabled (the push proceeds only on that explicit click). No real GitHub call happens.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-ghpush-empty.gitconfig')
let workingRepo: string

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      GITWARDEN_E2E_FAKE_GITHUB: '1',
      GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG,
    },
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

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')
  workingRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ghpush-'))
  execSync('git init -b main', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.email "octo@example.com"', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git config user.name "Octo Dev"', { cwd: workingRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(workingRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: workingRepo, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: workingRepo, stdio: 'pipe' })
  // HTTPS GitHub remote → the HTTPS-token push checks engage (never actually pushed).
  execSync('git remote add origin "https://github.com/octocat/repo.git"', {
    cwd: workingRepo,
    stdio: 'pipe',
  })
})

test.afterAll(() => {
  fs.rmSync(workingRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    /* ignore */
  }
})

/** Create a profile matching the repo's local identity, link it via the fake flow. */
async function setupLinkedProfile(win: Page, linkedLogin: string): Promise<string> {
  const profileId = await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const res = await api.profiles.create({
      displayName: 'Octo',
      gitAuthorName: 'Octo Dev',
      gitAuthorEmail: 'octo@example.com',
      githubUsername: 'octocat',
      authenticationMethod: 'token',
      expectedRemoteHosts: ['github.com'],
    })
    return res.ok ? res.data.id : ''
  })

  // Link via the real device flow and await the 'authorized' event — by then the
  // coordinator has stored the token and persisted linkedGitHub.login = 'octocat'.
  await win.evaluate(async (pid: string) => {
    const api = (window as Window & typeof globalThis).api
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connect timeout')), 8000)
      const unsub = api.github.onAuthEvent((e) => {
        if (e.profileId !== pid) return
        if (e.status === 'authorized') {
          clearTimeout(timer)
          unsub()
          resolve()
        } else if (e.status === 'denied' || e.status === 'expired' || e.status === 'error') {
          clearTimeout(timer)
          unsub()
          reject(new Error(`auth failed: ${e.status}`))
        }
      })
      void api.github.startDeviceAuth(pid)
    })
  }, profileId)

  // Force the linked @login (mismatch case overrides it to a different account).
  if (linkedLogin !== 'octocat') {
    await win.evaluate(
      async ([pid, login]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        const cur = await api.profiles.get(pid)
        const linked = cur.ok && cur.data?.linkedGitHub ? cur.data.linkedGitHub : null
        if (linked) await api.profiles.update(pid, { linkedGitHub: { ...linked, login } })
      },
      [profileId, linkedLogin]
    )
  }

  // Assign the repo and make the profile active.
  await win.evaluate(
    async ([pid, repoPath]: [string, string]) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'octo-repo',
        localPath: repoPath,
        assignedProfileId: pid,
        isFavorite: false,
      })
      await api.settings.update({ activeProfileId: pid })
    },
    [profileId, workingRepo]
  )
  return profileId
}

async function openPushSheet(win: Page): Promise<void> {
  await win.reload()
  await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  await win.getByTestId('nav-remote').click()
  await expect(win.getByTestId('screen-remote')).toBeVisible()
  await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
  await win.getByTestId('remote-op-push').click()
  await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })
}

test.describe('GitHub HTTPS-token push safety (injected fake service)', () => {
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
    await cleanupAll(win)
    await app.close()
  })

  test('push is BLOCKED on GITHUB_ACCOUNT_MISMATCH', async () => {
    // Linked to @mallory, but the stored token authenticates as @octocat → mismatch.
    await setupLinkedProfile(win, 'mallory')
    await openPushSheet(win)

    await expect(win.getByTestId('remote-push-blocker')).toBeVisible()
    await expect(win.getByTestId('remote-push-blocker')).toContainText('different account')
    await expect(win.getByTestId('remote-push-github-line')).toContainText('does NOT match')
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()
  })

  test('push is ALLOWED (Confirm enabled) when the token account matches the link', async () => {
    // Linked to @octocat and the token authenticates as @octocat → match.
    await setupLinkedProfile(win, 'octocat')
    await openPushSheet(win)

    await expect(win.getByTestId('remote-push-github-line')).toContainText('matches')
    await expect(win.getByTestId('remote-push-blocker')).toHaveCount(0)
    // Proceeds only via the explicit Confirm click, which is now enabled.
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled()
  })
})
