import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitStatus,
  GitRemote,
  SafetyIssue,
  SafetyCheckResult,
} from '../types.js'
import { SAFETY_MESSAGES, SAFETY_SEVERITY } from './safetyMessages.js'

// ── Issue catalogue ──────────────────────────────────────────────────────────

export type SafetyCode =
  | 'NO_ACTIVE_PROFILE'
  | 'REPO_UNASSIGNED'
  | 'PROFILE_MISMATCH'
  | 'IDENTITY_UNSET'
  | 'EMAIL_MISMATCH'
  | 'EMAIL_FROM_GLOBAL_ONLY'
  | 'NOTHING_STAGED'
  | 'EMPTY_MESSAGE'
  | 'HAS_CONFLICTS'
  | 'NO_REMOTE'
  | 'REMOTE_HOST_MISMATCH'
  // GitHub HTTPS-token push (Phase 27). These engage ONLY when the push target is an
  // HTTPS GitHub remote — SSH-only pushes never see them.
  | 'GITHUB_ACCOUNT_MISMATCH'
  | 'GITHUB_TOKEN_MISSING'
  | 'GITHUB_TOKEN_INVALID'
  | 'GITHUB_NOT_CONNECTED'

function makeIssue(code: SafetyCode): SafetyIssue {
  return { code, message: SAFETY_MESSAGES[code], severity: SAFETY_SEVERITY[code] }
}

function hasBlocker(issues: SafetyIssue[]): boolean {
  return issues.some((i) => i.severity === 'blocker')
}

// ── Shared identity checks ───────────────────────────────────────────────────

interface IdentityInput {
  repository: RepositoryRecord
  activeProfile?: Profile
  identity: EffectiveGitIdentity
}

function collectIdentityIssues(input: IdentityInput): SafetyIssue[] {
  const { repository, activeProfile, identity } = input
  const issues: SafetyIssue[] = []

  if (!activeProfile) {
    issues.push(makeIssue('NO_ACTIVE_PROFILE'))
    return issues // no profile → remaining checks have nothing to compare against
  }

  if (!repository.assignedProfileId) {
    issues.push(makeIssue('REPO_UNASSIGNED'))
  } else if (activeProfile.id !== repository.assignedProfileId) {
    issues.push(makeIssue('PROFILE_MISMATCH'))
  }

  if (!identity.userName || !identity.userEmail) {
    issues.push(makeIssue('IDENTITY_UNSET'))
  } else {
    if (identity.userEmail !== activeProfile.gitAuthorEmail) {
      issues.push(makeIssue('EMAIL_MISMATCH'))
    }
    if (identity.emailSource && identity.emailSource !== 'local') {
      issues.push(makeIssue('EMAIL_FROM_GLOBAL_ONLY'))
    }
  }

  return issues
}

// ── GitHub HTTPS-token push context (Phase 27) ───────────────────────────────

/**
 * Everything checkPush needs to reason about an HTTPS-token GitHub push, resolved in
 * main (remote URL scheme, the assigned profile's link, the stored token's real
 * account). When `httpsToGitHub` is false the GitHub checks are skipped entirely, so
 * SSH-only pushes are never affected.
 */
export interface GitHubPushContext {
  /** The selected remote is an HTTPS GitHub URL (token push is in play). */
  httpsToGitHub: boolean
  /** The @login the assigned profile is linked to, if any. */
  assignedLogin?: string
  /** A token is stored for the assigned profile. */
  hasToken: boolean
  /** A stored token was rejected (HTTP 401) and needs re-auth. */
  tokenInvalid?: boolean
  /** The @login the stored token actually authenticates as (verified in main). */
  effectiveLogin?: string
}

function collectGitHubPushIssues(github: GitHubPushContext): SafetyIssue[] {
  // SSH (or any non-HTTPS-GitHub) push: no GitHub-account checks apply.
  if (!github.httpsToGitHub) return []

  const issues: SafetyIssue[] = []
  const linked = github.assignedLogin !== undefined

  if (!github.hasToken) {
    // Linked but no token → blocker; not linked at all → informational warning.
    issues.push(makeIssue(linked ? 'GITHUB_TOKEN_MISSING' : 'GITHUB_NOT_CONNECTED'))
    return issues
  }

  if (github.tokenInvalid) {
    issues.push(makeIssue('GITHUB_TOKEN_INVALID'))
    return issues
  }

  if (
    github.assignedLogin !== undefined &&
    github.effectiveLogin !== undefined &&
    github.assignedLogin !== github.effectiveLogin
  ) {
    issues.push(makeIssue('GITHUB_ACCOUNT_MISMATCH'))
  }

  return issues
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface SafetyCheckService {
  checkRepositoryIdentity(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
  }): SafetyCheckResult

  checkCommit(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    status: GitStatus
    commitMessage: string
  }): SafetyCheckResult

  checkPush(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    remotes: GitRemote[]
    currentBranch?: string
    github?: GitHubPushContext
  }): SafetyCheckResult
}

function hasStagedChanges(status: GitStatus): boolean {
  return status.files.some(
    (f) =>
      f.indexStatus !== 'unmodified' &&
      f.indexStatus !== 'untracked' &&
      f.indexStatus !== 'ignored' &&
      f.indexStatus !== 'conflicted' // conflicts must be resolved + re-staged before committing
  )
}

function hasConflicts(status: GitStatus): boolean {
  return status.files.some((f) => f.indexStatus === 'conflicted')
}

class SafetyCheckServiceImpl implements SafetyCheckService {
  checkRepositoryIdentity(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
  }): SafetyCheckResult {
    const issues = collectIdentityIssues(input)
    const blocked = hasBlocker(issues)
    return { canCommit: !blocked, canPush: !blocked, issues }
  }

  checkCommit(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    status: GitStatus
    commitMessage: string
  }): SafetyCheckResult {
    const issues = collectIdentityIssues(input)

    if (!hasStagedChanges(input.status)) issues.push(makeIssue('NOTHING_STAGED'))
    if (!input.commitMessage.trim()) issues.push(makeIssue('EMPTY_MESSAGE'))
    if (hasConflicts(input.status)) issues.push(makeIssue('HAS_CONFLICTS'))

    return { canCommit: !hasBlocker(issues), canPush: true, issues }
  }

  checkPush(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    remotes: GitRemote[]
    currentBranch?: string
    github?: GitHubPushContext
  }): SafetyCheckResult {
    const issues = collectIdentityIssues(input)

    if (input.remotes.length === 0) {
      issues.push(makeIssue('NO_REMOTE'))
    } else if (input.activeProfile && input.activeProfile.expectedRemoteHosts.length > 0) {
      const hasMatch = input.remotes.some(
        (r) => r.host !== undefined && input.activeProfile!.expectedRemoteHosts.includes(r.host)
      )
      if (!hasMatch) issues.push(makeIssue('REMOTE_HOST_MISMATCH'))
    }

    if (input.github) issues.push(...collectGitHubPushIssues(input.github))

    return { canCommit: true, canPush: !hasBlocker(issues), issues }
  }
}

export const safetyCheckService: SafetyCheckService = new SafetyCheckServiceImpl()
