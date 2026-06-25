import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-safety-copilot-empty.gitconfig')

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

let fixtureIdentity: string
let bareRepo: string
let fixtureRemote: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureIdentity = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-safety-copilot-id-'))
  execSync('git init -b main', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git config user.email "temp@temp.com"', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git config user.name "Temp"', { cwd: fixtureIdentity, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureIdentity, 'readme.txt'), 'initial\n')
  execSync('git add readme.txt', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureIdentity, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureIdentity, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git config --unset user.email', { cwd: fixtureIdentity, stdio: 'pipe' })
  execSync('git config --unset user.name', { cwd: fixtureIdentity, stdio: 'pipe' })

  bareRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-safety-copilot-bare-'))
  execSync('git init --bare', { cwd: bareRepo, stdio: 'pipe' })
  fixtureRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-safety-copilot-work-'))
  execSync('git init -b main', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRemote, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRemote, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureRemote, stdio: 'pipe' })
  execSync(`git remote add origin "${bareRepo}"`, { cwd: fixtureRemote, stdio: 'pipe' })
  execSync('git push origin main', { cwd: fixtureRemote, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureIdentity, { recursive: true, force: true })
  fs.rmSync(fixtureRemote, { recursive: true, force: true })
  fs.rmSync(bareRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Safety Copilot', () => {
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

  test('deterministic explanation works with AI disabled and does not unblock commit', async () => {
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
          name: 'identity-fixture',
          localPath: repoPath,
          assignedProfileId: pid,
          isFavorite: false,
        })
      },
      [fixtureIdentity, profileId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.getByTestId('nav-safety-center').click()
    await expect(win.getByTestId('safety-issue-IDENTITY_UNSET')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('safety-explain-btn-IDENTITY_UNSET').click()
    await expect(win.getByTestId('safety-explain-panel-IDENTITY_UNSET')).toBeVisible()
    await expect(win.getByTestId('safety-explain-source')).toContainText('Deterministic')
    await expect(win.getByTestId('safety-explain-action-hint')).toContainText('Set local identity')

    await win.getByTestId('nav-commit').click()
    await win.getByTestId('commit-message').fill('test commit')
    await expect(win.getByTestId('commit-btn')).toBeDisabled()
    await expect(win.getByTestId('commit-blocker')).toBeVisible()
  })

  test('push sheet explanation does not enable a blocked push', async () => {
    const profileId = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const res = await api.profiles.create({
        displayName: 'Work',
        gitAuthorName: 'Alice Dev',
        gitAuthorEmail: 'alice@example.com',
        githubUsername: 'alice',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: ['github.com'],
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
          name: 'remote-fixture',
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
    await expect(win.getByTestId('remote-push-issue-REMOTE_HOST_MISMATCH')).toBeVisible({
      timeout: 10000,
    })

    await win.getByTestId('remote-push-explain-btn-REMOTE_HOST_MISMATCH').click()
    await expect(win.getByTestId('remote-push-explain-panel-REMOTE_HOST_MISMATCH')).toBeVisible()
    await expect(win.getByTestId('remote-push-explain-source')).toContainText('Deterministic')

    await expect(win.getByTestId('remote-push-confirm-btn')).toBeDisabled()
  })
})
