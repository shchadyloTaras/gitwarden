import { describe, it, expect } from 'vitest'
import { safetyCheckService } from '../../src/core/safety/SafetyCheckService.js'
import type { GitHubPushContext } from '../../src/core/safety/SafetyCheckService.js'
import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitRemote,
} from '../../src/core/types.js'

// A clean identity baseline so only the GitHub codes are under test here — the
// identity/host matrix is covered in safety-engine.test.ts.
const profile: Profile = {
  id: 'p1',
  displayName: 'Work',
  gitAuthorName: 'Alice',
  gitAuthorEmail: 'alice@work.com',
  githubUsername: 'alice',
  authenticationMethod: 'token',
  expectedRemoteHosts: [],
  linkedGitHub: { login: 'alice', accountId: 1, scopes: [], connectedAt: '2026-01-01T00:00:00Z' },
}

const repository: RepositoryRecord = {
  id: 'r1',
  name: 'repo',
  localPath: '/tmp/repo',
  assignedProfileId: 'p1',
  isFavorite: false,
}

const identity: EffectiveGitIdentity = {
  userName: 'Alice',
  userEmail: 'alice@work.com',
  nameSource: 'local',
  emailSource: 'local',
}

const httpsRemote: GitRemote = {
  name: 'origin',
  url: 'https://github.com/alice/repo.git',
  host: 'github.com',
}

function check(github?: GitHubPushContext) {
  return safetyCheckService.checkPush({
    repository,
    activeProfile: profile,
    identity,
    remotes: [httpsRemote],
    currentBranch: 'main',
    github,
  })
}

function codes(github?: GitHubPushContext): string[] {
  return check(github).issues.map((i) => i.code)
}

describe('checkPush — GitHub HTTPS-token matrix', () => {
  it('MATCH: linked account equals the token account → no GitHub issue, canPush', () => {
    const result = check({
      httpsToGitHub: true,
      hasToken: true,
      assignedLogin: 'alice',
      effectiveLogin: 'alice',
    })
    expect(result.issues.map((i) => i.code)).not.toContain('GITHUB_ACCOUNT_MISMATCH')
    expect(result.issues.some((i) => i.code.startsWith('GITHUB_'))).toBe(false)
    expect(result.canPush).toBe(true)
  })

  it('MISMATCH: token account differs from the assigned account → blocker, cannot push', () => {
    const result = check({
      httpsToGitHub: true,
      hasToken: true,
      assignedLogin: 'alice',
      effectiveLogin: 'mallory',
    })
    const issue = result.issues.find((i) => i.code === 'GITHUB_ACCOUNT_MISMATCH')
    expect(issue).toBeTruthy()
    expect(issue?.severity).toBe('blocker')
    expect(result.canPush).toBe(false)
  })

  it('MISSING: linked profile but no stored token → blocker, cannot push', () => {
    const result = check({ httpsToGitHub: true, hasToken: false, assignedLogin: 'alice' })
    const issue = result.issues.find((i) => i.code === 'GITHUB_TOKEN_MISSING')
    expect(issue?.severity).toBe('blocker')
    expect(result.canPush).toBe(false)
  })

  it('INVALID: stored token was rejected (401) → blocker, cannot push', () => {
    const result = check({
      httpsToGitHub: true,
      hasToken: true,
      assignedLogin: 'alice',
      tokenInvalid: true,
    })
    const issue = result.issues.find((i) => i.code === 'GITHUB_TOKEN_INVALID')
    expect(issue?.severity).toBe('blocker')
    expect(result.canPush).toBe(false)
  })

  it('NOT_CONNECTED: HTTPS push but profile has no linked account → warning, still pushable', () => {
    const result = check({ httpsToGitHub: true, hasToken: false })
    const issue = result.issues.find((i) => i.code === 'GITHUB_NOT_CONNECTED')
    expect(issue?.severity).toBe('warning')
    // A lone warning does not block the push.
    expect(result.canPush).toBe(true)
  })

  it('SSH/non-GitHub push is unaffected — no GitHub codes even with a token present', () => {
    expect(
      codes({
        httpsToGitHub: false,
        hasToken: true,
        assignedLogin: 'alice',
        effectiveLogin: 'mallory',
      })
    ).not.toContain('GITHUB_ACCOUNT_MISMATCH')
    expect(codes({ httpsToGitHub: false, hasToken: false })).not.toContain('GITHUB_NOT_CONNECTED')
  })

  it('omitting the github context entirely leaves checkPush backward-compatible', () => {
    expect(codes(undefined).filter((c) => c.startsWith('GITHUB_'))).toHaveLength(0)
  })

  it('MISMATCH still blocks even when the underlying profile/identity checks pass', () => {
    // Sanity: no identity blockers here, so the only blocker is the GitHub account one.
    const result = check({
      httpsToGitHub: true,
      hasToken: true,
      assignedLogin: 'alice',
      effectiveLogin: 'mallory',
    })
    const blockers = result.issues.filter((i) => i.severity === 'blocker')
    expect(blockers).toHaveLength(1)
    expect(blockers[0].code).toBe('GITHUB_ACCOUNT_MISMATCH')
  })
})
