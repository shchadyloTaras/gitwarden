import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesDataSchema } from '../../src/core/schemas.js'
import { JsonStore } from '../../src/main/storage/JsonStore.js'
import { ProfileService } from '../../src/main/services/ProfileService.js'
import { profileFixture } from '../fixtures/profiles'

const BASE_PROFILE = profileFixture('personal', {
  gitAuthorName: 'Alice',
  gitAuthorEmail: 'alice@example.com',
  githubUsername: 'alice',
  expectedRemoteHosts: ['github.com'],
})

let tmpDir: string
let service: ProfileService

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gitwarden-profile-'))
  const store = new JsonStore(path.join(tmpDir, 'profiles.json'), ProfilesDataSchema, {
    profiles: [],
  })
  service = new ProfileService(store)
})

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true })
})

describe('ProfileService', () => {
  it('starts with an empty list', async () => {
    expect(await service.list()).toEqual([])
  })

  it('creates a profile and assigns an id', async () => {
    const p = await service.create(BASE_PROFILE)
    expect(p.id).toBeTruthy()
    expect(p.displayName).toBe('Personal')
  })

  it('get returns the profile by id', async () => {
    const created = await service.create(BASE_PROFILE)
    const found = await service.get(created.id)
    expect(found).toEqual(created)
  })

  it('get returns undefined for unknown id', async () => {
    expect(await service.get('missing')).toBeUndefined()
  })

  it('list returns all created profiles', async () => {
    await service.create(BASE_PROFILE)
    await service.create({ ...BASE_PROFILE, displayName: 'Work' })
    expect(await service.list()).toHaveLength(2)
  })

  it('update patches specific fields', async () => {
    const p = await service.create(BASE_PROFILE)
    const updated = await service.update(p.id, { displayName: 'Personal 2' })
    expect(updated.displayName).toBe('Personal 2')
    expect(updated.gitAuthorEmail).toBe(BASE_PROFILE.gitAuthorEmail)
  })

  it('update throws for unknown id', async () => {
    await expect(service.update('nope', { displayName: 'X' })).rejects.toThrow('not found')
  })

  it('delete removes the profile', async () => {
    const p = await service.create(BASE_PROFILE)
    await service.delete(p.id)
    expect(await service.list()).toHaveLength(0)
  })

  it('delete throws for unknown id', async () => {
    await expect(service.delete('nope')).rejects.toThrow('not found')
  })

  it('data persists across store instances (simulates relaunch)', async () => {
    const filePath = path.join(tmpDir, 'profiles.json')
    const storeA = new JsonStore(filePath, ProfilesDataSchema, { profiles: [] })
    const serviceA = new ProfileService(storeA)
    const p = await serviceA.create(BASE_PROFILE)

    const storeB = new JsonStore(filePath, ProfilesDataSchema, { profiles: [] })
    const serviceB = new ProfileService(storeB)
    const found = await serviceB.get(p.id)
    expect(found?.displayName).toBe('Personal')
  })
})
