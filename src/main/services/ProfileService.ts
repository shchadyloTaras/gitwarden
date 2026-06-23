import type { Profile } from '../../core/types.js'
import type { ProfilesData } from '../../core/schemas.js'
import type { JsonStore } from '../storage/JsonStore.js'

export interface IProfileService {
  list(): Promise<Profile[]>
  get(id: string): Promise<Profile | undefined>
  create(input: Omit<Profile, 'id'>): Promise<Profile>
  update(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile>
  delete(id: string): Promise<void>
}

export class ProfileService implements IProfileService {
  constructor(private readonly store: JsonStore<ProfilesData>) {}

  async list(): Promise<Profile[]> {
    return (await this.store.read()).profiles
  }

  async get(id: string): Promise<Profile | undefined> {
    return (await this.list()).find((p) => p.id === id)
  }

  async create(input: Omit<Profile, 'id'>): Promise<Profile> {
    const data = await this.store.read()
    const profile: Profile = { ...input, id: crypto.randomUUID() }
    data.profiles.push(profile)
    await this.store.write(data)
    return profile
  }

  async update(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
    const data = await this.store.read()
    const idx = data.profiles.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error(`Profile not found: ${id}`)
    const updated: Profile = { ...data.profiles[idx], ...patch }
    data.profiles[idx] = updated
    await this.store.write(data)
    return updated
  }

  async delete(id: string): Promise<void> {
    const data = await this.store.read()
    const filtered = data.profiles.filter((p) => p.id !== id)
    if (filtered.length === data.profiles.length) throw new Error(`Profile not found: ${id}`)
    await this.store.write({ profiles: filtered })
  }
}
