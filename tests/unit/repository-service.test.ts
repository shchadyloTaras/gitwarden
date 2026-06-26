import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RepositoriesDataSchema } from '../../src/core/schemas.js'
import { JsonStore } from '../../src/main/storage/JsonStore.js'
import { RepositoryService } from '../../src/main/services/RepositoryService.js'
import type { RepositoryRecord } from '../../src/core/types.js'

const BASE_REPO: Omit<RepositoryRecord, 'id'> = {
  name: 'my-project',
  localPath: '/Users/alice/projects/my-project',
  isFavorite: false,
}

let tmpDir: string
let service: RepositoryService

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gitwarden-repo-'))
  const store = new JsonStore(path.join(tmpDir, 'repositories.json'), RepositoriesDataSchema, {
    repositories: [],
  })
  service = new RepositoryService(store)
})

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true })
})

describe('RepositoryService', () => {
  it('starts with an empty list', async () => {
    expect(await service.list()).toEqual([])
  })

  it('creates a repository record with an id', async () => {
    const r = await service.create(BASE_REPO)
    expect(r.id).toBeTruthy()
    expect(r.name).toBe('my-project')
  })

  it('get returns the record by id', async () => {
    const r = await service.create(BASE_REPO)
    expect(await service.get(r.id)).toEqual(r)
  })

  it('get returns undefined for unknown id', async () => {
    expect(await service.get('missing')).toBeUndefined()
  })

  it('list returns all created records', async () => {
    await service.create(BASE_REPO)
    await service.create({ ...BASE_REPO, name: 'other-project', localPath: '/tmp/other' })
    expect(await service.list()).toHaveLength(2)
  })

  it('update patches specific fields', async () => {
    const r = await service.create(BASE_REPO)
    const updated = await service.update(r.id, { assignedProfileId: 'profile-1', isFavorite: true })
    expect(updated.assignedProfileId).toBe('profile-1')
    expect(updated.isFavorite).toBe(true)
    expect(updated.name).toBe('my-project')
  })

  it('update throws for unknown id', async () => {
    await expect(service.update('nope', { name: 'x' })).rejects.toThrow('not found')
  })

  it('delete removes the record', async () => {
    const r = await service.create(BASE_REPO)
    await service.delete(r.id)
    expect(await service.list()).toHaveLength(0)
  })

  it('delete throws for unknown id', async () => {
    await expect(service.delete('nope')).rejects.toThrow('not found')
  })

  describe('pruneAssignments', () => {
    it('clears assignedProfileId on repos whose profile no longer exists', async () => {
      const keep = await service.update(
        (await service.create({ ...BASE_REPO, name: 'keep' })).id,
        { assignedProfileId: 'alive' }
      )
      const orphan = await service.update(
        (await service.create({ ...BASE_REPO, name: 'orphan', localPath: '/tmp/orphan' })).id,
        { assignedProfileId: 'deleted' }
      )

      const changed = await service.pruneAssignments(['alive'])

      expect(changed).toHaveLength(1)
      expect(changed[0].id).toBe(orphan.id)
      expect(changed[0].assignedProfileId).toBeUndefined()

      const list = await service.list()
      expect(list.find((r) => r.id === keep.id)?.assignedProfileId).toBe('alive')
      expect(list.find((r) => r.id === orphan.id)?.assignedProfileId).toBeUndefined()
    })

    it('leaves repos untouched and writes nothing when all assignments are valid', async () => {
      await service.update((await service.create(BASE_REPO)).id, { assignedProfileId: 'alive' })

      const changed = await service.pruneAssignments(['alive', 'other'])

      expect(changed).toEqual([])
      expect((await service.list())[0].assignedProfileId).toBe('alive')
    })

    it('ignores repos that have no assignment', async () => {
      await service.create(BASE_REPO) // no assignedProfileId
      const changed = await service.pruneAssignments([])
      expect(changed).toEqual([])
    })

    it('the pruned state persists across store instances (simulates relaunch)', async () => {
      const filePath = path.join(tmpDir, 'repositories.json')
      const r = await service.update((await service.create(BASE_REPO)).id, {
        assignedProfileId: 'deleted',
      })
      await service.pruneAssignments([])

      const storeB = new JsonStore(filePath, RepositoriesDataSchema, { repositories: [] })
      const serviceB = new RepositoryService(storeB)
      expect((await serviceB.get(r.id))?.assignedProfileId).toBeUndefined()
    })
  })

  it('data persists across store instances (simulates relaunch)', async () => {
    const filePath = path.join(tmpDir, 'repositories.json')
    const storeA = new JsonStore(filePath, RepositoriesDataSchema, { repositories: [] })
    const serviceA = new RepositoryService(storeA)
    const r = await serviceA.create(BASE_REPO)

    const storeB = new JsonStore(filePath, RepositoriesDataSchema, { repositories: [] })
    const serviceB = new RepositoryService(storeB)
    const found = await serviceB.get(r.id)
    expect(found?.name).toBe('my-project')
  })
})
