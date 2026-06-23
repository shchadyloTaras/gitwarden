import { describe, it, expect } from 'vitest'
import {
  safetyCheckService,
  SAFETY_MESSAGES,
  type SafetyCode,
} from '../../src/core/safety/SafetyCheckService.js'
import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitStatus,
  GitRemote,
  SafetyIssue,
} from '../../src/core/types.js'

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

function makeStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    files: [{ path: 'src/index.ts', indexStatus: 'modified', worktreeStatus: 'unmodified' }],
    branch: 'main',
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

function makeRemote(overrides: Partial<GitRemote> = {}): GitRemote {
  return { name: 'origin', url: 'git@github.com:org/repo.git', host: 'github.com', ...overrides }
}

function codes(issues: SafetyIssue[]): string[] {
  return issues.map((i) => i.code)
}

function blockers(issues: SafetyIssue[]): string[] {
  return issues.filter((i) => i.severity === 'blocker').map((i) => i.code)
}

function warnings(issues: SafetyIssue[]): string[] {
  return issues.filter((i) => i.severity === 'warning').map((i) => i.code)
}

// ── SAFETY_MESSAGES export ───────────────────────────────────────────────────

describe('SAFETY_MESSAGES', () => {
  it('has a non-empty message for every issue code', () => {
    const requiredCodes: SafetyCode[] = [
      'NO_ACTIVE_PROFILE',
      'REPO_UNASSIGNED',
      'PROFILE_MISMATCH',
      'IDENTITY_UNSET',
      'EMAIL_MISMATCH',
      'EMAIL_FROM_GLOBAL_ONLY',
      'NOTHING_STAGED',
      'EMPTY_MESSAGE',
      'HAS_CONFLICTS',
      'NO_REMOTE',
      'REMOTE_HOST_MISMATCH',
    ]
    for (const code of requiredCodes) {
      expect(SAFETY_MESSAGES[code], `missing message for ${code}`).toBeTruthy()
    }
  })
})

// ── checkRepositoryIdentity ──────────────────────────────────────────────────

describe('checkRepositoryIdentity', () => {
  it('returns clean result when everything matches', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile(),
      identity: makeIdentity(),
    })
    expect(result.canCommit).toBe(true)
    expect(result.canPush).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('blocks when there is no active profile', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: undefined,
      identity: makeIdentity(),
    })
    expect(result.canCommit).toBe(false)
    expect(result.canPush).toBe(false)
    expect(codes(result.issues)).toContain('NO_ACTIVE_PROFILE')
  })

  it('emits only NO_ACTIVE_PROFILE when profile is absent (no further checks)', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo({ assignedProfileId: undefined }),
      activeProfile: undefined,
      identity: makeIdentity({ userName: undefined }),
    })
    expect(codes(result.issues)).toEqual(['NO_ACTIVE_PROFILE'])
  })

  it('blocks when repository has no assigned profile', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo({ assignedProfileId: undefined }),
      activeProfile: makeProfile(),
      identity: makeIdentity(),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('REPO_UNASSIGNED')
  })

  it('blocks when active profile does not match assigned profile', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo({ assignedProfileId: 'profile-personal' }),
      activeProfile: makeProfile({ id: 'profile-work' }),
      identity: makeIdentity(),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('PROFILE_MISMATCH')
  })

  it('does not emit PROFILE_MISMATCH when ids match', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo({ assignedProfileId: 'profile-work' }),
      activeProfile: makeProfile({ id: 'profile-work' }),
      identity: makeIdentity(),
    })
    expect(codes(result.issues)).not.toContain('PROFILE_MISMATCH')
  })

  it('blocks when userName is missing from identity', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile(),
      identity: makeIdentity({ userName: undefined }),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('IDENTITY_UNSET')
  })

  it('blocks when userEmail is missing from identity', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile(),
      identity: makeIdentity({ userEmail: undefined }),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('IDENTITY_UNSET')
  })

  it('does not emit EMAIL_MISMATCH or EMAIL_FROM_GLOBAL_ONLY when IDENTITY_UNSET fires', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile(),
      identity: makeIdentity({ userEmail: undefined }),
    })
    expect(codes(result.issues)).not.toContain('EMAIL_MISMATCH')
    expect(codes(result.issues)).not.toContain('EMAIL_FROM_GLOBAL_ONLY')
  })

  it('warns (not blocks) when email does not match profile', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile({ gitAuthorEmail: 'work@example.com' }),
      identity: makeIdentity({ userEmail: 'personal@example.com' }),
    })
    expect(result.canCommit).toBe(true) // warning, not blocker
    expect(warnings(result.issues)).toContain('EMAIL_MISMATCH')
    expect(blockers(result.issues)).not.toContain('EMAIL_MISMATCH')
  })

  it('warns (not blocks) when email is from global config', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile(),
      identity: makeIdentity({ emailSource: 'global' }),
    })
    expect(result.canCommit).toBe(true)
    expect(warnings(result.issues)).toContain('EMAIL_FROM_GLOBAL_ONLY')
  })

  it('emits both EMAIL_MISMATCH and EMAIL_FROM_GLOBAL_ONLY together', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile({ gitAuthorEmail: 'work@example.com' }),
      identity: makeIdentity({ userEmail: 'personal@example.com', emailSource: 'global' }),
    })
    expect(warnings(result.issues)).toContain('EMAIL_MISMATCH')
    expect(warnings(result.issues)).toContain('EMAIL_FROM_GLOBAL_ONLY')
    expect(result.canCommit).toBe(true) // both are warnings
  })

  it('does not emit EMAIL_FROM_GLOBAL_ONLY when emailSource is undefined', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo(),
      activeProfile: makeProfile(),
      identity: makeIdentity({ emailSource: undefined }),
    })
    expect(codes(result.issues)).not.toContain('EMAIL_FROM_GLOBAL_ONLY')
  })

  it('accumulates multiple blockers', () => {
    const result = safetyCheckService.checkRepositoryIdentity({
      repository: makeRepo({ assignedProfileId: 'other-profile' }),
      activeProfile: makeProfile({ id: 'profile-work' }),
      identity: makeIdentity({ userName: undefined }),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('PROFILE_MISMATCH')
    expect(codes(result.issues)).toContain('IDENTITY_UNSET')
  })
})

// ── checkCommit ──────────────────────────────────────────────────────────────

describe('checkCommit', () => {
  const goodInput = {
    repository: makeRepo(),
    activeProfile: makeProfile(),
    identity: makeIdentity(),
    status: makeStatus(),
    commitMessage: 'feat: add login flow',
  }

  it('returns canCommit=true and canPush=true when everything is clean', () => {
    const result = safetyCheckService.checkCommit(goodInput)
    expect(result.canCommit).toBe(true)
    expect(result.canPush).toBe(true) // not evaluated by commit check
    expect(result.issues).toHaveLength(0)
  })

  it('blocks when nothing is staged', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      status: makeStatus({ files: [] }),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('NOTHING_STAGED')
  })

  it('blocks when only untracked files exist (none staged)', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      status: makeStatus({
        files: [{ path: 'new.ts', indexStatus: 'untracked', worktreeStatus: 'untracked' }],
      }),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('NOTHING_STAGED')
  })

  it('does not block when a file is staged (added)', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      status: makeStatus({
        files: [{ path: 'new.ts', indexStatus: 'added', worktreeStatus: 'unmodified' }],
      }),
    })
    expect(codes(result.issues)).not.toContain('NOTHING_STAGED')
  })

  it('does not block when a file is staged (deleted)', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      status: makeStatus({
        files: [{ path: 'old.ts', indexStatus: 'deleted', worktreeStatus: 'unmodified' }],
      }),
    })
    expect(codes(result.issues)).not.toContain('NOTHING_STAGED')
  })

  it('blocks on empty commit message', () => {
    const result = safetyCheckService.checkCommit({ ...goodInput, commitMessage: '' })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('EMPTY_MESSAGE')
  })

  it('blocks on whitespace-only commit message', () => {
    const result = safetyCheckService.checkCommit({ ...goodInput, commitMessage: '   \t\n' })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('EMPTY_MESSAGE')
  })

  it('blocks when there are conflict markers in status', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      status: makeStatus({
        files: [
          { path: 'src/index.ts', indexStatus: 'modified', worktreeStatus: 'unmodified' },
          { path: 'README.md', indexStatus: 'conflicted', worktreeStatus: 'conflicted' },
        ],
      }),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('HAS_CONFLICTS')
  })

  it('propagates identity issues from checkRepositoryIdentity', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      activeProfile: undefined,
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('NO_ACTIVE_PROFILE')
  })

  it('accumulates profile mismatch and nothing-staged together', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      repository: makeRepo({ assignedProfileId: 'other' }),
      status: makeStatus({ files: [] }),
    })
    expect(result.canCommit).toBe(false)
    expect(codes(result.issues)).toContain('PROFILE_MISMATCH')
    expect(codes(result.issues)).toContain('NOTHING_STAGED')
  })

  it('accumulates all three commit-specific issues at once', () => {
    const result = safetyCheckService.checkCommit({
      ...goodInput,
      status: makeStatus({
        files: [{ path: 'f', indexStatus: 'conflicted', worktreeStatus: 'conflicted' }],
      }),
      commitMessage: '',
    })
    // Has conflicts means NOTHING_STAGED fires (conflict is not staged), and EMPTY_MESSAGE fires
    expect(codes(result.issues)).toContain('NOTHING_STAGED')
    expect(codes(result.issues)).toContain('EMPTY_MESSAGE')
    expect(codes(result.issues)).toContain('HAS_CONFLICTS')
  })
})

// ── checkPush ────────────────────────────────────────────────────────────────

describe('checkPush', () => {
  const goodInput = {
    repository: makeRepo(),
    activeProfile: makeProfile({ expectedRemoteHosts: ['github.com'] }),
    identity: makeIdentity(),
    remotes: [makeRemote()],
    currentBranch: 'main',
  }

  it('returns canPush=true and canCommit=true when everything is clean', () => {
    const result = safetyCheckService.checkPush(goodInput)
    expect(result.canPush).toBe(true)
    expect(result.canCommit).toBe(true) // not evaluated by push check
    expect(result.issues).toHaveLength(0)
  })

  it('warns (not blocks) when no remotes are configured', () => {
    const result = safetyCheckService.checkPush({ ...goodInput, remotes: [] })
    expect(result.canPush).toBe(true) // NO_REMOTE is a warning
    expect(warnings(result.issues)).toContain('NO_REMOTE')
    expect(blockers(result.issues)).not.toContain('NO_REMOTE')
  })

  it('blocks when remote host does not match any expected host', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      remotes: [makeRemote({ host: 'github.com-personal' })],
      activeProfile: makeProfile({ expectedRemoteHosts: ['github.com-work'] }),
    })
    expect(result.canPush).toBe(false)
    expect(codes(result.issues)).toContain('REMOTE_HOST_MISMATCH')
  })

  it('does not block when remote host matches', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      remotes: [makeRemote({ host: 'github.com' })],
      activeProfile: makeProfile({ expectedRemoteHosts: ['github.com'] }),
    })
    expect(result.canPush).toBe(true)
    expect(codes(result.issues)).not.toContain('REMOTE_HOST_MISMATCH')
  })

  it('does not block when profile has no expectedRemoteHosts (skip check)', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      remotes: [makeRemote({ host: 'github.com-anything' })],
      activeProfile: makeProfile({ expectedRemoteHosts: [] }),
    })
    expect(codes(result.issues)).not.toContain('REMOTE_HOST_MISMATCH')
  })

  it('passes when at least one of multiple remotes matches', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      remotes: [
        makeRemote({ name: 'origin', host: 'github.com-personal' }),
        makeRemote({ name: 'work', host: 'github.com' }),
      ],
      activeProfile: makeProfile({ expectedRemoteHosts: ['github.com'] }),
    })
    expect(result.canPush).toBe(true)
    expect(codes(result.issues)).not.toContain('REMOTE_HOST_MISMATCH')
  })

  it('blocks when no remote has a host field set', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      remotes: [makeRemote({ host: undefined })],
      activeProfile: makeProfile({ expectedRemoteHosts: ['github.com'] }),
    })
    expect(result.canPush).toBe(false)
    expect(codes(result.issues)).toContain('REMOTE_HOST_MISMATCH')
  })

  it('propagates identity issues into push result', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      activeProfile: undefined,
    })
    expect(result.canPush).toBe(false)
    expect(codes(result.issues)).toContain('NO_ACTIVE_PROFILE')
  })

  it('accumulates profile mismatch and remote host mismatch', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      repository: makeRepo({ assignedProfileId: 'other' }),
      remotes: [makeRemote({ host: 'github.com-personal' })],
      activeProfile: makeProfile({ id: 'profile-work', expectedRemoteHosts: ['github.com-work'] }),
    })
    expect(result.canPush).toBe(false)
    expect(codes(result.issues)).toContain('PROFILE_MISMATCH')
    expect(codes(result.issues)).toContain('REMOTE_HOST_MISMATCH')
  })

  it('warns on global email alongside remote host mismatch', () => {
    const result = safetyCheckService.checkPush({
      ...goodInput,
      identity: makeIdentity({ emailSource: 'global' }),
      remotes: [makeRemote({ host: 'github.com-wrong' })],
    })
    expect(warnings(result.issues)).toContain('EMAIL_FROM_GLOBAL_ONLY')
    expect(blockers(result.issues)).toContain('REMOTE_HOST_MISMATCH')
    expect(result.canPush).toBe(false)
  })
})
