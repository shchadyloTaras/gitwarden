// Deterministic Safety Copilot copy (Phase 34). Plain-language explanations and
// action hints for each SafetyCode — available with AI disabled.

import type { SafetyCode } from '../safety/SafetyCheckService.js'
import type { SafetySuggestedAction } from './types.js'

export function explainSafetyIssue(code: SafetyCode): string {
  switch (code) {
    case 'NO_ACTIVE_PROFILE':
      return 'GitWarden needs an active profile to know which identity and GitHub account this work belongs to. Without one, it cannot verify that your next commit or push matches the repository assignment.'
    case 'REPO_UNASSIGNED':
      return 'This repository is not assigned to any profile. GitWarden uses profile assignment to enforce the correct author identity and remote expectations before you commit or push.'
    case 'PROFILE_MISMATCH':
      return 'Your active profile does not match the profile assigned to this repository. Committing or pushing now could use the wrong author name, email, or GitHub account for this project.'
    case 'IDENTITY_UNSET':
      return 'Git author name or email is not configured for this repository. Git would still create a commit, but the author might be blank or inherited from global config — which GitWarden cannot tie to your profile.'
    case 'EMAIL_MISMATCH':
      return 'The Git author email configured for this repository does not match the active profile’s expected email. The commit would be attributed to a different address than this profile represents.'
    case 'EMAIL_FROM_GLOBAL_ONLY':
      return 'Your Git identity comes from global Git config, not this repository’s local settings. A global identity can drift across machines and is harder for GitWarden to keep aligned with the assigned profile.'
    case 'NOTHING_STAGED':
      return 'There are no staged changes to commit. Stage the files you intend to include before creating a commit.'
    case 'EMPTY_MESSAGE':
      return 'The commit message is empty. Git requires a non-empty message so future readers (and you) can understand what changed.'
    case 'HAS_CONFLICTS':
      return 'The repository has unresolved merge conflicts. Git cannot produce a clean commit until each conflicted file is resolved and re-staged.'
    case 'NO_REMOTE':
      return 'This repository has no remote configured, so GitWarden cannot verify where a push would go or whether the remote host matches your profile.'
    case 'REMOTE_HOST_MISMATCH':
      return 'The configured remote host does not match this profile’s expected GitHub host. You may be pushing with the wrong SSH key or to an account that is not tied to this profile.'
    case 'GITHUB_ACCOUNT_MISMATCH':
      return 'The stored GitHub token authenticates as a different user than the profile linked to this repository. An HTTPS push would publish commits under the wrong GitHub account.'
    case 'GITHUB_TOKEN_MISSING':
      return 'This profile pushes over HTTPS to GitHub but has no stored token. GitWarden blocks the push until GitHub is connected for the assigned profile.'
    case 'GITHUB_TOKEN_INVALID':
      return 'The stored GitHub token was rejected — it may have expired or been revoked. Reconnect GitHub so GitWarden can verify the push account again.'
    case 'GITHUB_NOT_CONNECTED':
      return 'This profile has no linked GitHub account. Connect GitHub so GitWarden can confirm which account an HTTPS push would use.'
    case 'STAGED_SECRET_DETECTED':
      return 'Staged changes contain content that looks like a secret or credential. Committing would permanently store it in Git history, where it is very hard to remove.'
    case 'PROTECTED_BRANCH_PUSH':
      return 'This branch is protected by the push policy for this repository. Direct pushes are blocked to prevent accidental changes to shared or production branches. Open a pull request instead.'
    case 'BRANCH_NOT_ALLOWED':
      return "The current branch is not in the allowed list for this repository's push policy. Switch to an allowed branch (or create one with the suggested prefix) before pushing."
    case 'REMOTE_OWNER_MISMATCH':
      return 'The push would go to a different repository owner than the push policy expects. Verify you are pushing to the correct remote for this client repository.'
    case 'REMOTE_REPO_MISMATCH':
      return 'The push would go to a different repository name than the push policy expects. Verify you are pushing to the correct remote for this client repository.'
    case 'PUSH_POLICY_INCOMPLETE':
      return 'The push policy is set to branch-scoped mode but no allowed branch patterns are configured. Add allowed patterns in the repository Push Policy settings before pushing.'
    default: {
      const _exhaustive: never = code
      return String(_exhaustive)
    }
  }
}

/** Where to go in GitWarden — renderer maps these to STR.SAFETY_ACTION_* labels. */
export function actionHintFor(code: SafetyCode): string {
  const action = SAFETY_ACTION_BY_CODE[code]
  return ACTION_HINTS[action]
}

export const SAFETY_ACTION_BY_CODE: Record<SafetyCode, SafetySuggestedAction> = {
  NO_ACTIVE_PROFILE: 'switch-active-profile',
  REPO_UNASSIGNED: 'assign-repo-profile',
  PROFILE_MISMATCH: 'switch-active-profile',
  IDENTITY_UNSET: 'set-local-identity',
  EMAIL_MISMATCH: 'set-local-identity',
  EMAIL_FROM_GLOBAL_ONLY: 'set-local-identity',
  NOTHING_STAGED: 'stage-changes',
  EMPTY_MESSAGE: 'write-commit-message',
  HAS_CONFLICTS: 'resolve-conflicts',
  NO_REMOTE: 'configure-remote',
  REMOTE_HOST_MISMATCH: 'switch-active-profile',
  GITHUB_ACCOUNT_MISMATCH: 'reconnect-github',
  GITHUB_TOKEN_MISSING: 'reconnect-github',
  GITHUB_TOKEN_INVALID: 'reconnect-github',
  GITHUB_NOT_CONNECTED: 'reconnect-github',
  STAGED_SECRET_DETECTED: 'review-staged-changes',
  PROTECTED_BRANCH_PUSH: 'switch-branch',
  BRANCH_NOT_ALLOWED: 'switch-branch',
  REMOTE_OWNER_MISMATCH: 'configure-remote',
  REMOTE_REPO_MISMATCH: 'configure-remote',
  PUSH_POLICY_INCOMPLETE: 'edit-push-policy',
}

const ACTION_HINTS: Record<SafetySuggestedAction, string> = {
  'set-local-identity':
    'On the Commit screen, use “Set local identity for this repo” to write the profile’s author name and email to this repository’s local Git config.',
  'switch-active-profile':
    'Open Profiles and select the profile assigned to this repository as your active profile.',
  'assign-repo-profile':
    'Open Repositories, select this repo, and assign it to the correct profile.',
  'reconnect-github':
    'Open Profiles, select the assigned profile, and use Connect GitHub to link or refresh the token.',
  'stage-changes': 'Open Status or Commit and stage the files you want in this commit.',
  'write-commit-message': 'On the Commit screen, enter a descriptive commit message.',
  'resolve-conflicts': 'Open Status, resolve conflict markers in each file, then stage the fixes.',
  'configure-remote': 'Open Remote and add or update the remote URL for this repository.',
  'review-staged-changes':
    'On the Commit screen, review the change-review findings and remove or redact secret-like content before committing.',
  'switch-branch':
    'On the Branches screen, switch to an allowed branch or create a new one with the suggested prefix.',
  'edit-push-policy':
    'Open Repositories, select this repo, and add allowed branch patterns in the Push Policy section.',
  'switch-profile-and-retry-push':
    'Switch to the repository’s assigned profile and push again with its GitHub account.',
}
