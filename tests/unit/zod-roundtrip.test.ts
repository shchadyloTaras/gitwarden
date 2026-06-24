import { describe, it, expect } from 'vitest'
import {
  ProfileSchema,
  RepositoryRecordSchema,
  AppSettingsSchema,
  LinkedGitHubAccountSchema,
  GitHubDeviceCodeSchema,
  GitHubAccountSchema,
  GitHubAuthStatusSchema,
  GitHubAuthErrorCodeSchema,
  GitHubDeviceCodeResponseSchema,
  GitHubAccessTokenResponseSchema,
  GitHubUserResponseSchema,
  GitHubEmailsResponseSchema,
} from '../../src/core/schemas'

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

  it('parses a profile WITHOUT linkedGitHub (optional absent)', () => {
    const result = ProfileSchema.parse(full)
    expect(result.linkedGitHub).toBeUndefined()
  })

  it('parses and round-trips a profile WITH linkedGitHub', () => {
    const linked = {
      ...full,
      linkedGitHub: {
        login: 'alice-personal',
        accountId: 1234567,
        scopes: ['read:user', 'user:email'],
        connectedAt: '2026-06-24T09:00:00.000Z',
      },
    }
    const parsed = ProfileSchema.parse(linked)
    expect(parsed.linkedGitHub).toEqual(linked.linkedGitHub)
    const reparsed = ProfileSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(reparsed).toEqual(linked)
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
    defaultProjectsFolder: '/home/alice/projects',
    onboardingCompletedAt: '2026-06-23T12:00:00.000Z',
    onboardingSkippedAt: '2026-06-23T11:00:00.000Z',
  }

  it('parses full settings', () => {
    expect(AppSettingsSchema.parse(full)).toEqual(full)
  })

  it('parses minimal settings', () => {
    const minimal = { appearance: 'system' as const }
    const result = AppSettingsSchema.parse(minimal)
    expect(result.appearance).toBe('system')
    expect(result.activeProfileId).toBeUndefined()
    expect(result.onboardingCompletedAt).toBeUndefined()
  })

  it('serializes and re-parses without data loss', () => {
    const serialized = JSON.stringify(AppSettingsSchema.parse(full))
    expect(AppSettingsSchema.parse(JSON.parse(serialized))).toEqual(full)
  })

  it('rejects an invalid appearance value', () => {
    expect(() => AppSettingsSchema.parse({ ...full, appearance: 'purple' })).toThrow()
  })
})

describe('LinkedGitHubAccount round-trip', () => {
  const full = {
    login: 'alice-personal',
    accountId: 1234567,
    scopes: ['read:user', 'user:email'],
    connectedAt: '2026-06-24T09:00:00.000Z',
  }

  it('serializes and re-parses without data loss', () => {
    const serialized = JSON.stringify(LinkedGitHubAccountSchema.parse(full))
    expect(LinkedGitHubAccountSchema.parse(JSON.parse(serialized))).toEqual(full)
  })

  it('rejects a non-integer accountId', () => {
    expect(() => LinkedGitHubAccountSchema.parse({ ...full, accountId: 1.5 })).toThrow()
  })

  it('rejects a missing required field', () => {
    const { login: _omit, ...bad } = full // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(() => LinkedGitHubAccountSchema.parse(bad)).toThrow()
  })
})

describe('GitHub renderer-facing payloads round-trip', () => {
  it('GitHubDeviceCode round-trips (no device_code field)', () => {
    const code = {
      userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
      expiresInSec: 900,
      intervalSec: 5,
    }
    const serialized = JSON.stringify(GitHubDeviceCodeSchema.parse(code))
    expect(GitHubDeviceCodeSchema.parse(JSON.parse(serialized))).toEqual(code)
  })

  it('GitHubAccount round-trips full', () => {
    const account = {
      id: 1234567,
      login: 'alice-personal',
      name: 'Alice Dev',
      email: 'alice@personal.dev',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1234567',
    }
    const serialized = JSON.stringify(GitHubAccountSchema.parse(account))
    expect(GitHubAccountSchema.parse(JSON.parse(serialized))).toEqual(account)
  })

  it('GitHubAccount parses minimal (optionals absent)', () => {
    const result = GitHubAccountSchema.parse({ id: 42, login: 'bob' })
    expect(result.name).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.avatarUrl).toBeUndefined()
  })
})

describe('GitHubAuthStatus / GitHubAuthErrorCode enums', () => {
  it('accepts every defined status', () => {
    for (const s of ['idle', 'awaitingUser', 'authorized', 'denied', 'expired', 'error']) {
      expect(GitHubAuthStatusSchema.parse(s)).toBe(s)
    }
  })

  it('rejects an unknown status', () => {
    expect(() => GitHubAuthStatusSchema.parse('connecting')).toThrow()
  })

  it('accepts every defined error code', () => {
    for (const c of [
      'slowDown',
      'expiredToken',
      'accessDenied',
      'tokenInvalid',
      'network',
      'unknown',
    ]) {
      expect(GitHubAuthErrorCodeSchema.parse(c)).toBe(c)
    }
  })

  it('rejects an unknown error code', () => {
    expect(() => GitHubAuthErrorCodeSchema.parse('boom')).toThrow()
  })
})

describe('Raw GitHub API responses', () => {
  it('parses the device-code response (snake_case) and strips unknown keys', () => {
    const raw = {
      device_code: '3584d83530557fdd1f46af8289938c8ef58a3b',
      user_code: 'WDJB-MJHT',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
      extra_field_from_github: 'ignored',
    }
    const parsed = GitHubDeviceCodeResponseSchema.parse(raw)
    expect(parsed.user_code).toBe('WDJB-MJHT')
    expect('extra_field_from_github' in parsed).toBe(false)
  })

  it('parses the access-token SUCCESS branch', () => {
    const parsed = GitHubAccessTokenResponseSchema.parse({
      access_token: 'gho_xxx',
      scope: 'read:user,user:email',
      token_type: 'bearer',
    })
    expect('access_token' in parsed && parsed.access_token).toBe('gho_xxx')
  })

  it('parses the access-token ERROR/pending branch with slow_down interval', () => {
    const parsed = GitHubAccessTokenResponseSchema.parse({
      error: 'slow_down',
      error_description: 'too fast',
      interval: 10,
    })
    expect('error' in parsed && parsed.error).toBe('slow_down')
  })

  it('rejects a token response that is neither success nor error shaped', () => {
    expect(() => GitHubAccessTokenResponseSchema.parse({ token_type: 'bearer' })).toThrow()
  })

  it('parses the /user response with null name and email', () => {
    const parsed = GitHubUserResponseSchema.parse({
      id: 1234567,
      login: 'alice-personal',
      name: null,
      email: null,
      avatar_url: 'https://avatars.githubusercontent.com/u/1234567',
    })
    expect(parsed.id).toBe(1234567)
    expect(parsed.name).toBeNull()
  })

  it('parses the /user/emails response array', () => {
    const parsed = GitHubEmailsResponseSchema.parse([
      { email: 'alice@personal.dev', primary: true, verified: true, visibility: 'public' },
      { email: 'old@example.com', primary: false, verified: true, visibility: null },
    ])
    expect(parsed).toHaveLength(2)
    expect(parsed[0].primary && parsed[0].verified).toBe(true)
  })
})
