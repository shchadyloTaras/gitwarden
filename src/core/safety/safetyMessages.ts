import type { Severity } from '../types.js'
import type { SafetyCode } from './SafetyCheckService.js'

export const SAFETY_SEVERITY: Record<SafetyCode, Severity> = {
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
  GITHUB_ACCOUNT_MISMATCH: 'blocker',
  GITHUB_TOKEN_MISSING: 'blocker',
  GITHUB_TOKEN_INVALID: 'blocker',
  GITHUB_NOT_CONNECTED: 'warning',
  STAGED_SECRET_DETECTED: 'blocker',
  PROTECTED_BRANCH_PUSH: 'blocker',
  BRANCH_NOT_ALLOWED: 'blocker',
  REMOTE_OWNER_MISMATCH: 'blocker',
  REMOTE_REPO_MISMATCH: 'blocker',
  PUSH_POLICY_INCOMPLETE: 'warning',
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
  GITHUB_ACCOUNT_MISMATCH:
    'The stored GitHub token authenticates as a different account than this repository’s assigned profile — you may push as the wrong user.',
  GITHUB_TOKEN_MISSING:
    'This profile pushes over HTTPS but has no stored GitHub token. Connect GitHub to push.',
  GITHUB_TOKEN_INVALID:
    'The stored GitHub token was rejected (it may have been revoked or expired). Reconnect GitHub to continue.',
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
}

export function stagedSecretMessage(file?: string): string {
  if (file) {
    return `Staged changes in ${file} contain secret-like content. Remove or redact before committing.`
  }
  return SAFETY_MESSAGES.STAGED_SECRET_DETECTED
}
