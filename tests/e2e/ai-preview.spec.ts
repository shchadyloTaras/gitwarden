import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const RAW_GITHUB_TOKEN = `ghp_${'e'.repeat(36)}`

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GITWARDEN_E2E_FAKE_AI: '1' },
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

test.describe('AI send preview', () => {
  let app: ElectronApplication
  let win: Page
  let fixtureRepo: string

  test.beforeEach(async () => {
    fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-preview-'))
    execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(fixtureRepo, 'readme.txt'), 'initial\n')
    execSync('git add readme.txt', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git commit -m "initial"', { cwd: fixtureRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(fixtureRepo, 'secrets.txt'), `token=${RAW_GITHUB_TOKEN}\n`)
    execSync('git add secrets.txt', { cwd: fixtureRepo, stdio: 'pipe' })

    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)

    const profileId = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const profile = await api.profiles.create({
        displayName: 'Alice',
        gitAuthorName: 'Alice Dev',
        gitAuthorEmail: 'alice@example.com',
        githubUsername: 'alice',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: ['github.com'],
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
    })

    await win.evaluate(
      async ([repoPath, assignedProfileId]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        const repo = await api.repositories.create({
          name: 'ai-preview-fixture',
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

  test('shows the post-redaction payload and destination host before sending a diff', async () => {
    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('commit-staged-summary')).toContainText('secrets.txt')

    await win.getByTestId('ai-preview-btn').click()

    await expect(win.getByTestId('ai-preview-host')).toContainText('openrouter.ai')
    await expect(win.getByTestId('ai-preview-payload')).toContainText('redacted:github-token')
    await expect(win.getByTestId('ai-preview-payload')).not.toContainText(RAW_GITHUB_TOKEN)
    await expect(win.getByTestId('ai-preview-redactions')).toContainText('redaction')
  })
})
