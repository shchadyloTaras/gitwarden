import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'

// Phase 29 — AI Connections Manager & Credential Store.
//
// Drives the token-first Settings → AI flow against the injected fake credential
// store (GITWARDEN_E2E_FAKE_AI=1, in-memory — no Electron safeStorage needed):
//   create → save credential → edit → disable → delete
// and asserts the two hard invariants:
//   * enabling AI is a SEPARATE action from saving (saving leaves AI disabled);
//   * the renderer can never read a raw credential back after save.

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GITWARDEN_E2E_FAKE_AI: '1' },
  })
}

async function cleanupAi(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const list = await api.ai.listConnections()
    if (list.ok) {
      for (const c of list.data.connections) await api.ai.deleteConnection(c.id)
    }
    await api.settings.update({ aiEnabled: false })
  })
}

test.describe('AI Connections (injected fake credential store)', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAi(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.getByTestId('nav-settings').click()
    await expect(win.getByTestId('screen-settings')).toBeVisible()
    await expect(win.getByTestId('ai-section')).toBeVisible()
  })

  test.afterEach(async () => {
    await cleanupAi(win)
    await app.close()
  })

  test('create → save credential → edit → disable → delete', async () => {
    // ── create + save credential ──────────────────────────────────────────────
    // Paste an OpenRouter key; detection identifies the provider with no extra field.
    await win.getByTestId('ai-key-input').fill('sk-or-v1-e2e000000000000000000000000')
    await expect(win.getByTestId('ai-detected')).toContainText('OpenRouter')
    // High-confidence remote provider → no base URL field shown.
    await expect(win.getByTestId('ai-baseurl-input')).toHaveCount(0)

    await win.getByTestId('ai-name-input').fill('OpenRouter')
    await win.getByTestId('ai-model-input').fill('anthropic/claude-3.5-sonnet')
    await win.getByTestId('ai-save-connection').click()

    // The active-connection card appears with a MASKED credential (never the key).
    await expect(win.getByTestId('ai-connection-card')).toBeVisible()
    const masked = win.getByTestId('ai-cred-masked')
    await expect(masked).toBeVisible()
    await expect(masked).not.toContainText('sk-or-v1-e2e')

    // Enabling AI is a SEPARATE step — saving left it disabled, so nothing sends.
    await expect(win.getByTestId('ai-enable-state')).toHaveText('AI disabled')
    const enabledAfterSave = await win.evaluate(async () => {
      const s = await (window as Window & typeof globalThis).api.settings.get()
      return s.ok ? (s.data.aiEnabled ?? false) : null
    })
    expect(enabledAfterSave).toBe(false)

    // ── edit ──────────────────────────────────────────────────────────────────
    await win.getByTestId('ai-edit-name-input').fill('My Router')
    await win.getByTestId('ai-save-changes').click()
    await expect(win.getByTestId('ai-saved-msg')).toBeVisible()
    const renamed = await win.evaluate(async () => {
      const list = await (window as Window & typeof globalThis).api.ai.listConnections()
      return list.ok ? list.data.connections[0]?.name : null
    })
    expect(renamed).toBe('My Router')

    // ── disable (the connection — distinct from deleting it) ───────────────────
    await expect(win.getByTestId('ai-conn-state')).toHaveText('Connection on')
    await win.getByTestId('ai-conn-toggle').click()
    await expect(win.getByTestId('ai-conn-state')).toHaveText('Connection off')

    // ── delete ─────────────────────────────────────────────────────────────────
    await win.getByTestId('ai-delete-connection').click()
    await win.getByTestId('ai-delete-confirm').click()
    // Back to the empty setup form; the connection (and its credential) are gone.
    await expect(win.getByTestId('ai-setup-form')).toBeVisible()
    const remaining = await win.evaluate(async () => {
      const list = await (window as Window & typeof globalThis).api.ai.listConnections()
      return list.ok ? list.data.connections.length : -1
    })
    expect(remaining).toBe(0)
  })

  test('enabling AI is a separate, deliberate action from saving a connection', async () => {
    await win.getByTestId('ai-key-input').fill('sk-ant-api03-e2e0000000000000000')
    await expect(win.getByTestId('ai-detected')).toContainText('Anthropic')
    await win.getByTestId('ai-name-input').fill('Anthropic')
    await win.getByTestId('ai-save-connection').click()
    await expect(win.getByTestId('ai-connection-card')).toBeVisible()

    // AI still off after save.
    await expect(win.getByTestId('ai-enable-state')).toHaveText('AI disabled')

    // The toggle is the only thing that flips global consent.
    await win.getByTestId('ai-enable-toggle').click()
    await expect(win.getByTestId('ai-enable-state')).toHaveText('AI enabled')
    const persisted = await win.evaluate(async () => {
      const s = await (window as Window & typeof globalThis).api.settings.get()
      return s.ok ? (s.data.aiEnabled ?? false) : null
    })
    expect(persisted).toBe(true)
  })

  test('ambiguous sk- key prompts for one base URL field; LM Studio pre-fills the local port', async () => {
    // Ambiguous bare sk- → one base URL field, OpenAI default.
    await win.getByTestId('ai-key-input').fill('sk-0123456789abcdefghijklmno')
    await expect(win.getByTestId('ai-detected')).toContainText('OpenAI-compatible')
    await expect(win.getByTestId('ai-baseurl-input')).toBeVisible()
    await expect(win.getByTestId('ai-baseurl-input')).toHaveValue('https://api.openai.com/v1')

    // LM Studio → base URL field pre-filled with the loopback port.
    await win.getByTestId('ai-key-input').fill('sk-lm-localmodelkey000000')
    await expect(win.getByTestId('ai-baseurl-input')).toHaveValue('http://localhost:1234/v1')
  })

  test('renderer cannot read a raw credential after save', async () => {
    await win.getByTestId('ai-key-input').fill('sk-or-v1-secret0000000000000000000')
    await win.getByTestId('ai-name-input').fill('OpenRouter')
    await win.getByTestId('ai-save-connection').click()
    await expect(win.getByTestId('ai-connection-card')).toBeVisible()

    const probe = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const list = await api.ai.listConnections()
      const id = list.ok ? list.data.connections[0]?.id : undefined
      const meta = id ? await api.ai.getCredentialMetadata(id) : null

      return {
        // No method on the bridge returns a raw secret.
        bridgeKeys: Object.keys(api.ai),
        // Metadata is masked, and the connection JSON carries no secret.
        metaJson: JSON.stringify(meta),
        connJson: JSON.stringify(list.ok ? list.data.connections : []),
      }
    })

    expect(probe.bridgeKeys).not.toContain('getSecret')
    expect(probe.bridgeKeys).not.toContain('getCredential')
    expect(probe.metaJson).not.toContain('sk-or-v1-secret')
    expect(probe.connJson).not.toContain('sk-or-v1-secret')
  })
})
