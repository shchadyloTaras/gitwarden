import { describe, it, expect } from 'vitest'
import { checkCommitAndPush } from '../../../src/core/commitAndPush/gate.js'
import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitStatus,
  GitRemote,
} from '../../../src/core/types.js'

// ── Fixtures (mirrors tests/unit/safety-engine.test.ts conventions) ─────────────

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

function makeGateInput(
  overrides: {
    identity?: EffectiveGitIdentity
    status?: GitStatus
    commitMessage?: string
    remotes?: GitRemote[]
    currentBranch?: string
    existingOutgoing?: { authorName: string; authorEmail: string }[]
  } = {}
) {
  const profile = makeProfile()
  const repository = makeRepo()
  const identity = overrides.identity ?? makeIdentity()
  return {
    commit: {
      repository,
      activeProfile: profile,
      identity,
      status: overrides.status ?? makeStatus(),
      commitMessage: overrides.commitMessage ?? 'Fix the thing',
    },
    push: {
      repository,
      activeProfile: profile,
      identity,
      remotes: overrides.remotes ?? [makeRemote()],
      currentBranch: overrides.currentBranch ?? 'main',
      upstream: 'origin/main',
    },
    existingOutgoing: overrides.existingOutgoing,
  }
}

describe('checkCommitAndPush', () => {
  it('withholds the push verdict while existingOutgoing is undefined', () => {
    const verdict = checkCommitAndPush(makeGateInput({ existingOutgoing: undefined }))
    expect(verdict.push).toBeNull()
    expect(verdict.canCommitAndPush).toBe(false)
    // The commit verdict is still evaluated eagerly.
    expect(verdict.commit.canCommit).toBe(true)
  })

  it('allows commit and push when everything is clean', () => {
    const verdict = checkCommitAndPush(makeGateInput({ existingOutgoing: [] }))
    expect(verdict.commit.canCommit).toBe(true)
    expect(verdict.push?.canPush).toBe(true)
    expect(verdict.canCommitAndPush).toBe(true)
  })

  it('a commit blocker blocks canCommitAndPush even when push would be clean', () => {
    const verdict = checkCommitAndPush(
      makeGateInput({ existingOutgoing: [], commitMessage: '' }) // EMPTY_MESSAGE blocker
    )
    expect(verdict.commit.canCommit).toBe(false)
    expect(verdict.push?.canPush).toBe(true)
    expect(verdict.canCommitAndPush).toBe(false)
  })

  it('a push blocker blocks canCommitAndPush even when commit would be clean', () => {
    const verdict = checkCommitAndPush(
      makeGateInput({ existingOutgoing: [], remotes: [makeRemote({ host: 'gitlab.com' })] }) // REMOTE_HOST_MISMATCH blocker
    )
    expect(verdict.commit.canCommit).toBe(true)
    expect(verdict.push?.issues.some((i) => i.code === 'REMOTE_HOST_MISMATCH')).toBe(true)
    expect(verdict.push?.canPush).toBe(false)
    expect(verdict.canCommitAndPush).toBe(false)
  })

  it('projects the hypothetical new commit into the outgoing-authorship gate before it exists', () => {
    // The effective identity does not match the active profile's assigned author —
    // the about-to-be-created commit would itself be a wrong-author commit.
    const verdict = checkCommitAndPush(
      makeGateInput({
        identity: makeIdentity({ userName: 'Wrong User', userEmail: 'wrong@example.com' }),
        existingOutgoing: [],
      })
    )
    expect(verdict.push?.issues.some((i) => i.code === 'OUTGOING_WRONG_AUTHOR')).toBe(true)
    expect(verdict.push?.canPush).toBe(false)
    expect(verdict.canCommitAndPush).toBe(false)
  })

  it('an already-outgoing wrong-author commit blocks push even if the new one would be fine', () => {
    const verdict = checkCommitAndPush(
      makeGateInput({
        existingOutgoing: [{ authorName: 'Someone Else', authorEmail: 'someone@example.com' }],
      })
    )
    expect(verdict.push?.issues.some((i) => i.code === 'OUTGOING_WRONG_AUTHOR')).toBe(true)
    expect(verdict.canCommitAndPush).toBe(false)
  })
})
