import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-push-brief-empty.gitconfig')

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GITWARDEN_E2E_FAKE_AI: '1', GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG },
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
    const aiRes = await api.ai.listConnections()
    if (aiRes.ok) {
      for (const c of aiRes.data.connections) await api.ai.deleteConnection(c.id)
    }
    await api.settings.update({ activeProfileId: undefined, aiEnabled: false })
  })
}

let fixtureRemote: string
let bareRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  bareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-push-brief-bare-'))
  execSync('git init --bare', { cwd: bareRepo, stdio: 'pipe' })

  fixtureRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-push-brief-work-'))
  execSync('git init -b main', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRemote, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRemote, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync(`git remote add origin "${bareRepo}"`, { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git push origin main', { cwd: fixtureRemote, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRemote, 'feature.txt'), 'feature\n')
  execSync('git add feature.txt', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git commit -m "feat: ahead commit"', { cwd: fixtureRemote, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRemote, { recursive: true, force: true })
  fs.rmSync(bareRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Push Brief & History Intelligence', () => {
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

  test('push sheet shows deterministic brief and still requires explicit confirmation', async () => {
    const profileId = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const res = await api.profiles.create({
        displayName: 'Alice',
        gitAuthorName: 'Alice Dev',
        gitAuthorEmail: 'alice@example.com',
        githubUsername: 'alice',
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
      async ([repoPath, pid]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'push-brief-fixture',
          localPath: repoPath,
          assignedProfileId: pid,
          isFavorite: false,
        })
      },
      [fixtureRemote, profileId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-remote').click()
    await win.getByTestId('remote-op-push').click()
    await expect(win.getByTestId('remote-push-sheet')).toBeVisible({ timeout: 5000 })
    await expect(win.getByTestId('push-brief-panel')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('push-brief-summary')).toContainText('publish')
    await expect(win.getByTestId('push-brief-identity')).toContainText('Alice')
    await expect(win.getByTestId('push-brief-summary')).not.toContainText('ghp_')
    await expect(win.getByTestId('remote-push-confirm-btn')).toBeEnabled()
    await win.getByTestId('remote-push-cancel-btn').click()
    await expect(win.getByTestId('remote-push-sheet')).not.toBeVisible()
  })

  test('history screen shows deterministic summary with AI disabled', async () => {
    await win.evaluate(async (repoPath: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'history-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRemote)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-history').click()
    await win.getByTestId('history-summary-open-btn').click()
    await expect(win.getByTestId('history-summary-panel')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('history-summary-source')).toContainText('Deterministic')
    await expect(win.getByTestId('history-summary-release-notes')).toContainText(
      'feat: ahead commit'
    )
    await expect(win.getByTestId('history-summary-changelog')).not.toContainText('ghp_')
  })
})
