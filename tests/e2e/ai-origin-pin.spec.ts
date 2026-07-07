import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// AI actions are pinned to their origin (Phase 94 — acceptance criterion #5):
// Apply/Insert refuse when the active repo differs from the repo a proposal or
// commit-draft was generated for. Drives the real chat store + the fake AI adapter
// (GITWARDEN_E2E_FAKE_AI=1) against two real fixture repos — no network.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-ai-origin-pin-empty.gitconfig')

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

function initRepo(dir: string): void {
  execSync('git init -b main', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: dir, stdio: 'pipe' })
  fs.writeFileSync(path.join(dir, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: dir, stdio: 'pipe' })
  execSync('git commit -m init', { cwd: dir, stdio: 'pipe' })
}

let repoA: string
let repoB: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')
  repoA = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-origin-pin-a-'))
  repoB = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-origin-pin-b-'))
  initRepo(repoA)
  initRepo(repoB)
})

test.afterAll(() => {
  fs.rmSync(repoA, { recursive: true, force: true })
  fs.rmSync(repoB, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('AI origin pinning', () => {
  let app: ElectronApplication
  let win: Page
  let repoAId: string
  let repoBId: string

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const created = await api.ai.createConnection({ name: 'Fake', kind: 'openrouter' })
      if (!created.ok) throw new Error('connection create failed')
      await api.ai.saveCredential(created.data.id, 'Fake key', { apiKey: 'sk-or-fake' })
      await api.ai.setActiveConnection(created.data.id)
      await api.settings.update({ aiEnabled: true })
    })

    const ids = await win.evaluate(
      async ([pathA, pathB]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        const a = await api.repositories.create({
          name: 'repo-a',
          localPath: pathA,
          isFavorite: false,
        })
        const b = await api.repositories.create({
          name: 'repo-b',
          localPath: pathB,
          isFavorite: false,
        })
        if (!a.ok || !b.ok) throw new Error('repo create failed')
        return { a: a.data.id, b: b.data.id }
      },
      [repoA, repoB]
    )
    repoAId = ids.a
    repoBId = ids.b

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await app.close()
  })

  async function switchActiveRepo(repoId: string): Promise<void> {
    await win.getByTestId('header-repo-select').click()
    await win.getByTestId(`header-repo-select-option-${repoId}`).click()
  }

  test("applyProposal refuses when the active repo has moved on from the proposal's origin", async () => {
    await switchActiveRepo(repoAId)
    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-input')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('ai-chat-input').fill('/propose add a readme note')
    await win.getByTestId('ai-chat-send').click()

    const applyBtn = win.getByTestId('ai-chat-proposal-apply')
    await expect(applyBtn).toBeVisible({ timeout: 10000 })

    // The user switches to a DIFFERENT repo before clicking Apply.
    await switchActiveRepo(repoBId)

    await applyBtn.click()

    const messages = win.getByTestId('ai-chat-message')
    await expect(messages.last()).toContainText('written for a different repository', {
      timeout: 10000,
    })
    // Refused — the fake proposal's file never lands anywhere.
    expect(fs.existsSync(path.join(repoA, 'agentic-note.txt'))).toBe(false)
    expect(fs.existsSync(path.join(repoB, 'agentic-note.txt'))).toBe(false)
  })

  test('applyProposal succeeds when the active repo still matches the origin', async () => {
    await switchActiveRepo(repoAId)
    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-input')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('ai-chat-input').fill('/propose add a readme note')
    await win.getByTestId('ai-chat-send').click()

    const applyBtn = win.getByTestId('ai-chat-proposal-apply')
    await expect(applyBtn).toBeVisible({ timeout: 10000 })
    await applyBtn.click()

    await expect(win.getByTestId('ai-chat-proposal-apply')).toHaveText('Edits applied', {
      timeout: 10000,
    })
    expect(fs.existsSync(path.join(repoA, 'agentic-note.txt'))).toBe(true)
  })

  test("CommitDraftCard's Insert is disabled when the active repo has moved on from the draft's origin", async () => {
    await switchActiveRepo(repoAId)
    await win.getByTestId('header-ai-chat').click()
    await expect(win.getByTestId('ai-chat-input')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('ai-chat-input').fill('/commit')
    await win.getByTestId('ai-chat-send').click()
    await expect(win.getByTestId('ai-chat-commit-card')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('ai-chat-commit-insert')).toBeEnabled()

    await switchActiveRepo(repoBId)

    await expect(win.getByTestId('ai-chat-commit-insert')).toBeDisabled()
    await expect(win.getByTestId('ai-chat-commit-insert-wrong-repo')).toBeVisible()

    // Switching back to the origin repo re-enables it — the pin tracks the
    // ACTIVE repo live, it isn't a one-time snapshot taken at click time.
    await switchActiveRepo(repoAId)
    await expect(win.getByTestId('ai-chat-commit-insert')).toBeEnabled()
  })
})
