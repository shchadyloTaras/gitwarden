import { buildDeterministicPushBrief } from '../../core/ai/pushBrief.js'
import type { AiPushBrief, AiPushIdentityContext } from '../../core/ai/types.js'
import { isHttpsGitHubRemoteUrl } from '../../core/github/remoteUrl.js'
import type { IProfileService } from '../services/ProfileService.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { ISettingsService } from '../services/SettingsService.js'
import type { GitService } from '../services/GitService.js'

const COMMITS_AHEAD_LIMIT = 30

export interface PushBriefInput {
  repositoryId: string
  remoteName: string
  branch: string
  github?: AiPushIdentityContext['github']
}

export class PushBriefService {
  constructor(
    private readonly repositories: IRepositoryService,
    private readonly profiles: IProfileService,
    private readonly settings: ISettingsService,
    private readonly git: Pick<
      GitService,
      'getCommitsAhead' | 'getRemotes' | 'getEffectiveIdentity'
    >
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

    const pushIdentity: AiPushIdentityContext = {
      remoteName: input.remoteName,
      branch: input.branch,
      remoteHost: remote?.host,
      activeProfileName: activeProfile?.displayName,
      activeProfileEmail: activeProfile?.gitAuthorEmail,
      assignedProfileName: assignedProfile?.displayName,
      identityName: identity.userName,
      identityEmail: identity.userEmail,
      github:
        remote && isHttpsGitHubRemoteUrl(remote.url)
          ? {
              assignedLogin: assignedProfile?.linkedGitHub?.login,
              effectiveLogin: input.github?.effectiveLogin,
              hasToken: input.github?.hasToken ?? false,
              tokenInvalid: input.github?.tokenInvalid ?? false,
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
