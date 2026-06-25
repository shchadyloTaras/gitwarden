import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-ai-36-39-empty.gitconfig')

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
    await api.settings.update({ aiEnabled: false })
  })
}

async function seedAiConnection(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const created = await api.ai.createConnection({
      name: 'Fake OpenRouter',
      kind: 'openrouter',
      defaultModel: 'openrouter/fake',
    })
    if (!created.ok) throw new Error(created.error)
    await api.ai.saveCredential(created.data.id, 'Fake key', { apiKey: 'sk-or-fake-key-for-e2e' })
    await api.ai.setActiveConnection(created.data.id)
    await api.settings.update({ aiEnabled: true })
  })
}

let fixtureRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')
  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-36-39-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(
    path.join(fixtureRepo, 'package.json'),
    JSON.stringify({ name: 'demo', scripts: { build: 'vite build', test: 'vitest run' } })
  )
  fs.writeFileSync(path.join(fixtureRepo, 'README.md'), '# Demo\n')
  execSync('git add .', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "init"', { cwd: fixtureRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('AI connection templates', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)
    await seedAiConnection(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('export template → import → credential → test with fake adapter', async () => {
    const exportedJson = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const list = await api.ai.listConnections()
      const id = list.ok ? list.data.connections[0]?.id : undefined
      if (!id) throw new Error('no connection')
      const template = await api.ai.exportConnectionTemplate(id)
      if (!template.ok) throw new Error(template.error)
      const imported = await api.ai.importConnectionTemplate(template.data)
      if (!imported.ok) throw new Error(imported.error)
      await api.ai.saveCredential(imported.data.id, 'Imported key', { apiKey: 'sk-or-imported' })
      const test = await api.ai.testConnection(imported.data.id)
      if (!test.ok) throw new Error(test.error)
      return { exported: JSON.stringify(template.data), ok: test.data.ok }
    })

    expect(exportedJson.exported).not.toContain('sk-or-fake')
    expect(exportedJson.ok).toBe(true)
  })
})
