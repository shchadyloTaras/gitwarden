// Phase 65 — run the four executable remediations behind the remediation:execute
// channel. NO Electron import: the WebContents is injected as an AuthEventSender,
// so this dispatch is unit-testable against offline fixtures + mocked services.
// Honors the product boundary — it only switches the ACTIVE profile, writes
// --local identity, starts the device flow, and re-runs the existing push; it
// never touches global or system state.

import type { GitService } from '../services/GitService.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { IProfileService } from '../services/ProfileService.js'
import type { ISettingsService } from '../services/SettingsService.js'
import type { IGitHubAuthCoordinator, AuthEventSender } from './GitHubAuthCoordinator.js'
import { GitError } from '../git/ErrorMapper.js'
import { isHttpsGitHubRemoteUrl } from '../../core/github/remoteUrl.js'
import {
  remediationForGitError,
  remediationForSafetyCode,
  type ExecutableAction,
  type RemediationResult,
} from '../../core/safety/remediation.js'

/** Validated input for the remediation:execute channel. */
export interface RemediationExecuteInput {
  action: ExecutableAction
  repoPath: string
  profileId?: string
  remote?: string
  branch?: string
}

/** The narrow service surface the executor needs (injected; mockable in tests). */
export interface RemediationExecutorDeps {
  git: Pick<GitService, 'setLocalIdentity' | 'push' | 'getRemotes'>
  repositories: Pick<IRepositoryService, 'list'>
  profiles: Pick<IProfileService, 'get'>
  settings: Pick<ISettingsService, 'update'>
  github: Pick<IGitHubAuthCoordinator, 'startDeviceAuth' | 'resolveHttpsAuth'>
}

/** Refusal when the repo has no assigned profile — route the user to assign one. */
function blockedUnassigned(): RemediationResult {
  return {
    ok: false,
    remediation: remediationForSafetyCode('REPO_UNASSIGNED'),
    message: 'Assign this repository to a profile before running this fix.',
  }
}

export async function executeRemediation(
  deps: RemediationExecutorDeps,
  sender: AuthEventSender,
  input: RemediationExecuteInput
): Promise<RemediationResult> {
  const { action, repoPath } = input
  const repos = await deps.repositories.list()
  const repo = repos.find((r) => r.localPath === repoPath)
  // Non-credentialed fixes (identity / active-profile / device-flow) may target a
  // caller-supplied profileId, falling back to the repo's assigned profile. The ONE
  // credentialed action (switch-profile-and-retry-push) deliberately IGNORES
  // input.profileId and pins to repo.assignedProfileId below, so a caller can never
  // push with an arbitrary profile's token.
  const targetProfileId = input.profileId ?? repo?.assignedProfileId

  switch (action) {
    case 'set-local-identity': {
      const profile = targetProfileId ? await deps.profiles.get(targetProfileId) : undefined
      if (!profile) return blockedUnassigned()
      await deps.git.setLocalIdentity(repoPath, profile.gitAuthorName, profile.gitAuthorEmail)
      return { ok: true }
    }
    case 'switch-active-profile': {
      if (!targetProfileId) return blockedUnassigned()
      await deps.settings.update({ activeProfileId: targetProfileId })
      return { ok: true }
    }
    case 'reconnect-github': {
      if (!targetProfileId) return blockedUnassigned()
      const deviceCode = await deps.github.startDeviceAuth(targetProfileId, sender)
      return { ok: true, deviceCode }
    }
    case 'switch-profile-and-retry-push': {
      const assigned = repo?.assignedProfileId
      if (!assigned) return blockedUnassigned()
      const branch = input.branch
      if (!branch) return { ok: false, message: 'No branch was provided for the retry push.' }
      const remote = input.remote ?? 'origin'
      // Make the assigned profile active, then re-run the existing push. The token
      // (for an HTTPS GitHub remote) auto-resolves for that profile via GIT_ASKPASS;
      // a push failure throws a GitError, which the IPC wrap() re-classifies into a
      // fresh code + remediation.
      await deps.settings.update({ activeProfileId: assigned })
      const remotes = await deps.git.getRemotes(repoPath)
      const url = remotes.find((r) => r.name === remote)?.url
      const auth = url ? await deps.github.resolveHttpsAuth(assigned, url) : undefined
      try {
        await deps.git.push(repoPath, remote, branch, auth)
      } catch (error) {
        if (
          url &&
          isHttpsGitHubRemoteUrl(url) &&
          error instanceof GitError &&
          error.code === 'pushRejectedWrongAccount'
        ) {
          return {
            ok: false,
            remediation: remediationForGitError('authenticationFailed'),
            message:
              'GitHub still rejected the HTTPS push with the assigned profile. Reconnect GitHub for this profile, then push again.',
          }
        }
        throw error
      }
      return { ok: true }
    }
    default: {
      const _exhaustive: never = action
      return { ok: false, message: `Unsupported action: ${String(_exhaustive)}` }
    }
  }
}
