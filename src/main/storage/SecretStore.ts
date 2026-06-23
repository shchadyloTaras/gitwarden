export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export class SecretStore {
  private readonly safe: SafeStorageLike

  constructor(safe?: SafeStorageLike) {
    if (safe) {
      this.safe = safe
    } else {
      // Lazy require so plain-Node tests never load Electron
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { safeStorage } = require('electron') as { safeStorage: SafeStorageLike }
      this.safe = safeStorage
    }
  }

  isAvailable(): boolean {
    return this.safe.isEncryptionAvailable()
  }

  encrypt(plainText: string): Buffer {
    if (!this.isAvailable()) throw new Error('safeStorage not available')
    return this.safe.encryptString(plainText)
  }

  decrypt(cipherText: Buffer): string {
    if (!this.isAvailable()) throw new Error('safeStorage not available')
    return this.safe.decryptString(cipherText)
  }

  // MVP stub: token storage is modelled but the push path is not wired yet.
  async saveToken(_profileId: string, _token: string): Promise<void> {
    throw new Error('Token auth is not implemented in the MVP push path')
  }

  async loadToken(_profileId: string): Promise<string | undefined> {
    return undefined
  }
}
