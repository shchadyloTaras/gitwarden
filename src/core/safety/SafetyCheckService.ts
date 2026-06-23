import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitStatus,
  GitRemote,
  SafetyIssue,
  SafetyCheckResult,
  Severity,
} from '../types.js'

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

const SEVERITY: Record<SafetyCode, Severity> = {
  NO_ACTIVE_PROFILE: 'blocker',
  REPO_UNASSIGNED: 'blocker',
  PROFILE_MISMATCH: 'blocker',
  IDENTITY_UNSET: 'blocker',
  EMAIL_MISMATCH: 'warning',
  EMAIL_FROM_GLOBAL_ONLY: 'warning',
  NOTHING_STAGED: 'blocker',
  EMPTY_MESSAGE: 'blocker',
  HAS_CONFLICTS: 'blocker',
  NO_REMOTE: 'warning',
  REMOTE_HOST_MISMATCH: 'blocker',
}

export const SAFETY_MESSAGES: Record<SafetyCode, string> = {
  NO_ACTIVE_PROFILE: 'No active profile is selected.',
  REPO_UNASSIGNED: 'This repository has no assigned profile.',
  PROFILE_MISMATCH: 'The active profile does not match this repository’s assigned profile.',
  IDENTITY_UNSET: 'Git author name or email is not configured.',
  EMAIL_MISMATCH: 'Your Git author email does not match the active profile.',
  EMAIL_FROM_GLOBAL_ONLY:
    'Your Git identity is inherited from global config, not set for this repository.',
  NOTHING_STAGED: 'There are no staged changes to commit.',
  EMPTY_MESSAGE: 'Commit message cannot be empty.',
  HAS_CONFLICTS: 'There are unresolved merge conflicts in the repository.',
  NO_REMOTE: 'This repository has no remote configured.',
  REMOTE_HOST_MISMATCH:
    'The remote host does not match this profile’s expected GitHub account — you may be using the wrong SSH key.',
}

function makeIssue(code: SafetyCode): SafetyIssue {
  return { code, message: SAFETY_MESSAGES[code], severity: SEVERITY[code] }
}

function hasBlocker(issues: SafetyIssue[]): boolean {
  return issues.some((i) => i.severity === 'blocker')
}

// ── Shared identity checks ───────────────────────────────────────────────────

interface IdentityInput {
  repository: RepositoryRecord
  activeProfile: Profile | undefined
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

    return { canCommit: true, canPush: !hasBlocker(issues), issues }
  }
}

export const safetyCheckService: SafetyCheckService = new SafetyCheckServiceImpl()
