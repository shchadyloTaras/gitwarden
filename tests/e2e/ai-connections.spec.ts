import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'

// Phase 29 / AI Settings simplification — AI Connections Manager & Credential Store.
//
// Drives the simplified token-first Settings → AI flow against the injected fake
// credential store (GITWARDEN_E2E_FAKE_AI=1, in-memory — no Electron safeStorage):
//   paste key → save → pick model → delete
// and asserts the invariants that still hold:
//   * saving a key turns AI on automatically (no separate consent toggle);
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

async function aiEnabledSetting(win: Page): Promise<boolean | null> {
  return win.evaluate(async () => {
    const s = await (window as Window & typeof globalThis).api.settings.get()
    return s.ok ? (s.data.aiEnabled ?? false) : null
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
    // AI connection setup lives under the "AI Assistant" Settings tab.
    await win.getByTestId('settings-tab-ai').click()
    await expect(win.getByTestId('ai-section')).toBeVisible()
  })

  test.afterEach(async () => {
    await cleanupAi(win)
    await app.close()
  })

  test('paste key → save (auto-enables) → pick model → delete', async () => {
    // ── paste + save ───────────────────────────────────────────────────────────
    // An OpenRouter key is detected with no extra field; "Save" is all it takes.
    await win.getByTestId('ai-key-input').fill('sk-or-v1-e2e000000000000000000000000')
    await expect(win.getByTestId('ai-detected')).toContainText('OpenRouter')
    await expect(win.getByTestId('ai-baseurl-input')).toHaveCount(0)
    await win.getByTestId('ai-save-connection').click()

    // The active-connection card appears with a MASKED credential (never the key).
    await expect(win.getByTestId('ai-connection-card')).toBeVisible()
    const masked = win.getByTestId('ai-cred-masked')
    await expect(masked).toBeVisible()
    await expect(masked).not.toContainText('sk-or-v1-e2e')

    // Saving the key turned AI on automatically — no separate consent step.
    expect(await aiEnabledSetting(win)).toBe(true)

    // ── pick a model from the provider's live list ──────────────────────────────
    await win.getByTestId('ai-model-select').click()
    await win.getByTestId('ai-model-select-option-openrouter/fake-fast').click()
    await win.getByTestId('ai-save-changes').click()
    await expect(win.getByTestId('ai-saved-msg')).toBeVisible()
    const savedModel = await win.evaluate(async () => {
      const list = await (window as Window & typeof globalThis).api.ai.listConnections()
      return list.ok ? list.data.connections[0]?.defaultModel : null
    })
    expect(savedModel).toBe('openrouter/fake-fast')

    // ── delete ───────────────────────────────────────────────────────────────────
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

  test('saving a connection enables AI automatically', async () => {
    expect(await aiEnabledSetting(win)).toBe(false)

    await win.getByTestId('ai-key-input').fill('sk-ant-api03-e2e0000000000000000')
    await expect(win.getByTestId('ai-detected')).toContainText('Anthropic')
    await win.getByTestId('ai-save-connection').click()
    await expect(win.getByTestId('ai-connection-card')).toBeVisible()

    expect(await aiEnabledSetting(win)).toBe(true)
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

  test('models auto-load from the fake adapter after the key is saved', async () => {
    await win.getByTestId('ai-key-input').fill('sk-or-v1-e2e-models0000000000000')
    await win.getByTestId('ai-save-connection').click()
    await expect(win.getByTestId('ai-connection-card')).toBeVisible()

    // No manual "Fetch models" step — saving the key auto-loads the list.
    await expect(win.getByTestId('ai-model-status')).toContainText('models available')
    await expect(win.getByTestId('ai-model-select')).toBeVisible()

    const modelIds = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const list = await api.ai.listConnections()
      const id = list.ok ? list.data.connections[0]?.id : undefined
      if (!id) return []
      const models = await api.ai.listModels(id)
      return models.ok ? models.data.map((m) => m.id) : []
    })
    expect(modelIds).toContain('openrouter/fake-recommended')
  })

  test('Change key reloads the model list; the retired controls are gone', async () => {
    // Save an initial OpenRouter key; the model list auto-loads.
    await win.getByTestId('ai-key-input').fill('sk-or-v1-e2e-firstkey0000000aaaa')
    await win.getByTestId('ai-save-connection').click()
    await expect(win.getByTestId('ai-connection-card')).toBeVisible()
    await expect(win.getByTestId('ai-model-status')).toContainText('models available')

    const masked = win.getByTestId('ai-cred-masked')
    await expect(masked).toContainText('aaaa') // masked preview reveals the last 4 chars

    // The simplified card no longer offers a manual fetch or a remove-credential action.
    await expect(win.getByTestId('ai-fetch-models')).toHaveCount(0)
    await expect(win.getByTestId('ai-cred-delete')).toHaveCount(0)

    // Change the key — the model list must refresh on its own, with no Fetch step.
    await win.getByTestId('ai-cred-change').click()
    await win.getByTestId('ai-cred-key-input').fill('sk-or-v1-e2e-secondkey000000bbbb')
    await win.getByTestId('ai-cred-save').click()

    // Masked preview reflects the new key, and the model list reloaded automatically.
    await expect(masked).toContainText('bbbb')
    await expect(masked).not.toContainText('aaaa')
    await expect(win.getByTestId('ai-model-status')).toContainText('models available')
    await expect(win.getByTestId('ai-model-select')).toBeVisible()
  })
})
