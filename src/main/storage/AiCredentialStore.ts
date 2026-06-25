import { z } from 'zod'
import type { AiCredentialMetadata } from '../../core/ai/types.js'
import { maskSecret } from '../../core/ai/credentials.js'
import type { JsonStore } from './JsonStore.js'
import type { SecretStore } from './SecretStore.js'
import { createLogger, type Logger } from '../services/Logger.js'

// Encrypted store for AI Connection secrets (API keys + Custom HTTP header
// secrets), keyed by connectionId. Mirrors TokenStore: only base64 ciphertext is
// persisted (via Electron safeStorage), and the raw secret NEVER leaves the main
// process after save. The renderer only ever receives AiCredentialMetadata
// (label + masked preview + which fields are stored) — never the secret itself.

/** One stored credential bundle for a connection. Values are base64 ciphertext. */
const AiStoredCredentialSchema = z.object({
  label: z.string(),
  /** fieldName → base64(safeStorage ciphertext). */
  fields: z.record(z.string()),
  /** Masked preview of the primary secret (never the raw value). */
  maskedPreview: z.string(),
  secretFields: z.array(z.string()),
  updatedAt: z.string(),
})

export const AiCredentialStoreDataSchema = z.object({
  credentials: z.record(AiStoredCredentialSchema),
})

export type AiCredentialStoreData = z.infer<typeof AiCredentialStoreDataSchema>

export const AI_CREDENTIAL_STORE_DEFAULTS: AiCredentialStoreData = { credentials: {} }

/** Raw secret material crossing INTO main on save — never persisted in the clear. */
export interface AiCredentialInput {
  connectionId: string
  label: string
  /** fieldName → raw secret (e.g. `{ apiKey: 'sk-...' }` or `{ Authorization: '...' }`). */
  secrets: Record<string, string>
}

export interface IAiCredentialStore {
  /** Encrypt + persist the secrets; returns only renderer-safe metadata. */
  save(input: AiCredentialInput): Promise<AiCredentialMetadata>
  /** Renderer-facing metadata for display; never the raw secret. */
  getMetadata(connectionId: string): Promise<AiCredentialMetadata | undefined>
  /** MAIN-ONLY decrypt of one stored field — used by adapters (Phase 30). Never over IPC. */
  getSecret(connectionId: string, field: string): Promise<string | undefined>
  /** Remove all secrets for a connection. */
  delete(connectionId: string): Promise<void>
}

/** The field name treated as "primary" for the masked preview when present. */
const PRIMARY_FIELD = 'apiKey'

export class AiCredentialStore implements IAiCredentialStore {
  constructor(
    private readonly store: JsonStore<AiCredentialStoreData>,
    private readonly secrets: SecretStore,
    private readonly logger: Logger = createLogger('AiCredentialStore'),
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async save(input: AiCredentialInput): Promise<AiCredentialMetadata> {
    const entries = Object.entries(input.secrets)
    if (entries.length === 0) throw new Error('At least one secret field is required')
    for (const [field, value] of entries) {
      if (value.length === 0) throw new Error(`Secret field "${field}" must not be empty`)
    }

    const data = await this.readData()
    const fields: Record<string, string> = {}
    for (const [field, value] of entries) {
      fields[field] = this.secrets.encrypt(value).toString('base64')
    }

    const secretFields = entries.map(([field]) => field)
    const primary = input.secrets[PRIMARY_FIELD] ?? entries[0][1]
    const updatedAt = this.now()

    data.credentials[input.connectionId] = {
      label: input.label,
      fields,
      maskedPreview: maskSecret(primary),
      secretFields,
      updatedAt,
    }
    await this.store.write(data)
    this.logger.debug('Saved AI credential', {
      connectionId: input.connectionId,
      secretFields,
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
    const record = (await this.readData()).credentials[connectionId]
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
    const record = (await this.readData()).credentials[connectionId]
    const encoded = record?.fields[field]
    if (!encoded) return undefined

    try {
      const cipherText = decodeCipherText(encoded)
      if (!cipherText) throw new Error('Stored ciphertext is not valid base64')
      return this.secrets.decrypt(cipherText)
    } catch (error) {
      this.logger.warn('Ignoring unreadable AI credential', {
        connectionId,
        field,
        error: errorMessage(error),
      })
      return undefined
    }
  }

  async delete(connectionId: string): Promise<void> {
    const data = await this.readData()
    if (!(connectionId in data.credentials)) return
    delete data.credentials[connectionId]
    await this.store.write(data)
    this.logger.debug('Deleted AI credential', { connectionId })
  }

  private async readData(): Promise<AiCredentialStoreData> {
    try {
      return AiCredentialStoreDataSchema.parse(await this.store.read())
    } catch (error) {
      this.logger.warn('Ignoring unreadable AI credential store', {
        error: errorMessage(error),
      })
      return structuredClone(AI_CREDENTIAL_STORE_DEFAULTS)
    }
  }
}

function decodeCipherText(encoded: string): Buffer | undefined {
  const normalized = encoded.trim()
  if (!normalized || normalized.length % 4 !== 0) return undefined
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return undefined
  return Buffer.from(normalized, 'base64')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
