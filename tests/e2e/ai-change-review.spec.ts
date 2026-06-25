import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-ai-review-empty.gitconfig')

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

async function setupRepoAndProfile(
  win: Page,
  fixtureRepo: string,
  options?: { stageSecret?: boolean; aiEnabled?: boolean }
): Promise<string> {
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
    return profile.data.id
  })

  await win.evaluate(
    async ([repoPath, assignedProfileId, enableAi]: [string, string, boolean]) => {
      const api = (window as Window & typeof globalThis).api
      const repo = await api.repositories.create({
        name: 'ai-review-fixture',
        localPath: repoPath,
        assignedProfileId,
        isFavorite: false,
      })
      if (!repo.ok) throw new Error(repo.error)
      if (enableAi) {
        const connection = await api.ai.createConnection({
          name: 'OpenRouter',
          kind: 'openrouter',
          defaultModel: 'openrouter/fake-recommended',
        })
        if (!connection.ok) throw new Error(connection.error)
        await api.settings.update({ aiEnabled: true })
      }
    },
    [fixtureRepo, profileId, options?.aiEnabled ?? false]
  )

  if (options?.stageSecret) {
    fs.writeFileSync(
      path.join(fixtureRepo, 'secrets.env'),
      'TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyz\n'
    )
    execSync('git add secrets.env', { cwd: fixtureRepo, stdio: 'pipe' })
  }

  await win.reload()
  await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  return profileId
}

test.describe('Change Review Assistant', () => {
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
    fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-review-'))
    execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.email "temp@temp.com"', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.name "Temp"', { cwd: fixtureRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(fixtureRepo, 'readme.txt'), 'initial\n')
    execSync('git add readme.txt', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git commit -m "initial"', { cwd: fixtureRepo, stdio: 'pipe' })

    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)
  })

  test.afterEach(async () => {
    await cleanupAll(win)
    await app.close()
    fs.rmSync(fixtureRepo, { recursive: true, force: true })
  })

  test('deterministic secret blocks commit (AI disabled) and survives message edits', async () => {
    fs.writeFileSync(
      path.join(fixtureRepo, 'secrets.env'),
      'TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyz\n'
    )
    execSync('git add secrets.env', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config --unset user.email', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config --unset user.name', { cwd: fixtureRepo, stdio: 'pipe' })

    await setupRepoAndProfile(win, fixtureRepo, { aiEnabled: false })

    await win.getByTestId('nav-commit').click()

    // The secret surfaces as a Safety Engine blocker — no review panel, no AI needed.
    const secretBlocker = win
      .getByTestId('commit-blocker')
      .filter({ hasText: 'secret-like content' })
    await expect(secretBlocker).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('change-review-panel')).toHaveCount(0)
    // AI is off → the commit-message AI affordance is not offered.
    await expect(win.getByTestId('ai-commit-draft-toggle')).toHaveCount(0)

    // Typing a commit message must NOT clear the deterministic secret blocker.
    await win.getByTestId('commit-message').fill('feat: add secrets')
    await expect(secretBlocker).toBeVisible()
    await expect(win.getByTestId('commit-btn')).toBeDisabled()
  })

  test('Commit tab AI is limited to the commit message even with AI enabled', async () => {
    await setupRepoAndProfile(win, fixtureRepo, { stageSecret: true, aiEnabled: true })

    await win.getByTestId('nav-commit').click()

    // The deterministic secret still blocks via the Safety Engine.
    await expect(
      win.getByTestId('commit-blocker').filter({ hasText: 'secret-like content' })
    ).toBeVisible({ timeout: 10000 })

    // No repo-review / summarize / review-panel affordances remain on the Commit tab.
    await expect(win.getByTestId('change-review-panel')).toHaveCount(0)
    await expect(win.getByTestId('change-review-ai-btn')).toHaveCount(0)
    await expect(win.getByTestId('ai-summarize-btn')).toHaveCount(0)

    // The only AI affordance is drafting the commit message, attached to the field.
    await expect(win.getByTestId('ai-commit-draft-toggle')).toBeVisible()
    await win.getByTestId('ai-commit-draft-toggle').click()
    await expect(win.getByTestId('ai-commit-assistant')).toBeVisible()
    await expect(win.getByTestId('ai-draft-message-btn')).toBeVisible()
  })

  test('non-secret review advisories stay collapsed and do not block commit', async () => {
    execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })
    fs.mkdirSync(path.join(fixtureRepo, 'src'), { recursive: true })
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(fixtureRepo, `src/feature${i}.ts`),
        `export const value${i} = ${i}\n`
      )
      execSync(`git add src/feature${i}.ts`, { cwd: fixtureRepo, stdio: 'pipe' })
    }
    fs.writeFileSync(path.join(fixtureRepo, 'readme.txt'), 'shrunk\n')
    execSync('git add readme.txt', { cwd: fixtureRepo, stdio: 'pipe' })

    await setupRepoAndProfile(win, fixtureRepo, { aiEnabled: false })

    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('commit-staged-summary')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('commit-message').fill('feat: bulk changes')

    await expect(win.getByTestId('commit-review-advisories')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('commit-review-advisory')).not.toHaveCount(0)
    await expect(win.getByTestId('commit-warning')).toHaveCount(0)
    await expect(win.getByTestId('commit-btn')).toBeEnabled()
  })
})
