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
}
