// Test-only fakes for the AI Connections feature — wired in ONLY when the env
// flag `GITWARDEN_E2E_FAKE_AI=1` is set (see electron/index.ts). Production never
// constructs these. They let the Phase 29 Playwright e2e exercise the credential
// IPC without depending on Electron safeStorage (unavailable in headless CI),
// while still proving the key invariant: the raw secret NEVER crosses back to the
// renderer — only AiCredentialMetadata does.

import type { AiCredentialMetadata } from '../../core/ai/types.js'
import { maskSecret } from '../../core/ai/credentials.js'
import type { AiCredentialInput, IAiCredentialStore } from '../storage/AiCredentialStore.js'

const PRIMARY_FIELD = 'apiKey'

interface FakeRecord {
  label: string
  /** fieldName → RAW secret, held in-memory only (never serialized, never sent to renderer). */
  secrets: Record<string, string>
  maskedPreview: string
  secretFields: string[]
  updatedAt: string
}

/** In-memory credential store — same contract as AiCredentialStore, no safeStorage. */
class FakeAiCredentialStore implements IAiCredentialStore {
  private readonly records = new Map<string, FakeRecord>()

  async save(input: AiCredentialInput): Promise<AiCredentialMetadata> {
    const entries = Object.entries(input.secrets)
    if (entries.length === 0) throw new Error('At least one secret field is required')

    const primary = input.secrets[PRIMARY_FIELD] ?? entries[0][1]
    const updatedAt = new Date().toISOString()
    const secretFields = entries.map(([field]) => field)

    this.records.set(input.connectionId, {
      label: input.label,
      secrets: { ...input.secrets },
      maskedPreview: maskSecret(primary),
      secretFields,
      updatedAt,
    })

    return {
      connectionId: input.connectionId,
      label: input.label,
      maskedPreview: maskSecret(primary),
      secretFields,
      updatedAt,
    }
  }

  async getMetadata(connectionId: string): Promise<AiCredentialMetadata | undefined> {
    const record = this.records.get(connectionId)
    if (!record) return undefined
    return {
      connectionId,
      label: record.label,
      maskedPreview: record.maskedPreview,
      secretFields: record.secretFields,
      updatedAt: record.updatedAt,
    }
  }

  async getSecret(connectionId: string, field: string): Promise<string | undefined> {
    return this.records.get(connectionId)?.secrets[field]
  }

  async delete(connectionId: string): Promise<void> {
    this.records.delete(connectionId)
  }
}

export function createAiTestCredentialStore(): IAiCredentialStore {
  return new FakeAiCredentialStore()
}
