import { z } from 'zod'
import type { JsonStore } from './JsonStore.js'
import type { SecretStore } from './SecretStore.js'
import { createLogger, type Logger } from '../services/Logger.js'

const TokenStoreDataSchema = z.object({
  tokens: z.record(z.string()),
})

export type TokenStoreData = z.infer<typeof TokenStoreDataSchema>

export const TOKEN_STORE_DEFAULTS: TokenStoreData = { tokens: {} }

export interface ITokenStore {
  set(profileId: string, token: string): Promise<void>
  get(profileId: string): Promise<string | undefined>
  delete(profileId: string): Promise<void>
}

export class TokenStore implements ITokenStore {
  constructor(
    private readonly store: JsonStore<TokenStoreData>,
    private readonly secrets: SecretStore,
    private readonly logger: Logger = createLogger('TokenStore')
  ) {}

  async set(profileId: string, token: string): Promise<void> {
    const data = await this.readData()
    data.tokens[profileId] = this.secrets.encrypt(token).toString('base64')
    await this.store.write(data)
    this.logger.debug('Stored GitHub token', { profileId })
  }

  async get(profileId: string): Promise<string | undefined> {
    const data = await this.readData()
    const encoded = data.tokens[profileId]
    if (!encoded) return undefined

    try {
      const cipherText = decodeCipherText(encoded)
      if (!cipherText) throw new Error('Stored token ciphertext is not valid base64')
      return this.secrets.decrypt(cipherText)
    } catch (error) {
      this.logger.warn('Ignoring unreadable GitHub token', {
        profileId,
        error: errorMessage(error),
      })
      return undefined
    }
  }

  async delete(profileId: string): Promise<void> {
    const data = await this.readData()
    if (!(profileId in data.tokens)) return

    delete data.tokens[profileId]
    await this.store.write(data)
    this.logger.debug('Deleted GitHub token', { profileId })
  }

  private async readData(): Promise<TokenStoreData> {
    try {
      return TokenStoreDataSchema.parse(await this.store.read())
    } catch (error) {
      this.logger.warn('Ignoring unreadable token store', {
        error: errorMessage(error),
      })
      return structuredClone(TOKEN_STORE_DEFAULTS)
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

export { TokenStoreDataSchema }
