import { describe, it, expect } from 'vitest'
import { deriveHeaderGuard, type HeaderGuardInput } from '../../src/core/safety/headerGuard.js'
import type { Profile, RepositoryRecord, EffectiveGitIdentity } from '../../src/core/types.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-work',
    displayName: 'Work',
    gitAuthorName: 'Work User',
    gitAuthorEmail: 'work@example.com',
    githubUsername: 'work-user',
    authenticationMethod: 'ssh',
    expectedRemoteHosts: ['github.com'],
    ...overrides,
  }
}

function makeRepo(overrides: Partial<RepositoryRecord> = {}): RepositoryRecord {
  return {
    id: 'repo-1',
    name: 'my-repo',
    localPath: '/path/to/repo',
    assignedProfileId: 'profile-work',
    isFavorite: false,
    ...overrides,
  }
}

function makeIdentity(overrides: Partial<EffectiveGitIdentity> = {}): EffectiveGitIdentity {
  return {
    userName: 'Work User',
    userEmail: 'work@example.com',
    nameSource: 'local',
    emailSource: 'local',
    ...overrides,
  }
}

/** A fully aligned input: repo assigned to the active profile, local matching identity. */
function readyInput(overrides: Partial<HeaderGuardInput> = {}): HeaderGuardInput {
  return {
    loading: false,
    hasRepo: true,
    errored: false,
    repository: makeRepo(),
    activeProfile: makeProfile(),
    identity: makeIdentity(),
    ...overrides,
  }
}

// ── deriveHeaderGuard ─────────────────────────────────────────────────────────

describe('deriveHeaderGuard', () => {
  it('clean, aligned identity → ready with no issues', () => {
    const guard = deriveHeaderGuard(readyInput())
    expect(guard).toEqual({ state: 'ready', issueCount: 0 })
  })

  describe('review (warnings only)', () => {
    it('EMAIL_MISMATCH → review', () => {
      const guard = deriveHeaderGuard(
        readyInput({ identity: makeIdentity({ userEmail: 'other@example.com' }) })
      )
      expect(guard.state).toBe('review')
      expect(guard.issueCount).toBe(1)
    })

    it('global-only identity (emailSource !== local) → review', () => {
      const guard = deriveHeaderGuard(
        readyInput({ identity: makeIdentity({ emailSource: 'global' }) })
      )
      expect(guard.state).toBe('review')
      expect(guard.issueCount).toBe(1)
    })
  })

  describe('blocked (any blocker)', () => {
    it('REPO_UNASSIGNED → blocked', () => {
      const guard = deriveHeaderGuard(
        readyInput({ repository: makeRepo({ assignedProfileId: undefined }) })
      )
      expect(guard.state).toBe('blocked')
      expect(guard.issueCount).toBe(1)
    })

    it('PROFILE_MISMATCH → blocked', () => {
      const guard = deriveHeaderGuard(
        readyInput({ activeProfile: makeProfile({ id: 'profile-personal' }) })
      )
      expect(guard.state).toBe('blocked')
      expect(guard.issueCount).toBe(1)
    })

    it('IDENTITY_UNSET (empty userName/userEmail) → blocked, NOT not-checked', () => {
      const guard = deriveHeaderGuard(
        readyInput({ identity: makeIdentity({ userName: '', userEmail: '' }) })
      )
      expect(guard.state).toBe('blocked')
      expect(guard.issueCount).toBe(1)
    })

    it('no active profile → blocked', () => {
      const guard = deriveHeaderGuard(readyInput({ activeProfile: null }))
      expect(guard.state).toBe('blocked')
      expect(guard.issueCount).toBe(1)
    })
  })

  describe('checking / not-checked', () => {
    it('loading:true → checking', () => {
      expect(deriveHeaderGuard(readyInput({ loading: true }))).toEqual({
        state: 'checking',
        issueCount: 0,
      })
    })

    it('hasRepo:false → not-checked', () => {
      expect(deriveHeaderGuard(readyInput({ hasRepo: false }))).toEqual({
        state: 'not-checked',
        issueCount: 0,
      })
    })

    it('errored:true → not-checked', () => {
      expect(deriveHeaderGuard(readyInput({ errored: true }))).toEqual({
        state: 'not-checked',
        issueCount: 0,
      })
    })

    it('identity:null → not-checked', () => {
      expect(deriveHeaderGuard(readyInput({ identity: null }))).toEqual({
        state: 'not-checked',
        issueCount: 0,
      })
    })
  })

  it('structural guarantee: an otherwise-ready input stays ready — commit/push state has no input surface', () => {
    // The mapper only accepts identity context (repository/profile/identity). Staging,
    // remotes, and commit message are never passed in, so they can never reach
    // checkRepositoryIdentity. This documents that the header can never inherit a
    // NOTHING_STAGED / NO_REMOTE / EMPTY_MESSAGE verdict.
    expect(deriveHeaderGuard(readyInput()).state).toBe('ready')
  })

  it('issueCount equals the number of identity issues', () => {
    // Both EMAIL_MISMATCH (email differs) and EMAIL_FROM_GLOBAL_ONLY (global source) fire:
    // two warnings → review, issueCount 2.
    const guard = deriveHeaderGuard(
      readyInput({
        identity: makeIdentity({ userEmail: 'other@example.com', emailSource: 'global' }),
      })
    )
    expect(guard.state).toBe('review')
    expect(guard.issueCount).toBe(2)
  })
})
