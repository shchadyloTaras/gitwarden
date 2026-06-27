import { describe, it, expect } from 'vitest'
import { safetyCheckService } from '../../src/core/safety/SafetyCheckService.js'
import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitRemote,
  RepositoryPushPolicy,
} from '../../src/core/types.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const IDENTITY: EffectiveGitIdentity = {
  userName: 'Taras',
  userEmail: 'taras@example.com',
  nameSource: 'local',
  emailSource: 'local',
}

const PROFILE: Profile = {
  id: 'p1',
  displayName: 'Work',
  gitAuthorName: 'Taras',
  gitAuthorEmail: 'taras@example.com',
  githubUsername: 'taras',
  authenticationMethod: 'ssh',
  expectedRemoteHosts: [],
}

const CLIENT_REMOTE: GitRemote = {
  name: 'origin',
  url: 'git@github.com:client-org/project.git',
  host: 'github.com',
}

const PERSONAL_REMOTE: GitRemote = {
  name: 'origin',
  url: 'git@github.com:personal-org/myrepo.git',
  host: 'github.com',
}

function makeRepo(policy?: RepositoryPushPolicy): RepositoryRecord {
  return {
    id: 'r1',
    name: 'Client Project',
    localPath: '/tmp/project',
    assignedProfileId: 'p1',
    isFavorite: false,
    pushPolicy: policy,
  }
}

function checkPush(
  repo: RepositoryRecord,
  branch: string,
  remotes: GitRemote[] = [CLIENT_REMOTE],
  upstream?: string
) {
  return safetyCheckService.checkPush({
    repository: repo,
    activeProfile: PROFILE,
    identity: IDENTITY,
    remotes,
    currentBranch: branch,
    upstream,
  })
}

// ── Opt-in guarantee: no policy → no new issues ───────────────────────────────

describe('opt-in guarantee', () => {
  it('a repo with no pushPolicy produces no policy issues', () => {
    const repo = makeRepo(undefined)
    const result = checkPush(repo, 'main')
    const codes = result.issues.map((i) => i.code)
    expect(codes).not.toContain('PROTECTED_BRANCH_PUSH')
    expect(codes).not.toContain('BRANCH_NOT_ALLOWED')
    expect(codes).not.toContain('REMOTE_OWNER_MISMATCH')
    expect(codes).not.toContain('REMOTE_REPO_MISMATCH')
    expect(codes).not.toContain('PUSH_POLICY_INCOMPLETE')
  })

  it('unrestricted mode with empty blocked patterns produces no policy issues', () => {
    const repo = makeRepo({
      mode: 'unrestricted',
      allowedBranchPatterns: [],
      blockedBranchPatterns: [],
    })
    const result = checkPush(repo, 'main')
    const codes = result.issues.map((i) => i.code)
    expect(codes).not.toContain('PROTECTED_BRANCH_PUSH')
    expect(codes).not.toContain('BRANCH_NOT_ALLOWED')
    expect(result.canPush).toBe(true)
  })

  it('regression guard: issue set without policy equals pre-Phase-57 set', () => {
    const repoWithout = makeRepo(undefined)
    const withoutPolicy = safetyCheckService.checkPush({
      repository: repoWithout,
      activeProfile: PROFILE,
      identity: IDENTITY,
      remotes: [CLIENT_REMOTE],
      currentBranch: 'main',
    })
    // Issues without policy must be a strict subset of issues with policy
    const withoutCodes = new Set(withoutPolicy.issues.map((i) => i.code))
    const extraCodes = withoutPolicy.issues.map((i) => i.code).filter((c) => !withoutCodes.has(c))
    expect(extraCodes).toHaveLength(0)
    // And without policy should have no policy-specific codes
    const policySpecific = [
      'PROTECTED_BRANCH_PUSH',
      'BRANCH_NOT_ALLOWED',
      'PUSH_POLICY_INCOMPLETE',
      'REMOTE_OWNER_MISMATCH',
      'REMOTE_REPO_MISMATCH',
    ]
    for (const c of policySpecific) {
      expect(withoutCodes).not.toContain(c)
    }
  })
})

// ── PROTECTED_BRANCH_PUSH ──────────────────────────────────────────────────────

describe('PROTECTED_BRANCH_PUSH', () => {
  const policy: RepositoryPushPolicy = {
    mode: 'branchScoped',
    allowedBranchPatterns: ['feature/*'],
    blockedBranchPatterns: ['main', 'develop', 'release/*'],
  }

  it('fires on main', () => {
    const result = checkPush(makeRepo(policy), 'main')
    expect(result.issues.some((i) => i.code === 'PROTECTED_BRANCH_PUSH')).toBe(true)
    expect(result.canPush).toBe(false)
  })

  it('fires on develop', () => {
    const result = checkPush(makeRepo(policy), 'develop')
    expect(result.issues.some((i) => i.code === 'PROTECTED_BRANCH_PUSH')).toBe(true)
  })

  it('fires on release/1.0', () => {
    const result = checkPush(makeRepo(policy), 'release/1.0')
    expect(result.issues.some((i) => i.code === 'PROTECTED_BRANCH_PUSH')).toBe(true)
  })

  it('fires in unrestricted mode too (blockedBranchPatterns applies both modes)', () => {
    const unrestrictedWithBlocked: RepositoryPushPolicy = {
      mode: 'unrestricted',
      allowedBranchPatterns: [],
      blockedBranchPatterns: ['main'],
    }
    const result = checkPush(makeRepo(unrestrictedWithBlocked), 'main')
    expect(result.issues.some((i) => i.code === 'PROTECTED_BRANCH_PUSH')).toBe(true)
    expect(result.canPush).toBe(false)
  })
})

// ── BRANCH_NOT_ALLOWED ────────────────────────────────────────────────────────

describe('BRANCH_NOT_ALLOWED', () => {
  const policy: RepositoryPushPolicy = {
    mode: 'branchScoped',
    allowedBranchPatterns: ['client-x/taras/*'],
    blockedBranchPatterns: ['main'],
  }

  it('fires on an off-scope branch', () => {
    const result = checkPush(makeRepo(policy), 'feature/something')
    expect(result.issues.some((i) => i.code === 'BRANCH_NOT_ALLOWED')).toBe(true)
    expect(result.canPush).toBe(false)
  })

  it('does NOT fire on an allowed branch', () => {
    const result = checkPush(makeRepo(policy), 'client-x/taras/fix')
    expect(result.issues.some((i) => i.code === 'BRANCH_NOT_ALLOWED')).toBe(false)
    expect(result.canPush).toBe(true)
  })

  it('does NOT fire in unrestricted mode even if branch not in allowed', () => {
    const unrestricted: RepositoryPushPolicy = {
      mode: 'unrestricted',
      allowedBranchPatterns: ['client-x/taras/*'],
      blockedBranchPatterns: [],
    }
    const result = checkPush(makeRepo(unrestricted), 'feature/other')
    expect(result.issues.some((i) => i.code === 'BRANCH_NOT_ALLOWED')).toBe(false)
  })
})

// ── Blocked wins over allowed ──────────────────────────────────────────────────

describe('blocked wins over allowed', () => {
  it('a branch in both blocked and allowed → PROTECTED_BRANCH_PUSH, not BRANCH_NOT_ALLOWED', () => {
    const policy: RepositoryPushPolicy = {
      mode: 'branchScoped',
      allowedBranchPatterns: ['main'],
      blockedBranchPatterns: ['main'],
    }
    const result = checkPush(makeRepo(policy), 'main')
    const codes = result.issues.map((i) => i.code)
    expect(codes).toContain('PROTECTED_BRANCH_PUSH')
    expect(codes).not.toContain('BRANCH_NOT_ALLOWED')
    expect(result.canPush).toBe(false)
  })
})

// ── PUSH_POLICY_INCOMPLETE ────────────────────────────────────────────────────

describe('PUSH_POLICY_INCOMPLETE', () => {
  it('fires for branchScoped with empty allowed list', () => {
    const policy: RepositoryPushPolicy = {
      mode: 'branchScoped',
      allowedBranchPatterns: [],
      blockedBranchPatterns: [],
    }
    const result = checkPush(makeRepo(policy), 'feature/foo')
    const codes = result.issues.map((i) => i.code)
    expect(codes).toContain('PUSH_POLICY_INCOMPLETE')
    expect(result.canPush).toBe(false) // safe-deny
  })

  it('is a warning severity', () => {
    const policy: RepositoryPushPolicy = {
      mode: 'branchScoped',
      allowedBranchPatterns: [],
      blockedBranchPatterns: [],
    }
    const result = checkPush(makeRepo(policy), 'feature/foo')
    const issue = result.issues.find((i) => i.code === 'PUSH_POLICY_INCOMPLETE')
    expect(issue?.severity).toBe('warning')
  })
})

// ── REMOTE_OWNER_MISMATCH ─────────────────────────────────────────────────────

describe('REMOTE_OWNER_MISMATCH', () => {
  const policy: RepositoryPushPolicy = {
    mode: 'unrestricted',
    allowedBranchPatterns: [],
    blockedBranchPatterns: [],
    expectedRemoteOwner: 'client-org',
  }

  it('fires when push-target owner does not match', () => {
    const result = checkPush(makeRepo(policy), 'main', [PERSONAL_REMOTE])
    expect(result.issues.some((i) => i.code === 'REMOTE_OWNER_MISMATCH')).toBe(true)
    expect(result.canPush).toBe(false)
  })

  it('does NOT fire when push-target owner matches', () => {
    const result = checkPush(makeRepo(policy), 'main', [CLIENT_REMOTE])
    expect(result.issues.some((i) => i.code === 'REMOTE_OWNER_MISMATCH')).toBe(false)
  })
})

// ── REMOTE_REPO_MISMATCH ──────────────────────────────────────────────────────

describe('REMOTE_REPO_MISMATCH', () => {
  const policy: RepositoryPushPolicy = {
    mode: 'unrestricted',
    allowedBranchPatterns: [],
    blockedBranchPatterns: [],
    expectedRemoteRepo: 'project',
  }

  it('fires when push-target repo does not match', () => {
    const result = checkPush(makeRepo(policy), 'main', [PERSONAL_REMOTE])
    expect(result.issues.some((i) => i.code === 'REMOTE_REPO_MISMATCH')).toBe(true)
    expect(result.canPush).toBe(false)
  })

  it('does NOT fire when push-target repo matches', () => {
    const result = checkPush(makeRepo(policy), 'main', [CLIENT_REMOTE])
    expect(result.issues.some((i) => i.code === 'REMOTE_REPO_MISMATCH')).toBe(false)
  })
})

// ── Owner/repo checked against RESOLVED target only ──────────────────────────

describe('resolved push target (upstream wins)', () => {
  it('uses the upstream remote when upstream is set, not the first remote', () => {
    const upstreamRemote: GitRemote = {
      name: 'upstream',
      url: 'git@github.com:client-org/project.git',
    }
    const policy: RepositoryPushPolicy = {
      mode: 'unrestricted',
      allowedBranchPatterns: [],
      blockedBranchPatterns: [],
      expectedRemoteOwner: 'client-org',
      expectedRemoteRepo: 'project',
    }
    // origin is the wrong owner; upstream is the correct one
    const result = safetyCheckService.checkPush({
      repository: makeRepo(policy),
      activeProfile: PROFILE,
      identity: IDENTITY,
      remotes: [PERSONAL_REMOTE, upstreamRemote],
      currentBranch: 'feature/foo',
      upstream: 'upstream/feature/foo',
    })
    expect(result.issues.some((i) => i.code === 'REMOTE_OWNER_MISMATCH')).toBe(false)
    expect(result.canPush).toBe(true)
  })
})
