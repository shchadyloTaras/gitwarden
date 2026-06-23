import { describe, it, expect } from 'vitest'
import { ProfileSchema, RepositoryRecordSchema, AppSettingsSchema } from '../../src/core/schemas'

describe('Profile round-trip', () => {
  const full = {
    id: 'p-1',
    displayName: 'Personal',
    gitAuthorName: 'Alice Dev',
    gitAuthorEmail: 'alice@personal.dev',
    githubUsername: 'alice-personal',
    authenticationMethod: 'ssh' as const,
    sshKeyAlias: 'github.com-personal',
    expectedRemoteHosts: ['github.com-personal'],
    defaultProjectsFolder: '/home/alice/personal',
    notes: 'Personal account',
  }

  it('parses a full profile', () => {
    const result = ProfileSchema.parse(full)
    expect(result).toEqual(full)
  })

  it('parses a minimal profile (optionals absent)', () => {
    const minimal = {
      id: 'p-2',
      displayName: 'Work',
      gitAuthorName: 'Alice Work',
      gitAuthorEmail: 'alice@work.com',
      githubUsername: 'alice-work',
      authenticationMethod: 'ssh' as const,
      expectedRemoteHosts: [],
    }
    const result = ProfileSchema.parse(minimal)
    expect(result.sshKeyAlias).toBeUndefined()
    expect(result.notes).toBeUndefined()
  })

  it('serializes and re-parses without data loss', () => {
    const serialized = JSON.stringify(ProfileSchema.parse(full))
    const reparsed = ProfileSchema.parse(JSON.parse(serialized))
    expect(reparsed).toEqual(full)
  })

  it('rejects an invalid authenticationMethod', () => {
    expect(() => ProfileSchema.parse({ ...full, authenticationMethod: 'oauth' })).toThrow()
  })
})

describe('RepositoryRecord round-trip', () => {
  const full = {
    id: 'r-1',
    name: 'my-project',
    localPath: '/home/alice/my-project',
    remoteUrl: 'git@github.com-personal:alice/my-project.git',
    assignedProfileId: 'p-1',
    lastOpenedAt: '2026-06-23T10:00:00.000Z',
    isFavorite: true,
    notes: 'Main project',
  }

  it('parses a full record', () => {
    expect(RepositoryRecordSchema.parse(full)).toEqual(full)
  })

  it('parses a minimal record (optionals absent)', () => {
    const minimal = {
      id: 'r-2',
      name: 'side-project',
      localPath: '/home/alice/side',
      isFavorite: false,
    }
    const result = RepositoryRecordSchema.parse(minimal)
    expect(result.remoteUrl).toBeUndefined()
    expect(result.assignedProfileId).toBeUndefined()
    expect(result.isFavorite).toBe(false)
  })

  it('serializes and re-parses without data loss', () => {
    const serialized = JSON.stringify(RepositoryRecordSchema.parse(full))
    expect(RepositoryRecordSchema.parse(JSON.parse(serialized))).toEqual(full)
  })

  it('rejects a missing required field', () => {
    const { localPath: _omit, ...bad } = full // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => RepositoryRecordSchema.parse(bad)).toThrow()
  })
})

describe('AppSettings round-trip', () => {
  const full = {
    activeProfileId: 'p-1',
    lastOpenedRepositoryId: 'r-1',
    appearance: 'dark' as const,
    customGitPath: '/usr/local/bin/git',
  }

  it('parses full settings', () => {
    expect(AppSettingsSchema.parse(full)).toEqual(full)
  })

  it('parses minimal settings', () => {
    const minimal = { appearance: 'system' as const }
    const result = AppSettingsSchema.parse(minimal)
    expect(result.appearance).toBe('system')
    expect(result.activeProfileId).toBeUndefined()
  })

  it('serializes and re-parses without data loss', () => {
    const serialized = JSON.stringify(AppSettingsSchema.parse(full))
    expect(AppSettingsSchema.parse(JSON.parse(serialized))).toEqual(full)
  })

  it('rejects an invalid appearance value', () => {
    expect(() => AppSettingsSchema.parse({ ...full, appearance: 'purple' })).toThrow()
  })
})
