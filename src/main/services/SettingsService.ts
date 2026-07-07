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
    // Serialized read-modify-write (W19) — two concurrent settings.update() calls (e.g.
    // a profile switch racing an onboarding-completed write) can no longer both read
    // the same stale snapshot and silently drop one patch.
    return this.store.update((current) => ({ ...current, ...patch }))
  }
}
