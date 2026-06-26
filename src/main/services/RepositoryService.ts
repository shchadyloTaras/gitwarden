import type { RepositoryRecord } from '../../core/types.js'
import type { RepositoriesData } from '../../core/schemas.js'
import type { JsonStore } from '../storage/JsonStore.js'

export interface IRepositoryService {
  list(): Promise<RepositoryRecord[]>
  get(id: string): Promise<RepositoryRecord | undefined>
  create(input: Omit<RepositoryRecord, 'id'>): Promise<RepositoryRecord>
  update(id: string, patch: Partial<Omit<RepositoryRecord, 'id'>>): Promise<RepositoryRecord>
  delete(id: string): Promise<void>
  /**
   * Clear `assignedProfileId` on any repository whose assigned profile is not in
   * `validProfileIds`. Used after a profile is deleted (and at startup) so a repo never
   * points at a ghost profile — a dangling id otherwise blocks commit/push with a
   * phantom "profile mismatch" and the Safety Center shows no way to recover. Returns
   * the records that changed.
   */
  pruneAssignments(validProfileIds: Iterable<string>): Promise<RepositoryRecord[]>
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

  async pruneAssignments(validProfileIds: Iterable<string>): Promise<RepositoryRecord[]> {
    const valid = new Set(validProfileIds)
    const data = await this.store.read()
    const changed: RepositoryRecord[] = []
    const repositories = data.repositories.map((repo) => {
      if (repo.assignedProfileId === undefined || valid.has(repo.assignedProfileId)) return repo
      const next: RepositoryRecord = { ...repo }
      delete next.assignedProfileId
      changed.push(next)
      return next
    })
    if (changed.length > 0) await this.store.write({ repositories })
    return changed
  }
}
