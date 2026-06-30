import { describe, it, expect } from 'vitest'
import { safetyCheckService } from '../../src/core/safety/SafetyCheckService.js'
import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitRemote,
  SafetyIssue,
} from '../../src/core/types.js'

// Alias-aware REMOTE_HOST_MISMATCH check (ADR 0009). A remote matches an expected host OR
// the active profile's declared ssh alias, so a correctly alias-bound SSH remote does not
// trip a false mismatch — while an unrelated host still blocks.

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

function makeIdentity(): EffectiveGitIdentity {
  return {
    userName: 'Work User',
    userEmail: 'work@example.com',
    nameSource: 'local',
    emailSource: 'local',
  }
}

function remoteWithHost(host: string): GitRemote {
  return { name: 'origin', url: `git@${host}:org/repo.git`, host }
}

function codes(issues: SafetyIssue[]): string[] {
  return issues.map((i) => i.code)
}

/** A clean push input where the ONLY variable is the remote host. */
function pushInput(profile: Profile, remoteHost: string) {
  return {
    repository: makeRepo(),
    activeProfile: profile,
    identity: makeIdentity(),
    remotes: [remoteWithHost(remoteHost)],
    currentBranch: 'main',
  }
}

describe('checkPush — alias-aware REMOTE_HOST_MISMATCH', () => {
  it('accepts a remote whose host equals the profile sshKeyAlias (bound remote)', () => {
    const profile = makeProfile({
      expectedRemoteHosts: ['github.com'],
      sshKeyAlias: 'github.com-work',
    })
    const result = safetyCheckService.checkPush(pushInput(profile, 'github.com-work'))
    expect(codes(result.issues)).not.toContain('REMOTE_HOST_MISMATCH')
    expect(result.canPush).toBe(true)
  })

  it('still accepts a remote whose host is in expectedRemoteHosts', () => {
    const profile = makeProfile({
      expectedRemoteHosts: ['github.com'],
      sshKeyAlias: 'github.com-work',
    })
    const result = safetyCheckService.checkPush(pushInput(profile, 'github.com'))
    expect(codes(result.issues)).not.toContain('REMOTE_HOST_MISMATCH')
  })

  it('fires REMOTE_HOST_MISMATCH when the host matches neither the alias nor expectedRemoteHosts', () => {
    const profile = makeProfile({
      expectedRemoteHosts: ['github.com'],
      sshKeyAlias: 'github.com-work',
    })
    const result = safetyCheckService.checkPush(pushInput(profile, 'gitlab.com'))
    expect(codes(result.issues)).toContain('REMOTE_HOST_MISMATCH')
    expect(result.canPush).toBe(false)
  })

  it('without an alias, an alias-shaped host is NOT accepted (alias is what enables the match)', () => {
    const profile = makeProfile({ expectedRemoteHosts: ['github.com'] }) // no sshKeyAlias
    const result = safetyCheckService.checkPush(pushInput(profile, 'github.com-work'))
    expect(codes(result.issues)).toContain('REMOTE_HOST_MISMATCH')
  })

  it('does not run the host check when the profile has no expectedRemoteHosts, even with an alias set', () => {
    const profile = makeProfile({ expectedRemoteHosts: [], sshKeyAlias: 'github.com-work' })
    const result = safetyCheckService.checkPush(pushInput(profile, 'github.com'))
    expect(codes(result.issues)).not.toContain('REMOTE_HOST_MISMATCH')
  })
})
