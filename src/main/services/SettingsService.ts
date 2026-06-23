import type { AppSettings } from '../../core/types.js'
import type { JsonStore } from '../storage/JsonStore.js'

export interface ISettingsService {
  get(): Promise<AppSettings>
  update(patch: Partial<AppSettings>): Promise<AppSettings>
}

export class SettingsService implements ISettingsService {
  constructor(private readonly store: JsonStore<AppSettings>) {}

  async get(): Promise<AppSettings> {
    return this.store.read()
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.store.read()
    const updated: AppSettings = { ...current, ...patch }
    await this.store.write(updated)
    return updated
  }
}
