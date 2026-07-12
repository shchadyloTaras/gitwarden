import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PushBriefService } from '../../src/main/ai/PushBriefService'
import type { IRepositoryService } from '../../src/main/services/RepositoryService'
import type { IProfileService } from '../../src/main/services/ProfileService'
import type { ISettingsService } from '../../src/main/services/SettingsService'
import type { GitService } from '../../src/main/services/GitService'
import type { IGitHubAuthCoordinator } from '../../src/main/ipc/GitHubAuthCoordinator'
import type { RepositoryRecord, Profile, AppSettings } from '../../src/core/types'

// Phase 104: PushBriefService.buildDeterministic must resolve the SAME real token
// facts the push sheet uses (GitHubAuthCoordinator.getPushContext) when the caller
// omits the `github` block — /push-brief (aiChatStore.ts) always omits it, so this is
// what stops "no stored token" from being reported minutes after a real token push.

const repo: RepositoryRecord = {
  id: 'repo-1',
  name: 'repo',
  localPath: '/tmp/repo',
  assignedProfileId: 'profile-1',
  isFavorite: false,
}

const profile: Profile = {
  id: 'profile-1',
  displayName: 'Work',
  gitAuthorName: 'Alice Dev',
  gitAuthorEmail: 'alice@example.com',
  githubUsername: 'alice',
  authenticationMethod: 'token',
  expectedRemoteHosts: ['github.com'],
  linkedGitHub: { login: 'alice', accountId: 1, scopes: [], connectedAt: '2026-01-01T00:00:00Z' },
}

const settings: AppSettings = {
  activeProfileId: 'profile-1',
  appearance: 'system',
}

describe('PushBriefService.buildDeterministic (Phase 104)', () => {
  let repositories: Pick<IRepositoryService, 'get'>
  let profiles: Pick<IProfileService, 'list'>
  let settingsService: Pick<ISettingsService, 'get'>
  let git: Pick<GitService, 'getCommitsAhead' | 'getRemotes' | 'getEffectiveIdentity'>
  let github: Pick<IGitHubAuthCoordinator, 'getPushContext'>

  beforeEach(() => {
    repositories = { get: vi.fn().mockResolvedValue(repo) }
    profiles = { list: vi.fn().mockResolvedValue([profile]) }
    settingsService = { get: vi.fn().mockResolvedValue(settings) }
    git = {
      getRemotes: vi
        .fn()
        .mockResolvedValue([{ name: 'origin', url: 'https://github.com/alice/repo.git' }]),
      getEffectiveIdentity: vi
        .fn()
        .mockResolvedValue({ userName: 'Alice Dev', userEmail: 'alice@example.com' }),
      getCommitsAhead: vi.fn().mockResolvedValue([]),
    }
    github = { getPushContext: vi.fn() }
  })

  function makeService(): PushBriefService {
    return new PushBriefService(
      repositories as IRepositoryService,
      profiles as IProfileService,
      settingsService as ISettingsService,
      git as GitService,
      github as IGitHubAuthCoordinator
    )
  }

  it('resolves real hasToken/effectiveLogin via getPushContext when the caller omits github', async () => {
    github.getPushContext = vi
      .fn()
      .mockResolvedValue({ hasToken: true, tokenInvalid: false, effectiveLogin: 'alice' })
    const service = makeService()

    const brief = await service.buildDeterministic({
      repositoryId: 'repo-1',
      remoteName: 'origin',
      branch: 'main',
    })

    expect(github.getPushContext).toHaveBeenCalledWith('profile-1')
    expect(brief.identityNote).toContain('@alice')
    expect(brief.identityNote).not.toMatch(/no stored token|not connected/i)
  })

  it('reports false (no token) when getPushContext says so, not a stale default', async () => {
    github.getPushContext = vi
      .fn()
      .mockResolvedValue({ hasToken: false, tokenInvalid: false, effectiveLogin: undefined })
    const service = makeService()

    const brief = await service.buildDeterministic({
      repositoryId: 'repo-1',
      remoteName: 'origin',
      branch: 'main',
    })

    expect(github.getPushContext).toHaveBeenCalledWith('profile-1')
    expect(brief.identityNote).toMatch(/no stored token|not connected/i)
  })

  it('does not call getPushContext when the caller already supplied a github block', async () => {
    const service = makeService()

    await service.buildDeterministic({
      repositoryId: 'repo-1',
      remoteName: 'origin',
      branch: 'main',
      github: { hasToken: true, tokenInvalid: false, effectiveLogin: 'alice' },
    })

    expect(github.getPushContext).not.toHaveBeenCalled()
  })

  it('does not call getPushContext for a non-GitHub-HTTPS remote (SSH)', async () => {
    git.getRemotes = vi
      .fn()
      .mockResolvedValue([{ name: 'origin', url: 'git@github.com:alice/repo.git' }])
    const service = makeService()

    await service.buildDeterministic({
      repositoryId: 'repo-1',
      remoteName: 'origin',
      branch: 'main',
    })

    expect(github.getPushContext).not.toHaveBeenCalled()
  })

  it('does not call getPushContext when the repo has no assigned profile', async () => {
    repositories.get = vi.fn().mockResolvedValue({ ...repo, assignedProfileId: undefined })
    const service = makeService()

    await service.buildDeterministic({
      repositoryId: 'repo-1',
      remoteName: 'origin',
      branch: 'main',
    })

    expect(github.getPushContext).not.toHaveBeenCalled()
  })
})
