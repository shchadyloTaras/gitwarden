import type { RepositoryRecord } from '../../core/types.js'
import type { RepositoriesData } from '../../core/schemas.js'
import type { JsonStore } from '../storage/JsonStore.js'

export interface IRepositoryService {
  list(): Promise<RepositoryRecord[]>
  get(id: string): Promise<RepositoryRecord | undefined>
  create(input: Omit<RepositoryRecord, 'id'>): Promise<RepositoryRecord>
  update(id: string, patch: Partial<Omit<RepositoryRecord, 'id'>>): Promise<RepositoryRecord>
  delete(id: string): Promise<void>
}

export class RepositoryService implements IRepositoryService {
  constructor(private readonly store: JsonStore<RepositoriesData>) {}

  async list(): Promise<RepositoryRecord[]> {
    return (await this.store.read()).repositories
  }

  async get(id: string): Promise<RepositoryRecord | undefined> {
    return (await this.list()).find((r) => r.id === id)
  }

  async create(input: Omit<RepositoryRecord, 'id'>): Promise<RepositoryRecord> {
    const data = await this.store.read()
    const record: RepositoryRecord = { ...input, id: crypto.randomUUID() }
    data.repositories.push(record)
    await this.store.write(data)
    return record
  }

  async update(
    id: string,
    patch: Partial<Omit<RepositoryRecord, 'id'>>
  ): Promise<RepositoryRecord> {
    const data = await this.store.read()
    const idx = data.repositories.findIndex((r) => r.id === id)
    if (idx === -1) throw new Error(`Repository not found: ${id}`)
    const updated: RepositoryRecord = { ...data.repositories[idx], ...patch }
    data.repositories[idx] = updated
    await this.store.write(data)
    return updated
  }

  async delete(id: string): Promise<void> {
    const data = await this.store.read()
    const filtered = data.repositories.filter((r) => r.id !== id)
    if (filtered.length === data.repositories.length) throw new Error(`Repository not found: ${id}`)
    await this.store.write({ repositories: filtered })
  }
}
