import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonStore } from '../../src/main/storage/JsonStore.js'
import type { SafeStorageLike } from '../../src/main/storage/SecretStore.js'
import { SecretStore } from '../../src/main/storage/SecretStore.js'
import {
  TOKEN_STORE_DEFAULTS,
  TokenStore,
  TokenStoreDataSchema,
  type TokenStoreData,
} from '../../src/main/storage/TokenStore.js'
import { ConsoleLogger, type Logger } from '../../src/main/services/Logger.js'

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
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gitwarden-token-store-'))
  storePath = path.join(tmpDir, 'tokens.json')
  secrets = new SecretStore(new FakeSafeStorage())
})

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true })
})

function createTokenStore(logger?: Logger): TokenStore {
  return new TokenStore(createJsonStore(), secrets, logger ?? silentLogger)
}

function createJsonStore(): JsonStore<TokenStoreData> {
  return new JsonStore(storePath, TokenStoreDataSchema, TOKEN_STORE_DEFAULTS)
}

describe('TokenStore', () => {
  it('round-trips a token through encrypted storage', async () => {
    const store = createTokenStore()
    const token = `gho_${'b'.repeat(32)}`

    await store.set('profile-1', token)

    await expect(store.get('profile-1')).resolves.toBe(token)
    await expect(fsPromises.readFile(storePath, 'utf8')).resolves.not.toContain(token)
  })

  it('survives a new TokenStore instance with the same persisted data', async () => {
    const token = `gho_${'c'.repeat(32)}`
    const firstInstance = createTokenStore()
    await firstInstance.set('profile-1', token)

    const relaunchedInstance = createTokenStore()

    await expect(relaunchedInstance.get('profile-1')).resolves.toBe(token)
  })

  it('delete removes a stored token', async () => {
    const store = createTokenStore()
    await store.set('profile-1', `gho_${'d'.repeat(32)}`)

    await store.delete('profile-1')

    await expect(store.get('profile-1')).resolves.toBeUndefined()
  })

  it('returns undefined for missing tokens', async () => {
    const store = createTokenStore()

    await expect(store.get('missing-profile')).resolves.toBeUndefined()
  })

  it('returns undefined instead of throwing for corrupt ciphertext', async () => {
    const loggerSink = vi.fn()
    const store = createTokenStore(new ConsoleLogger('TokenStore', loggerSink))
    await createJsonStore().write({
      tokens: {
        'profile-1': Buffer.from('not a safeStorage payload', 'utf8').toString('base64'),
      },
    })

    await expect(store.get('profile-1')).resolves.toBeUndefined()
    expect(loggerSink).toHaveBeenCalled()
  })

  it('never writes the raw token to TokenStore log lines', async () => {
    const loggerSink = vi.fn()
    const store = createTokenStore(new ConsoleLogger('TokenStore', loggerSink))
    const token = `gho_${'e'.repeat(32)}`

    await store.set('profile-1', token)
    await store.get('profile-1')
    await store.delete('profile-1')

    const lines = loggerSink.mock.calls.map(([line]) => String(line)).join('\n')
    expect(lines).not.toContain(token)
    expect(lines).toContain('profile-1')
  })
})
