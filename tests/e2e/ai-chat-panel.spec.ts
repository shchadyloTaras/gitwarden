import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-ai-chat-empty.gitconfig')

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
    const aiRes = await api.ai.listConnections()
    if (aiRes.ok) {
      for (const c of aiRes.data.connections) await api.ai.deleteConnection(c.id)
    }
    await api.settings.update({ activeProfileId: undefined, aiEnabled: false })
  })
}

let fixtureRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')
  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-chat-repo-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

async function createRepo(win: Page): Promise<void> {
  await win.evaluate(async (repoPath: string) => {
    const api = (window as Window & typeof globalThis).api
    await api.repositories.create({
      name: 'ai-chat-fixture',
      localPath: repoPath,
      isFavorite: false,
    })
  }, fixtureRepo)
  await win.reload()
  await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
}

test.describe('AI Chat panel', () => {
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

  test('right panel switches between Context and AI Chat tabs', async () => {
    await createRepo(win)
    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-panel')).toBeVisible()

    await win.getByTestId('right-panel-tab-context').click()
    await expect(win.getByTestId('inspector-panel')).toBeVisible()

    await win.getByTestId('right-panel-tab-chat').click()
    await expect(win.getByTestId('ai-chat-panel')).toBeVisible()
  })

  test('inline setup saves a key and goes straight to chat (auto-enabled)', async () => {
    await createRepo(win)
    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-setup')).toBeVisible()

    await win.getByTestId('ai-chat-key-input').fill('sk-ant-fake')
    await expect(win.getByTestId('ai-chat-detected')).toContainText('Anthropic')
    await win.getByTestId('ai-chat-save-connection').click()

    // No separate enable step — saving the key drops us straight into the chat.
    await expect(win.getByTestId('ai-chat-input')).toBeVisible({ timeout: 10000 })
    const enabled = await win.evaluate(async () => {
      const s = await (window as Window & typeof globalThis).api.settings.get()
      return s.ok ? (s.data.aiEnabled ?? false) : null
    })
    expect(enabled).toBe(true)
  })

  test('runs /commit and renders the draft directly (no preview gate)', async () => {
    await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const created = await api.ai.createConnection({ name: 'Fake', kind: 'openrouter' })
      if (!created.ok) throw new Error('connection create failed')
      await api.ai.saveCredential(created.data.id, 'Fake key', { apiKey: 'sk-or-fake' })
      await api.ai.setActiveConnection(created.data.id)
      await api.settings.update({ aiEnabled: true })
    })
    await createRepo(win)

    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-input')).toBeVisible({ timeout: 10000 })

    const input = win.getByTestId('ai-chat-input')
    await input.fill('/commit')
    await win.getByTestId('ai-chat-send').click()

    const messages = win.getByTestId('ai-chat-message')
    await expect(messages.last()).toContainText('feat(ai): add fake structured output', {
      timeout: 10000,
    })
  })

  test('each networked slash-command renders a result bubble with fake AI', async () => {
    await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const created = await api.ai.createConnection({ name: 'Fake', kind: 'openrouter' })
      if (!created.ok) throw new Error('connection create failed')
      await api.ai.saveCredential(created.data.id, 'Fake key', { apiKey: 'sk-or-fake' })
      await api.ai.setActiveConnection(created.data.id)
      await api.settings.update({ aiEnabled: true })
    })
    await createRepo(win)

    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-input')).toBeVisible({ timeout: 10000 })

    const input = win.getByTestId('ai-chat-input')
    const messages = win.getByTestId('ai-chat-message')

    const cases: Array<{ command: string; expectText: string }> = [
      { command: '/review', expectText: 'Fake AI advisory finding' },
      { command: '/push-brief', expectText: 'Fake push brief' },
      { command: '/history', expectText: 'Fake release' },
      { command: '/repo-brief', expectText: 'Fake repo onboarding brief' },
      { command: '/propose add a note file', expectText: 'Fake agentic proposal' },
    ]

    for (const { command, expectText } of cases) {
      await input.fill(command)
      await win.getByTestId('ai-chat-send').click()
      await expect(messages.last()).toContainText(expectText, { timeout: 10000 })
      if (command === '/review') {
        await expect(win.getByTestId('ai-chat-review-card')).toBeVisible()
      }
      await expect(messages.last()).not.toContainText(
        'explicit expensive-send warning acknowledgement'
      )
    }
  })

  test('chat shows setup when no connection exists', async () => {
    await createRepo(win)
    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-setup')).toBeVisible()
    await expect(win.getByTestId('ai-chat-input')).toHaveCount(0)
  })
})
