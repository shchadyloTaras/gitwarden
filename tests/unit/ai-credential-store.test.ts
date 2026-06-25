import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonStore } from '../../src/main/storage/JsonStore.js'
import type { SafeStorageLike } from '../../src/main/storage/SecretStore.js'
import { SecretStore } from '../../src/main/storage/SecretStore.js'
import {
  AI_CREDENTIAL_STORE_DEFAULTS,
  AiCredentialStore,
  AiCredentialStoreDataSchema,
  type AiCredentialStoreData,
} from '../../src/main/storage/AiCredentialStore.js'
import { ConsoleLogger, type Logger } from '../../src/main/services/Logger.js'

// Reversible fake encryptor (same shape as token-store.test.ts) so the round-trip
// is exercised without Electron safeStorage.
class FakeSafeStorage implements SafeStorageLike {
  isEncryptionAvailable(): boolean {
    return true
  }

  encryptString(plainText: string): Buffer {
    const reversedHex = Buffer.from([...plainText].reverse().join(''), 'utf8').toString('hex')
    return Buffer.from(`fake:${reversedHex}`, 'utf8')
  }

  decryptString(encrypted: Buffer): string {
    const raw = encrypted.toString('utf8')
    if (!raw.startsWith('fake:')) throw new Error('cannot decrypt ciphertext')
    const hex = raw.slice('fake:'.length)
    if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('cannot decrypt ciphertext')
    return [...Buffer.from(hex, 'hex').toString('utf8')].reverse().join('')
  }
}

let tmpDir: string
let storePath: string
let secrets: SecretStore
const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gitwarden-ai-cred-'))
  storePath = path.join(tmpDir, 'ai-credentials.json')
  secrets = new SecretStore(new FakeSafeStorage())
})

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true })
})

function createJsonStore(): JsonStore<AiCredentialStoreData> {
  return new JsonStore(storePath, AiCredentialStoreDataSchema, AI_CREDENTIAL_STORE_DEFAULTS)
}

function createStore(logger?: Logger): AiCredentialStore {
  return new AiCredentialStore(createJsonStore(), secrets, logger ?? silentLogger)
}

describe('AiCredentialStore', () => {
  it('round-trips a secret through encrypted storage and never persists it in the clear', async () => {
    const store = createStore()
    const apiKey = `sk-or-v1-${'a'.repeat(40)}`

    const meta = await store.save({
      connectionId: 'ai-1',
      label: 'OpenRouter key',
      secrets: { apiKey },
    })

    // Returned metadata is masked — never the raw secret.
    expect(meta.maskedPreview).not.toContain(apiKey)
    expect(meta.secretFields).toEqual(['apiKey'])
    expect(meta.connectionId).toBe('ai-1')

    // The decrypted secret matches (main-only path used by adapters in Phase 30).
    await expect(store.getSecret('ai-1', 'apiKey')).resolves.toBe(apiKey)

    // The persisted JSON contains ciphertext, NOT the raw key.
    const fileContents = await fsPromises.readFile(storePath, 'utf8')
    expect(fileContents).not.toContain(apiKey)
  })

  it('getMetadata returns only renderer-safe metadata (no fields/secret)', async () => {
    const store = createStore()
    await store.save({ connectionId: 'ai-1', label: 'Key', secrets: { apiKey: 'sk-secret-value' } })

    const meta = await store.getMetadata('ai-1')
    expect(meta).toBeDefined()
    expect(Object.keys(meta ?? {}).sort()).toEqual(
      ['connectionId', 'label', 'maskedPreview', 'secretFields', 'updatedAt'].sort()
    )
    // The raw value is not anywhere in the metadata object.
    expect(JSON.stringify(meta)).not.toContain('sk-secret-value')
  })

  it('stores multiple secret fields (e.g. custom HTTP header secret)', async () => {
    const store = createStore()
    const meta = await store.save({
      connectionId: 'ai-custom',
      label: 'Custom HTTP',
      secrets: { apiKey: 'sk-primary', Authorization: 'Bearer header-secret' },
    })

    expect(meta.secretFields.sort()).toEqual(['Authorization', 'apiKey'])
    await expect(store.getSecret('ai-custom', 'Authorization')).resolves.toBe(
      'Bearer header-secret'
    )
    const fileContents = await fsPromises.readFile(storePath, 'utf8')
    expect(fileContents).not.toContain('header-secret')
    expect(fileContents).not.toContain('sk-primary')
  })

  it('survives a new store instance with the same persisted data (relaunch)', async () => {
    const apiKey = `gsk_${'b'.repeat(40)}`
    await createStore().save({ connectionId: 'ai-1', label: 'Groq', secrets: { apiKey } })

    const relaunched = createStore()
    await expect(relaunched.getSecret('ai-1', 'apiKey')).resolves.toBe(apiKey)
    await expect(relaunched.getMetadata('ai-1')).resolves.toMatchObject({ connectionId: 'ai-1' })
  })

  it('delete removes all secrets for a connection', async () => {
    const store = createStore()
    await store.save({ connectionId: 'ai-1', label: 'Key', secrets: { apiKey: 'sk-x' } })

    await store.delete('ai-1')

    await expect(store.getMetadata('ai-1')).resolves.toBeUndefined()
    await expect(store.getSecret('ai-1', 'apiKey')).resolves.toBeUndefined()
  })

  it('rejects an empty secret set / empty value', async () => {
    const store = createStore()
    await expect(store.save({ connectionId: 'ai-1', label: 'x', secrets: {} })).rejects.toThrow()
    await expect(
      store.save({ connectionId: 'ai-1', label: 'x', secrets: { apiKey: '' } })
    ).rejects.toThrow()
  })

  it('returns undefined (not throw) for corrupt ciphertext and logs it', async () => {
    const loggerSink = vi.fn()
    const store = createStore(new ConsoleLogger('AiCredentialStore', loggerSink))
    await createJsonStore().write({
      credentials: {
        'ai-1': {
          label: 'corrupt',
          fields: { apiKey: Buffer.from('not a payload', 'utf8').toString('base64') },
          maskedPreview: '••••',
          secretFields: ['apiKey'],
          updatedAt: '2026-06-25T00:00:00.000Z',
        },
      },
    })

    await expect(store.getSecret('ai-1', 'apiKey')).resolves.toBeUndefined()
    expect(loggerSink).toHaveBeenCalled()
  })

  it('never writes the raw secret to log lines', async () => {
    const loggerSink = vi.fn()
    const store = createStore(new ConsoleLogger('AiCredentialStore', loggerSink))
    const apiKey = `sk-or-v1-${'c'.repeat(40)}`

    await store.save({ connectionId: 'ai-1', label: 'Key', secrets: { apiKey } })
    await store.getSecret('ai-1', 'apiKey')
    await store.delete('ai-1')

    const lines = loggerSink.mock.calls.map(([line]) => String(line)).join('\n')
    expect(lines).not.toContain(apiKey)
    expect(lines).toContain('ai-1')
  })
})
