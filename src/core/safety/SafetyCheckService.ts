import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitStatus,
  GitRemote,
  SafetyIssue,
  SafetyCheckResult,
  StagedDiff,
} from '../types.js'
import {
  SAFETY_MESSAGES,
  SAFETY_SEVERITY,
  stagedSecretMessage,
  outgoingWrongAuthorMessage,
  githubAccountMismatchMessage,
} from './safetyMessages.js'
import { matchesAnyPattern } from './branchPatterns.js'
import { parseRemoteOwnerRepo } from '../github/remoteOwner.js'
import { resolvePushTarget } from './pushTarget.js'
import { extractAddedDiffLines } from '../ai/changeReview.js'
import { findSecretMatches } from '../ai/redaction.js'

// ── Issue catalogue ──────────────────────────────────────────────────────────

export type SafetyCode =
  | 'NO_ACTIVE_PROFILE'
  | 'REPO_UNASSIGNED'
  | 'PROFILE_MISMATCH'
  | 'IDENTITY_UNSET'
  | 'NAME_MISMATCH'
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
  | 'GITHUB_TOKEN_SCOPE_MISSING'
  | 'GITHUB_NOT_CONNECTED'
  | 'STAGED_SECRET_DETECTED'
  // Push policy (Phase 57). These engage ONLY when repo.pushPolicy is set and non-unrestricted.
  | 'PROTECTED_BRANCH_PUSH'
  | 'BRANCH_NOT_ALLOWED'
  | 'REMOTE_OWNER_MISMATCH'
  | 'REMOTE_REPO_MISMATCH'
  | 'PUSH_POLICY_INCOMPLETE'
  // QA Fixes (Phase 100): a commit already in the outgoing push range was authored by
  // someone other than the assigned profile — catches a wrong-author commit that
  // reaches push even after the local identity config has since been fixed.
  | 'OUTGOING_WRONG_AUTHOR'

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
    if (identity.userName !== activeProfile.gitAuthorName) {
      issues.push(makeIssue('NAME_MISMATCH'))
    }
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
  /**
   * Where `assignedLogin` came from — the repo's push-policy override
   * (`expectedGitHubActor`) or the assigned profile's linked GitHub account. Determines
   * which entity `GITHUB_ACCOUNT_MISMATCH`'s message names as the source of the
   * expectation, so the copy never blames the profile for a policy-set expectation
   * (or vice versa). Defaults to `'profile'` when omitted (the common case).
   */
  assignedLoginSource?: 'policy' | 'profile'
  /** A token is stored for the assigned profile. */
  hasToken: boolean
  /** A stored token was rejected (HTTP 401) and needs re-auth. */
  tokenInvalid?: boolean
  /** The @login the stored token actually authenticates as (verified in main). */
  effectiveLogin?: string
  /** OAuth scopes granted to the stored token, persisted on the linked profile. */
  scopes?: string[]
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
    github.scopes &&
    !github.scopes.some((scope) => scope === 'repo' || scope === 'public_repo')
  ) {
    issues.push(makeIssue('GITHUB_TOKEN_SCOPE_MISSING'))
    return issues
  }

  if (
    github.assignedLogin !== undefined &&
    github.effectiveLogin !== undefined &&
    github.assignedLogin !== github.effectiveLogin
  ) {
    issues.push({
      code: 'GITHUB_ACCOUNT_MISMATCH',
      message: githubAccountMismatchMessage(github.assignedLoginSource),
      severity: SAFETY_SEVERITY.GITHUB_ACCOUNT_MISMATCH,
    })
  }

  return issues
}

/**
 * Outgoing-authorship gate (Phase 100): any commit in the range about to be pushed whose
 * author doesn't match the ACTIVE profile's identity is a blocker — this is what stops an
 * already-wrong commit from reaching GitHub even after `--local` config has since been
 * fixed. Safe to compare against `activeProfile` here specifically because `canPush` can
 * only be true once `collectIdentityIssues` has already confirmed `activeProfile.id ===
 * repository.assignedProfileId` (PROFILE_MISMATCH blocks otherwise) — so whenever this
 * matters, `activeProfile` IS the assigned profile.
 */
function collectOutgoingAuthorIssues(
  outgoingCommits: { authorName: string; authorEmail: string }[] | undefined,
  activeProfile: Profile | undefined
): SafetyIssue[] {
  if (!outgoingCommits || outgoingCommits.length === 0 || !activeProfile) return []
  const offenders = outgoingCommits.filter(
    (c) =>
      c.authorName !== activeProfile.gitAuthorName || c.authorEmail !== activeProfile.gitAuthorEmail
  )
  if (offenders.length === 0) return []
  return [
    {
      code: 'OUTGOING_WRONG_AUTHOR',
      message: outgoingWrongAuthorMessage(offenders),
      severity: SAFETY_SEVERITY.OUTGOING_WRONG_AUTHOR,
    },
  ]
}

// ── Push policy checks (Phase 57) ────────────────────────────────────────────

/**
 * Evaluate the repo's push policy against the resolved push target and current branch.
 * Returns the issues and a `policyDenied` flag for `PUSH_POLICY_INCOMPLETE` (warning
 * severity that still blocks push — safe-deny for misconfiguration).
 *
 * Opt-in: only called when `pushPolicy` is set and `mode !== 'unrestricted'` (or
 * `blockedBranchPatterns` is non-empty in unrestricted mode — see §4).
 */
function collectPolicyIssues(
  policy: NonNullable<RepositoryRecord['pushPolicy']>,
  currentBranch: string,
  remotes: GitRemote[],
  upstream: string | undefined
): { issues: SafetyIssue[]; policyDenied: boolean } {
  const issues: SafetyIssue[] = []
  let policyDenied = false

  // Owner/repo — checked against the RESOLVED push target only.
  const target = resolvePushTarget({ remotes, upstream })
  if (target && (policy.expectedRemoteOwner || policy.expectedRemoteRepo)) {
    const parsed = parseRemoteOwnerRepo(target.url)
    if (parsed) {
      if (policy.expectedRemoteOwner && parsed.owner !== policy.expectedRemoteOwner) {
        issues.push(makeIssue('REMOTE_OWNER_MISMATCH'))
      }
      if (policy.expectedRemoteRepo && parsed.repo !== policy.expectedRemoteRepo) {
        issues.push(makeIssue('REMOTE_REPO_MISMATCH'))
      }
    }
  }

  // Branch evaluation — blocked WINS over allowed (check blocked first).
  if (matchesAnyPattern(currentBranch, policy.blockedBranchPatterns)) {
    issues.push(makeIssue('PROTECTED_BRANCH_PUSH'))
  } else if (policy.mode === 'branchScoped') {
    if (policy.allowedBranchPatterns.length === 0) {
      // Misconfiguration — safe-deny + nudge.
      issues.push(makeIssue('PUSH_POLICY_INCOMPLETE'))
      policyDenied = true
    } else if (!matchesAnyPattern(currentBranch, policy.allowedBranchPatterns)) {
      issues.push(makeIssue('BRANCH_NOT_ALLOWED'))
    }
  }

  return { issues, policyDenied }
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
    /** Staged files' unified diffs, for the deterministic secret scan (Phase 99). Optional — omit to skip the scan. */
    stagedDiffs?: StagedDiff[]
  }): SafetyCheckResult

  checkPush(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    remotes: GitRemote[]
    currentBranch?: string
    /** Upstream tracking ref, e.g. `'origin/main'` from GitStatus.upstream. Used to resolve the push target remote. */
    upstream?: string
    github?: GitHubPushContext
    /** Commits about to be pushed, for the outgoing-authorship gate (Phase 100). Optional — omit to skip the check. */
    outgoingCommits?: { authorName: string; authorEmail: string }[]
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

/**
 * Deterministic staged-secret scan for the commit gate (Phase 99). Reuses the same
 * added-lines extraction + ruleset the AI /review scanner uses (changeReview.ts,
 * redaction.ts) — one ruleset, no parallel pattern table (AGENTS.md #5: the issue
 * names the file only, never the matched content).
 */
function collectStagedSecretIssues(stagedDiffs?: StagedDiff[]): SafetyIssue[] {
  if (!stagedDiffs || stagedDiffs.length === 0) return []
  const issues: SafetyIssue[] = []
  for (const { path, diff } of stagedDiffs) {
    const added = extractAddedDiffLines(diff)
    if (added.trim() && findSecretMatches(added).length > 0) {
      issues.push({
        code: 'STAGED_SECRET_DETECTED',
        message: stagedSecretMessage(path),
        severity: SAFETY_SEVERITY.STAGED_SECRET_DETECTED,
      })
    }
  }
  return issues
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
    stagedDiffs?: StagedDiff[]
  }): SafetyCheckResult {
    const issues = collectIdentityIssues(input)

    if (!hasStagedChanges(input.status)) issues.push(makeIssue('NOTHING_STAGED'))
    if (!input.commitMessage.trim()) issues.push(makeIssue('EMPTY_MESSAGE'))
    if (hasConflicts(input.status)) issues.push(makeIssue('HAS_CONFLICTS'))
    issues.push(...collectStagedSecretIssues(input.stagedDiffs))

    return { canCommit: !hasBlocker(issues), canPush: true, issues }
  }

  checkPush(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    remotes: GitRemote[]
    currentBranch?: string
    upstream?: string
    github?: GitHubPushContext
    outgoingCommits?: { authorName: string; authorEmail: string }[]
  }): SafetyCheckResult {
    const issues = collectIdentityIssues(input)

    if (input.remotes.length === 0) {
      issues.push(makeIssue('NO_REMOTE'))
    } else if (input.activeProfile && input.activeProfile.expectedRemoteHosts.length > 0) {
      // A remote matches an expected host OR the profile's declared ssh alias. Once a repo's
      // origin is bound to that alias (ADR 0009), the alias IS the expected host — accepting it
      // here prevents a false REMOTE_HOST_MISMATCH on a correctly-bound SSH remote.
      const alias = input.activeProfile.sshKeyAlias?.trim()
      const allowedHosts = alias
        ? [...input.activeProfile.expectedRemoteHosts, alias]
        : input.activeProfile.expectedRemoteHosts
      const hasMatch = input.remotes.some(
        (r) => r.host !== undefined && allowedHosts.includes(r.host)
      )
      if (!hasMatch) issues.push(makeIssue('REMOTE_HOST_MISMATCH'))
    }

    if (input.github) issues.push(...collectGitHubPushIssues(input.github))
    issues.push(...collectOutgoingAuthorIssues(input.outgoingCommits, input.activeProfile))

    // Push policy (opt-in — only runs when pushPolicy is set).
    // Owner/repo checks apply in both modes; branch checks apply per mode.
    let policyDenied = false
    const policy = input.repository.pushPolicy
    if (policy) {
      const result = collectPolicyIssues(
        policy,
        input.currentBranch ?? '',
        input.remotes,
        input.upstream
      )
      issues.push(...result.issues)
      policyDenied = result.policyDenied
    }

    return { canCommit: true, canPush: !hasBlocker(issues) && !policyDenied, issues }
  }
}

export const safetyCheckService: SafetyCheckService = new SafetyCheckServiceImpl()
