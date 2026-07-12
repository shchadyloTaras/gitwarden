import type { Severity } from '../types.js'
import type { SafetyCode } from './SafetyCheckService.js'

export const SAFETY_SEVERITY: Record<SafetyCode, Severity> = {
  NO_ACTIVE_PROFILE: 'blocker',
  REPO_UNASSIGNED: 'blocker',
  PROFILE_MISMATCH: 'blocker',
  IDENTITY_UNSET: 'blocker',
  NAME_MISMATCH: 'blocker',
  EMAIL_MISMATCH: 'blocker',
  EMAIL_FROM_GLOBAL_ONLY: 'warning',
  NOTHING_STAGED: 'blocker',
  EMPTY_MESSAGE: 'blocker',
  HAS_CONFLICTS: 'blocker',
  NO_REMOTE: 'warning',
  REMOTE_HOST_MISMATCH: 'blocker',
  GITHUB_ACCOUNT_MISMATCH: 'blocker',
  GITHUB_TOKEN_MISSING: 'blocker',
  GITHUB_TOKEN_INVALID: 'blocker',
  GITHUB_TOKEN_SCOPE_MISSING: 'blocker',
  GITHUB_NOT_CONNECTED: 'warning',
  STAGED_SECRET_DETECTED: 'blocker',
  PROTECTED_BRANCH_PUSH: 'blocker',
  BRANCH_NOT_ALLOWED: 'blocker',
  REMOTE_OWNER_MISMATCH: 'blocker',
  REMOTE_REPO_MISMATCH: 'blocker',
  PUSH_POLICY_INCOMPLETE: 'warning',
  OUTGOING_WRONG_AUTHOR: 'blocker',
}

export const SAFETY_MESSAGES: Record<SafetyCode, string> = {
  NO_ACTIVE_PROFILE: 'No active profile is selected.',
  REPO_UNASSIGNED: 'This repository has no assigned profile.',
  PROFILE_MISMATCH: 'The active profile does not match this repository’s assigned profile.',
  IDENTITY_UNSET: 'Git author name or email is not configured.',
  NAME_MISMATCH: 'Your Git author name does not match the active profile.',
  EMAIL_MISMATCH: 'Your Git author email does not match the active profile.',
  EMAIL_FROM_GLOBAL_ONLY:
    'Your Git identity is inherited from global config, not set for this repository.',
  NOTHING_STAGED: 'There are no staged changes to commit.',
  EMPTY_MESSAGE: 'Commit message cannot be empty.',
  HAS_CONFLICTS: 'There are unresolved merge conflicts in the repository.',
  NO_REMOTE: 'This repository has no remote configured.',
  REMOTE_HOST_MISMATCH:
    'The remote host does not match this profile’s expected GitHub account — you may be using the wrong SSH key.',
  GITHUB_ACCOUNT_MISMATCH:
    'The stored GitHub token authenticates as a different account than this repository’s assigned profile — you may push as the wrong user.',
  GITHUB_TOKEN_MISSING:
    'This profile pushes over HTTPS but has no stored GitHub token. Connect GitHub to push.',
  GITHUB_TOKEN_INVALID:
    'The stored GitHub token was rejected (it may have been revoked or expired). Reconnect GitHub to continue.',
  GITHUB_TOKEN_SCOPE_MISSING:
    'The linked GitHub token can verify this account but does not have push permission. Reconnect GitHub to grant repository access.',
  GITHUB_NOT_CONNECTED:
    'This profile has no linked GitHub account. Connect GitHub to verify the push account.',
  STAGED_SECRET_DETECTED:
    'Staged changes contain secret-like content. Remove or redact before committing.',
  PROTECTED_BRANCH_PUSH:
    'This branch is protected by the push policy. Open a pull request instead of pushing directly.',
  BRANCH_NOT_ALLOWED: "This branch is not in the allowed list for this repository's push policy.",
  REMOTE_OWNER_MISMATCH:
    'The push target repository owner does not match the expected owner in the push policy.',
  REMOTE_REPO_MISMATCH:
    'The push target repository name does not match the expected repository in the push policy.',
  PUSH_POLICY_INCOMPLETE:
    'The push policy requires specific branches but none are configured. Add allowed branch patterns to enable pushing.',
  OUTGOING_WRONG_AUTHOR:
    'One or more commits about to be pushed are authored by someone other than this profile’s identity.',
}

export function stagedSecretMessage(file?: string): string {
  if (file) {
    return `Staged changes in ${file} contain secret-like content. Remove or redact before committing.`
  }
  return SAFETY_MESSAGES.STAGED_SECRET_DETECTED
}

/**
 * Names the offending author(s) + count for OUTGOING_WRONG_AUTHOR (Phase 100) — the
 * generic catalogue message above is a fallback for contexts with no commit list (e.g.
 * Safety Copilot's per-code /explain). Never suggests a history rewrite: the remediation
 * is explain-only (return the commit, fix identity, re-commit).
 */
export function outgoingWrongAuthorMessage(
  offenders: { authorName: string; authorEmail: string }[]
): string {
  const uniqueAuthors = Array.from(
    new Map(offenders.map((o) => [`${o.authorName}\0${o.authorEmail}`, o])).values()
  )
  const count = offenders.length
  const commitWord = count === 1 ? 'commit is' : 'commits are'
  const who =
    uniqueAuthors.length === 1
      ? `authored as ${uniqueAuthors[0].authorName} <${uniqueAuthors[0].authorEmail}>`
      : `authored by ${uniqueAuthors.length} different people`
  return (
    `${count} outgoing ${commitWord} ${who}, not this profile’s identity. ` +
    'Return the commit(s) with Uncommit, fix your identity, then re-commit — ' +
    'GitWarden will not rewrite history automatically.'
  )
}

/**
 * GITHUB_ACCOUNT_MISMATCH's message names the actual source of the expected login —
 * the repo's push-policy override (`expectedGitHubActor`) or the assigned profile's
 * linked account (Phase 100 copy-truth fix: the message previously always blamed the
 * profile even when a policy field set the expectation).
 */
export function githubAccountMismatchMessage(source?: 'policy' | 'profile'): string {
  if (source === 'policy') {
    return 'The stored GitHub token authenticates as a different account than this repository’s push policy expects — you may push as the wrong user.'
  }
  return SAFETY_MESSAGES.GITHUB_ACCOUNT_MISMATCH
}
