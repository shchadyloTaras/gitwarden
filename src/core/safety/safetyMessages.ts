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
