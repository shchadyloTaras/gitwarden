import { create } from 'zustand'
import type {
  AiConnection,
  AiConnectionKind,
  AiCredentialMetadata,
  AiPrivacyMode,
  AiProviderDetection,
  AiRetentionState,
} from '../../core/ai/types'

// Renderer store for the single-active AI connection (Phase 29). It never holds
// a raw secret: saving a credential returns only AiCredentialMetadata, and that
// (masked) metadata is all this store ever keeps.
//
// These boundary DTOs mirror the preload bridge (structurally identical → the
// window.api.ai methods accept them) without importing across the main/renderer line.
interface AiConnectionCreateInput {
  name: string
  kind: AiConnectionKind
  baseUrl?: string
  defaultModel?: string
  privacyMode?: AiPrivacyMode
  retention?: AiRetentionState
  enabled?: boolean
}

type AiConnectionPatch = Partial<{
  name: string
  kind: AiConnectionKind
  baseUrl: string
  defaultModel: string
  privacyMode: AiPrivacyMode
  retention: AiRetentionState
  enabled: boolean
}>

interface AiProviderDetectionResult {
  detection: AiProviderDetection
  maskedKeyLabel: string
}

interface AiState {
  connections: AiConnection[]
  activeConnectionId: string | undefined
  /** Masked metadata for the active connection's credential, if any. */
  credentialMeta: AiCredentialMetadata | null
  /** Global "Enable AI" consent (mirrors settings.aiEnabled). */
  aiEnabled: boolean
  loading: boolean
  error: string | null

  load(): Promise<void>
  detect(apiKey: string): Promise<AiProviderDetectionResult | null>
  createConnection(input: AiConnectionCreateInput): Promise<AiConnection | null>
  updateConnection(id: string, patch: AiConnectionPatch): Promise<void>
  deleteConnection(id: string): Promise<void>
  setActive(id: string | null): Promise<void>
  saveCredential(
    connectionId: string,
    label: string,
    secrets: Record<string, string>
  ): Promise<void>
  deleteCredential(connectionId: string): Promise<void>
  setAiEnabled(enabled: boolean): Promise<void>
}

function activeOf(connections: AiConnection[], activeId: string | undefined): AiConnection | null {
  return connections.find((c) => c.id === activeId) ?? null
}

export const useAiStore = create<AiState>((set, get) => ({
  connections: [],
  activeConnectionId: undefined,
  credentialMeta: null,
  aiEnabled: false,
  loading: false,
  error: null,

  async load() {
    if (!window.api) return
    set({ loading: true, error: null })
    try {
      const [list, settings] = await Promise.all([
        window.api.ai.listConnections(),
        window.api.settings.get(),
      ])
      const connections = list.ok ? list.data.connections : []
      const activeConnectionId = list.ok ? list.data.activeConnectionId : undefined
      const aiEnabled = settings.ok ? (settings.data.aiEnabled ?? false) : false

      let credentialMeta: AiCredentialMetadata | null = null
      const active = activeOf(connections, activeConnectionId)
      if (active) {
        const meta = await window.api.ai.getCredentialMetadata(active.id)
        credentialMeta = meta.ok ? meta.data : null
      }

      set({
        connections,
        activeConnectionId,
        aiEnabled,
        credentialMeta,
        loading: false,
        error: list.ok ? null : list.error,
      })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  async detect(apiKey) {
    const result = await window.api.ai.detectProvider(apiKey)
    return result.ok ? result.data : null
  },

  async createConnection(input) {
    const result = await window.api.ai.createConnection(input)
    if (!result.ok) {
      set({ error: result.error })
      return null
    }
    await get().load()
    return result.data
  },

  async updateConnection(id, patch) {
    const result = await window.api.ai.updateConnection(id, patch)
    if (!result.ok) {
      set({ error: result.error })
      throw new Error(result.error)
    }
    await get().load()
  },

  async deleteConnection(id) {
    const result = await window.api.ai.deleteConnection(id)
    if (!result.ok) {
      set({ error: result.error })
      throw new Error(result.error)
    }
    await get().load()
  },

  async setActive(id) {
    const result = await window.api.ai.setActiveConnection(id)
    if (!result.ok) {
      set({ error: result.error })
      throw new Error(result.error)
    }
    await get().load()
  },

  async saveCredential(connectionId, label, secrets) {
    const result = await window.api.ai.saveCredential(connectionId, label, secrets)
    if (!result.ok) {
      set({ error: result.error })
      throw new Error(result.error)
    }
    // Keep only the masked metadata the main process returned — never the secret.
    set({ credentialMeta: result.data })
  },

  async deleteCredential(connectionId) {
    const result = await window.api.ai.deleteCredential(connectionId)
    if (!result.ok) {
      set({ error: result.error })
      throw new Error(result.error)
    }
    set({ credentialMeta: null })
  },

  async setAiEnabled(enabled) {
    const result = await window.api.settings.update({ aiEnabled: enabled })
    if (!result.ok) {
      set({ error: result.error })
      throw new Error(result.error)
    }
    set({ aiEnabled: result.data.aiEnabled ?? false })
  },
}))
