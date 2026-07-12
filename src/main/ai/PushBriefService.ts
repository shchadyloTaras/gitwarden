import { buildDeterministicPushBrief } from '../../core/ai/pushBrief.js'
import type { AiPushBrief, AiPushIdentityContext } from '../../core/ai/types.js'
import { isHttpsGitHubRemoteUrl } from '../../core/github/remoteUrl.js'
import type { IProfileService } from '../services/ProfileService.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { ISettingsService } from '../services/SettingsService.js'
import type { GitService } from '../services/GitService.js'
import type { IGitHubAuthCoordinator } from '../ipc/GitHubAuthCoordinator.js'

const COMMITS_AHEAD_LIMIT = 30

export interface PushBriefInput {
  repositoryId: string
  remoteName: string
  branch: string
  github?: AiPushIdentityContext['github']
  expensiveSendAcknowledged?: boolean
}

export class PushBriefService {
  constructor(
    private readonly repositories: IRepositoryService,
    private readonly profiles: IProfileService,
    private readonly settings: ISettingsService,
    private readonly git: Pick<
      GitService,
      'getCommitsAhead' | 'getRemotes' | 'getEffectiveIdentity'
    >,
    private readonly github: Pick<IGitHubAuthCoordinator, 'getPushContext'>
  ) {}

  async buildDeterministic(input: PushBriefInput): Promise<AiPushBrief> {
    const repository = await this.requireRepository(input.repositoryId)
    const [profiles, settings, remotes, identity, commitsAhead] = await Promise.all([
      this.profiles.list(),
      this.settings.get(),
      this.git.getRemotes(repository.localPath),
      this.git.getEffectiveIdentity(repository.localPath),
      this.git.getCommitsAhead(
        repository.localPath,
        input.remoteName,
        input.branch,
        COMMITS_AHEAD_LIMIT
      ),
    ])

    const remote = remotes.find((r) => r.name === input.remoteName)
    const activeProfile = settings.activeProfileId
      ? profiles.find((p) => p.id === settings.activeProfileId)
      : undefined
    const assignedProfile = repository.assignedProfileId
      ? profiles.find((p) => p.id === repository.assignedProfileId)
      : undefined

    const isHttpsGitHub = Boolean(remote && isHttpsGitHubRemoteUrl(remote.url))

    // Phase 104: resolve the REAL token facts when the caller didn't already supply
    // them, via the SAME main-side resolution the push sheet uses
    // (GitHubAuthCoordinator.getPushContext) — single source by construction, so the
    // brief can never contradict what the push sheet would say about this profile's
    // stored token. `/push-brief` (aiChatStore.ts) sends no `github` block at all, so
    // this is what stops `hasToken` from silently defaulting to false.
    let githubFacts = input.github
    if (isHttpsGitHub && !githubFacts && assignedProfile) {
      const status = await this.github.getPushContext(assignedProfile.id)
      githubFacts = {
        hasToken: status.hasToken,
        tokenInvalid: status.tokenInvalid,
        effectiveLogin: status.effectiveLogin,
      }
    }

    const pushIdentity: AiPushIdentityContext = {
      remoteName: input.remoteName,
      branch: input.branch,
      remoteHost: remote?.host,
      activeProfileName: activeProfile?.displayName,
      activeProfileEmail: activeProfile?.gitAuthorEmail,
      assignedProfileName: assignedProfile?.displayName,
      identityName: identity.userName,
      identityEmail: identity.userEmail,
      github: isHttpsGitHub
        ? {
            assignedLogin: assignedProfile?.linkedGitHub?.login,
            effectiveLogin: githubFacts?.effectiveLogin,
            hasToken: githubFacts?.hasToken ?? false,
            tokenInvalid: githubFacts?.tokenInvalid ?? false,
          }
        : undefined,
    }

    return buildDeterministicPushBrief(commitsAhead, pushIdentity)
  }

  private async requireRepository(id: string) {
    const repository = await this.repositories.get(id)
    if (!repository) throw new Error(`Repository not found: ${id}`)
    return repository
  }
}
