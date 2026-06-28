import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { profileFixture, type ProfileInput } from '../fixtures/profiles'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-ai-commit-empty.gitconfig')

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

test.describe('Smart Commit Assistant', () => {
  let app: ElectronApplication
  let win: Page
  let fixtureRepo: string

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

  test.beforeEach(async () => {
    fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-commit-'))
    execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.email "temp@temp.com"', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.name "Temp"', { cwd: fixtureRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(fixtureRepo, 'readme.txt'), 'initial\n')
    execSync('git add readme.txt', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git commit -m "initial"', { cwd: fixtureRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(fixtureRepo, 'feature.txt'), 'new feature\n')
    execSync('git add feature.txt', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config --unset user.email', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config --unset user.name', { cwd: fixtureRepo, stdio: 'pipe' })

    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)

    const aliceInput = profileFixture('alice', { expectedRemoteHosts: ['github.com'] })
    const profileId = await win.evaluate(async (input: ProfileInput) => {
      const api = (window as Window & typeof globalThis).api
      const profile = await api.profiles.create({
        ...input,
      })
      if (!profile.ok) throw new Error(profile.error)
      await api.settings.update({ activeProfileId: profile.data.id })
      const connection = await api.ai.createConnection({
        name: 'OpenRouter',
        kind: 'openrouter',
        defaultModel: 'openrouter/fake-recommended',
      })
      if (!connection.ok) throw new Error(connection.error)
      await api.settings.update({ aiEnabled: true })
      return profile.data.id
    }, aliceInput)

    await win.evaluate(
      async ([repoPath, assignedProfileId]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        const repo = await api.repositories.create({
          name: 'ai-commit-fixture',
          localPath: repoPath,
          assignedProfileId,
          isFavorite: false,
        })
        if (!repo.ok) throw new Error(repo.error)
      },
      [fixtureRepo, profileId]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await cleanupAll(win)
    await app.close()
    fs.rmSync(fixtureRepo, { recursive: true, force: true })
  })

  test('draft-with-AI: one click writes the message straight into the field and respects the commit gate', async () => {
    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('commit-staged-summary')).toContainText('feature.txt')

    // One click drafts and inserts the conventional message directly — no preview
    // panel, no variant picker.
    await win.getByTestId('ai-commit-draft-toggle').click()
    await expect(win.getByTestId('commit-message')).toHaveValue(
      /feat\(ai\): add fake structured output/,
      { timeout: 10000 }
    )

    await expect(win.getByTestId('commit-blocker')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('commit-btn')).toBeDisabled()

    await win.getByTestId('commit-set-identity-btn').click()
    await expect(win.getByTestId('commit-btn')).toBeEnabled({ timeout: 10000 })
  })

  test('expensive send: large staged diff still drafts in one click (auto-acknowledged)', async () => {
    const largeContent = `${'large-change-'.repeat(4_000)}\n`
    fs.writeFileSync(path.join(fixtureRepo, 'large.txt'), largeContent)
    execSync('git add large.txt', { cwd: fixtureRepo, stdio: 'pipe' })

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('commit-staged-summary')).toContainText('large.txt')

    await win.getByTestId('ai-commit-draft-toggle').click()
    await expect(win.getByTestId('commit-message')).toHaveValue(
      /feat\(ai\): add fake structured output/,
      { timeout: 10000 }
    )
    await expect(win.getByTestId('ai-commit-assistant-error')).toHaveCount(0)
  })
})
