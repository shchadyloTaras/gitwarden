import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// Empty global git config so the header guard never inherits a global identity — the
// identity-unset fixture must read as IDENTITY_UNSET (blocked), not as a global-only warning.
const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-guard-empty.gitconfig')

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

/** Create a profile, make it active, and register a single repo (auto-selected on reload). */
async function setupRepo(
  win: Page,
  repoPath: string,
  email: string,
  assign: boolean
): Promise<void> {
  const profileId = await win.evaluate(async (e: string) => {
    const api = (window as Window & typeof globalThis).api
    const res = await api.profiles.create({
      displayName: 'Alice',
      gitAuthorName: 'Alice Dev',
      gitAuthorEmail: e,
      githubUsername: 'alice',
      authenticationMethod: 'ssh',
      expectedRemoteHosts: [],
    })
    return res.ok ? res.data.id : null
  }, email)
  expect(profileId).toBeTruthy()

  await win.evaluate(async (id: string) => {
    const api = (window as Window & typeof globalThis).api
    await api.settings.update({ activeProfileId: id })
  }, profileId as string)

  await win.evaluate(
    async ([rp, pid, doAssign]: [string, string, boolean]) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'guard-fixture',
        localPath: rp,
        assignedProfileId: doAssign ? pid : undefined,
        isFavorite: false,
      })
    },
    [repoPath, profileId as string, assign]
  )

  await win.reload()
  await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
}

// Fixture A: committed repo whose LOCAL identity matches the profile → Guard · Ready.
let fixtureAligned: string
// Fixture B: repo with NO local identity → IDENTITY_UNSET → Guard · Blocked.
let fixtureBlocked: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureAligned = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-guard-aligned-'))
  execSync('git init -b main', { cwd: fixtureAligned, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureAligned, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureAligned, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureAligned, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureAligned, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureAligned, stdio: 'pipe' })

  fixtureBlocked = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-guard-blocked-'))
  execSync('git init -b main', { cwd: fixtureBlocked, stdio: 'pipe' })
  // Commit with command-scoped identity so HEAD exists but NO local identity is persisted.
  execSync('git -c user.email=t@t.com -c user.name=Temp commit --allow-empty -m "initial"', {
    cwd: fixtureBlocked,
    stdio: 'pipe',
  })
})

test.afterAll(() => {
  fs.rmSync(fixtureAligned, { recursive: true, force: true })
  fs.rmSync(fixtureBlocked, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    /* ignore */
  }
})

test.describe('Header guard badge', () => {
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

  test('aligned repo shows Guard · Ready', async () => {
    await setupRepo(win, fixtureAligned, 'alice@example.com', true)
    await expect(win.getByTestId('header-guard-badge')).toHaveText(/Guard.*Ready/, {
      timeout: 10000,
    })
  })

  test('identity-unset repo shows Guard · Blocked', async () => {
    await setupRepo(win, fixtureBlocked, 'alice@example.com', true)
    await expect(win.getByTestId('header-guard-badge')).toHaveText(/Guard.*Blocked/, {
      timeout: 10000,
    })
  })

  test('clicking the guard with an active repo opens the Safety Center', async () => {
    await setupRepo(win, fixtureAligned, 'alice@example.com', true)
    await expect(win.getByTestId('header-guard-badge')).toHaveText(/Guard.*Ready/, {
      timeout: 10000,
    })

    await win.getByTestId('header-guard-badge').click()
    await expect(win.getByTestId('screen-safety-center')).toBeVisible()
  })

  test('with no active repo the guard reads Not checked and routes to Repositories', async () => {
    // beforeEach left no repos → no active repo → neutral chip.
    await expect(win.getByTestId('header-guard-badge')).toHaveText(/Guard.*Not checked/)

    // Navigate away, then click the guard — it must route back to Repositories.
    await win.getByTestId('nav-settings').click()
    await expect(win.getByTestId('screen-settings')).toBeVisible()

    await win.getByTestId('header-guard-badge').click()
    await expect(win.getByTestId('screen-repositories')).toBeVisible()
  })
})
