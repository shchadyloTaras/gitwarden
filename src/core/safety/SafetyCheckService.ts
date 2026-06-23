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
