import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppSettingsSchema } from '../../src/core/schemas.js'
import { JsonStore } from '../../src/main/storage/JsonStore.js'
import { SettingsService } from '../../src/main/services/SettingsService.js'
import type { AppSettings } from '../../src/core/types.js'

const DEFAULTS: AppSettings = { appearance: 'system' }

let tmpDir: string
let service: SettingsService

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gitwarden-settings-'))
  const store = new JsonStore(path.join(tmpDir, 'settings.json'), AppSettingsSchema, DEFAULTS)
  service = new SettingsService(store)
})

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true })
})

describe('SettingsService', () => {
  it('returns defaults on first read', async () => {
    const settings = await service.get()
    expect(settings).toEqual(DEFAULTS)
  })

  it('update merges patch into current settings', async () => {
    const s = await service.update({ appearance: 'dark' })
    expect(s.appearance).toBe('dark')
  })

  it('update preserves unpatched fields', async () => {
    await service.update({ activeProfileId: 'p1' })
    const s = await service.update({ appearance: 'light' })
    expect(s.activeProfileId).toBe('p1')
    expect(s.appearance).toBe('light')
  })

  it('get returns the last written value', async () => {
    await service.update({ lastOpenedRepositoryId: 'r1' })
    const s = await service.get()
    expect(s.lastOpenedRepositoryId).toBe('r1')
  })

  it('data persists across store instances (simulates relaunch)', async () => {
    const filePath = path.join(tmpDir, 'settings.json')
    const storeA = new JsonStore(filePath, AppSettingsSchema, DEFAULTS)
    const serviceA = new SettingsService(storeA)
    await serviceA.update({
      appearance: 'dark',
      activeProfileId: 'p42',
      defaultProjectsFolder: '/tmp/projects',
    })

    const storeB = new JsonStore(filePath, AppSettingsSchema, DEFAULTS)
    const serviceB = new SettingsService(storeB)
    const s = await serviceB.get()
    expect(s.appearance).toBe('dark')
    expect(s.activeProfileId).toBe('p42')
    expect(s.defaultProjectsFolder).toBe('/tmp/projects')
  })
})
