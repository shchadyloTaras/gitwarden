import { describe, it, expect } from 'vitest'
import { matchesBranchPattern, matchesAnyPattern } from '../../src/core/safety/branchPatterns.js'
import { parseRemoteOwnerRepo } from '../../src/core/github/remoteOwner.js'
import { resolvePushTarget } from '../../src/core/safety/pushTarget.js'
import { RepositoryRecordSchema, RepositoryPushPolicySchema } from '../../src/core/schemas.js'

// ── Branch pattern matching ───────────────────────────────────────────────────

describe('matchesBranchPattern', () => {
  describe('* matches within a segment (not /)', () => {
    it('matches a single-level suffix', () => {
      expect(matchesBranchPattern('client-x/taras/fix', 'client-x/taras/*')).toBe(true)
    })
    it('does NOT match across /', () => {
      expect(matchesBranchPattern('client-x/taras/a/b', 'client-x/taras/*')).toBe(false)
    })
    it('matches release/1.2', () => {
      expect(matchesBranchPattern('release/1.2', 'release/*')).toBe(true)
    })
    it('does NOT match a different person prefix', () => {
      expect(matchesBranchPattern('client-x/bob/fix', 'client-x/taras/*')).toBe(false)
    })
    it('matches a bare wildcard', () => {
      expect(matchesBranchPattern('anything', '*')).toBe(true)
    })
    it('bare * does not match across /', () => {
      expect(matchesBranchPattern('a/b', '*')).toBe(false)
    })
  })

  describe('** matches across /', () => {
    it('matches multi-level path', () => {
      expect(matchesBranchPattern('client-x/taras/a/b', 'client-x/taras/**')).toBe(true)
    })
    it('matches single-level path', () => {
      expect(matchesBranchPattern('client-x/taras/fix', 'client-x/taras/**')).toBe(true)
    })
    it('** at root matches any branch', () => {
      expect(matchesBranchPattern('anything/deep/path', '**')).toBe(true)
    })
  })

  describe('? matches a single non-/ character', () => {
    it('matches exactly one char', () => {
      expect(matchesBranchPattern('fix1', 'fix?')).toBe(true)
    })
    it('does not match zero chars', () => {
      expect(matchesBranchPattern('fix', 'fix?')).toBe(false)
    })
    it('does not match /', () => {
      expect(matchesBranchPattern('fix/', 'fix?')).toBe(false)
    })
  })

  describe('anchoring', () => {
    it('does not match a prefix', () => {
      expect(matchesBranchPattern('main-extra', 'main')).toBe(false)
    })
    it('does not match a suffix', () => {
      expect(matchesBranchPattern('not-main', 'main')).toBe(false)
    })
    it('exact match succeeds', () => {
      expect(matchesBranchPattern('main', 'main')).toBe(true)
    })
    it('develop matches develop', () => {
      expect(matchesBranchPattern('develop', 'develop')).toBe(true)
    })
  })

  describe('case sensitivity', () => {
    it('Main does not match main', () => {
      expect(matchesBranchPattern('Main', 'main')).toBe(false)
    })
    it('FEATURE/foo does not match feature/*', () => {
      expect(matchesBranchPattern('FEATURE/foo', 'feature/*')).toBe(false)
    })
  })

  describe('special regex characters in pattern are treated as literals', () => {
    it('dot is literal', () => {
      expect(matchesBranchPattern('release/1.2', 'release/1.2')).toBe(true)
      expect(matchesBranchPattern('release/1X2', 'release/1.2')).toBe(false)
    })
  })

  describe('no-match cases', () => {
    it('empty string vs non-empty pattern', () => {
      expect(matchesBranchPattern('', 'main')).toBe(false)
    })
    it('non-empty string vs empty pattern', () => {
      expect(matchesBranchPattern('main', '')).toBe(false)
    })
    it('both empty', () => {
      expect(matchesBranchPattern('', '')).toBe(true)
    })
  })
})

describe('matchesAnyPattern', () => {
  it('returns true when at least one pattern matches', () => {
    expect(matchesAnyPattern('main', ['develop', 'main', 'release/*'])).toBe(true)
  })
  it('returns false when no pattern matches', () => {
    expect(matchesAnyPattern('feature/foo', ['main', 'develop', 'release/*'])).toBe(false)
  })
  it('returns false for empty pattern list', () => {
    expect(matchesAnyPattern('main', [])).toBe(false)
  })
})

// ── parseRemoteOwnerRepo ──────────────────────────────────────────────────────

describe('parseRemoteOwnerRepo', () => {
  describe('scp-like SSH', () => {
    it('parses git@github.com:owner/repo.git', () => {
      expect(parseRemoteOwnerRepo('git@github.com:owner/repo.git')).toEqual({
        owner: 'owner',
        repo: 'repo',
      })
    })
    it('parses without .git suffix', () => {
      expect(parseRemoteOwnerRepo('git@github.com:owner/repo')).toEqual({
        owner: 'owner',
        repo: 'repo',
      })
    })
    it('parses a non-GitHub SSH host', () => {
      expect(parseRemoteOwnerRepo('git@gitlab.com:org/project.git')).toEqual({
        owner: 'org',
        repo: 'project',
      })
    })
  })

  describe('HTTPS', () => {
    it('parses https://github.com/owner/repo.git', () => {
      expect(parseRemoteOwnerRepo('https://github.com/owner/repo.git')).toEqual({
        owner: 'owner',
        repo: 'repo',
      })
    })
    it('parses without .git suffix', () => {
      expect(parseRemoteOwnerRepo('https://github.com/owner/repo')).toEqual({
        owner: 'owner',
        repo: 'repo',
      })
    })
    it('parses with trailing slash', () => {
      expect(parseRemoteOwnerRepo('https://github.com/owner/repo/')).toEqual({
        owner: 'owner',
        repo: 'repo',
      })
    })
    it('parses http (non-secure) URL', () => {
      expect(parseRemoteOwnerRepo('http://github.com/owner/repo.git')).toEqual({
        owner: 'owner',
        repo: 'repo',
      })
    })
  })

  describe('returns undefined for unparseable input', () => {
    it('local path returns undefined', () => {
      expect(parseRemoteOwnerRepo('/home/user/projects/repo')).toBeUndefined()
    })
    it('garbage string returns undefined', () => {
      expect(parseRemoteOwnerRepo('not-a-url')).toBeUndefined()
    })
    it('empty string returns undefined', () => {
      expect(parseRemoteOwnerRepo('')).toBeUndefined()
    })
    it('HTTPS URL with only one path segment returns undefined', () => {
      expect(parseRemoteOwnerRepo('https://github.com/owner')).toBeUndefined()
    })
  })
})

// ── resolvePushTarget ─────────────────────────────────────────────────────────

const REMOTE_ORIGIN = { name: 'origin', url: 'https://github.com/org/repo.git' }
const REMOTE_UPSTREAM = { name: 'upstream', url: 'https://github.com/upstream-org/repo.git' }
const REMOTE_BACKUP = { name: 'backup', url: 'https://github.com/backup-org/repo.git' }

describe('resolvePushTarget', () => {
  it('returns undefined when remotes is empty', () => {
    expect(resolvePushTarget({ remotes: [] })).toBeUndefined()
  })

  it('upstream remote wins over preferred name', () => {
    const result = resolvePushTarget({
      remotes: [REMOTE_ORIGIN, REMOTE_UPSTREAM],
      upstream: 'upstream/main',
    })
    expect(result).toEqual(REMOTE_UPSTREAM)
  })

  it('upstream with slashed branch name extracts remote name correctly', () => {
    const result = resolvePushTarget({
      remotes: [REMOTE_ORIGIN, REMOTE_UPSTREAM],
      upstream: 'upstream/client-x/taras/feature',
    })
    expect(result).toEqual(REMOTE_UPSTREAM)
  })

  it('preferred name fallback when no upstream', () => {
    const result = resolvePushTarget({
      remotes: [REMOTE_UPSTREAM, REMOTE_ORIGIN],
    })
    expect(result).toEqual(REMOTE_ORIGIN)
  })

  it('preferred name fallback uses custom preferredRemoteName', () => {
    const result = resolvePushTarget({
      remotes: [REMOTE_ORIGIN, REMOTE_BACKUP],
      preferredRemoteName: 'backup',
    })
    expect(result).toEqual(REMOTE_BACKUP)
  })

  it('sole remote returned when preferred not found and no upstream', () => {
    const result = resolvePushTarget({
      remotes: [REMOTE_UPSTREAM],
    })
    expect(result).toEqual(REMOTE_UPSTREAM)
  })

  it('returns undefined when preferred not found and multiple remotes', () => {
    const result = resolvePushTarget({
      remotes: [REMOTE_UPSTREAM, REMOTE_BACKUP],
    })
    expect(result).toBeUndefined()
  })

  it('upstream not found falls back to preferred', () => {
    const result = resolvePushTarget({
      remotes: [REMOTE_ORIGIN],
      upstream: 'upstream/main', // 'upstream' remote is not in the list
    })
    expect(result).toEqual(REMOTE_ORIGIN)
  })
})

// ── RepositoryRecord round-trip (with and without pushPolicy) ─────────────────

describe('RepositoryRecord schema round-trip', () => {
  const baseRecord = {
    id: 'r1',
    name: 'Test Repo',
    localPath: '/tmp/repo',
    isFavorite: false,
  }

  it('parses a record without pushPolicy (migration compatibility)', () => {
    const result = RepositoryRecordSchema.parse(baseRecord)
    expect(result.pushPolicy).toBeUndefined()
  })

  it('parses a record with a full pushPolicy', () => {
    const record = {
      ...baseRecord,
      pushPolicy: {
        mode: 'branchScoped',
        allowedBranchPatterns: ['client-x/taras/*'],
        blockedBranchPatterns: ['main', 'develop', 'release/*'],
        expectedRemoteOwner: 'client-org',
        expectedRemoteRepo: 'project',
        expectedGitHubActor: 'taras',
        suggestedBranchPrefix: 'client-x/taras/',
      },
    }
    const result = RepositoryRecordSchema.parse(record)
    expect(result.pushPolicy?.mode).toBe('branchScoped')
    expect(result.pushPolicy?.allowedBranchPatterns).toEqual(['client-x/taras/*'])
    expect(result.pushPolicy?.blockedBranchPatterns).toEqual(['main', 'develop', 'release/*'])
    expect(result.pushPolicy?.expectedRemoteOwner).toBe('client-org')
    expect(result.pushPolicy?.expectedRemoteRepo).toBe('project')
    expect(result.pushPolicy?.expectedGitHubActor).toBe('taras')
    expect(result.pushPolicy?.suggestedBranchPrefix).toBe('client-x/taras/')
  })

  it('parses an unrestricted policy with empty pattern lists', () => {
    const record = {
      ...baseRecord,
      pushPolicy: {
        mode: 'unrestricted',
        allowedBranchPatterns: [],
        blockedBranchPatterns: [],
      },
    }
    const result = RepositoryRecordSchema.parse(record)
    expect(result.pushPolicy?.mode).toBe('unrestricted')
    expect(result.pushPolicy?.allowedBranchPatterns).toEqual([])
  })

  it('rejects an invalid mode', () => {
    const record = {
      ...baseRecord,
      pushPolicy: {
        mode: 'invalidMode',
        allowedBranchPatterns: [],
        blockedBranchPatterns: [],
      },
    }
    expect(() => RepositoryRecordSchema.parse(record)).toThrow()
  })

  it('RepositoryPushPolicySchema rejects missing required fields', () => {
    expect(() => RepositoryPushPolicySchema.parse({ mode: 'branchScoped' })).toThrow()
  })
})
