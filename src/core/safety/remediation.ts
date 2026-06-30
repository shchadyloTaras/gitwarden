// Guard Quick-Fix — remediation model (Phase 63). PURE core (AGENTS.md rule #1):
// no Node or browser APIs — this is data-only mapping. Maps each safety issue and
// each actionable Git failure to a single, deterministic remediation the UI can
// render either as a one-click fix (executable, in-app, never touches
// global/system state) or as a "go to …" navigation.
//
// This module adds the executable/navigate dimension on top of the EXISTING
// SAFETY_ACTION_BY_CODE map — it derives from it rather than forking a second
// code→action map, so the two can never drift. It adds NO new safety verdicts.
// Works with AI disabled (consistent with the Safety Copilot's offline guarantee).

import type { SafetyCode } from './SafetyCheckService.js'
import type { SafetySuggestedAction } from '../ai/types.js'
import type { GitHubDeviceCode } from '../types.js'
import { SAFETY_ACTION_BY_CODE } from '../ai/safetyCopilotMessages.js'

/**
 * Actionable Git failure codes that carry a remediation (a subset of
 * `GitErrorCode`). `authenticationFailed` is the EXISTING code, now remediable;
 * the other two are added to `GitErrorCode` in Phase 64.
 */
export type RemediableGitErrorCode =
  | 'pushRejectedWrongAccount' // remote: Permission to X denied to Y / 403 → wrong account
  | 'authenticationFailed' // 401 / token rejected → reconnect GitHub
  | 'dubiousOwnership' // repo dir moved/renamed → explain-only (no global safe.directory)

/** How the UI offers the fix: a one-click in-app action, or a navigation. */
export type RemediationKind = 'executable' | 'navigate'

/**
 * Stable, renderer-agnostic screen ids a navigate-remediation can target; the
 * renderer maps these to its own `NavScreen` enum (appStore.ts). `'profiles'` is
 * reserved for completeness — the profile-related fixes are executable, not
 * navigations — but kept here so the contract is stable if that changes.
 */
export type NavTarget = 'repositories' | 'commit' | 'status' | 'remote' | 'branches' | 'profiles'

export interface Remediation {
  action: SafetySuggestedAction
  kind: RemediationKind
  /** Set iff `kind === 'navigate'`: which screen to open. */
  navigateTo?: NavTarget
}

/**
 * The four actions GitWarden can perform in-app WITHOUT touching global/system
 * state (no `gh auth`, no `git config --global`, no `~/.ssh/config`, no global
 * `safe.directory`). Everything else is a navigation. This list is the single
 * source of truth for executability — both the exported Set and the
 * `ExecutableAction` type are derived from it, so they cannot disagree.
 */
const EXECUTABLE_ACTION_LIST = [
  'set-local-identity', // write the profile's author name/email to --local config
  'switch-active-profile', // set the repo's assigned profile active
  'reconnect-github', // launch the device-flow connect for the assigned profile
  'switch-profile-and-retry-push', // switch active profile → re-run push (token follows)
] as const satisfies readonly SafetySuggestedAction[]

export type ExecutableAction = (typeof EXECUTABLE_ACTION_LIST)[number]

/** Set view of the executable actions (the plan's contract). Membership ⇒ executable. */
export const EXECUTABLE_ACTIONS: ReadonlySet<SafetySuggestedAction> = new Set(
  EXECUTABLE_ACTION_LIST
)

/** Every NON-executable action. */
type NavigateAction = Exclude<SafetySuggestedAction, ExecutableAction>

/**
 * Where each navigate action routes. A total `Record<NavigateAction, …>` makes
 * the compiler reject any new `SafetySuggestedAction` that is neither executable
 * nor given a navigation target — there is no `default` gap.
 */
const NAVIGATE_TARGETS: Record<NavigateAction, NavTarget> = {
  'assign-repo-profile': 'repositories',
  'stage-changes': 'status',
  'write-commit-message': 'commit',
  'resolve-conflicts': 'status',
  'configure-remote': 'remote',
  'review-staged-changes': 'commit',
  'switch-branch': 'branches',
  'edit-push-policy': 'repositories',
}

/** Build the remediation for any action from the executable/navigate split. */
function remediationForAction(action: SafetySuggestedAction): Remediation {
  if (EXECUTABLE_ACTIONS.has(action)) return { action, kind: 'executable' }
  // Not executable ⇒ a NavigateAction; NAVIGATE_TARGETS is total over those, so
  // this lookup is always defined (the cast is guarded by the membership check).
  return { action, kind: 'navigate', navigateTo: NAVIGATE_TARGETS[action as NavigateAction] }
}

/**
 * Remediation for a safety issue. DERIVES the action from the existing
 * `SAFETY_ACTION_BY_CODE` map, then adds the executable/navigate dimension.
 * Exhaustive: `SAFETY_ACTION_BY_CODE` is a total `Record<SafetyCode, …>`, so
 * every code yields a `Remediation` with no default gap.
 */
export function remediationForSafetyCode(code: SafetyCode): Remediation {
  return remediationForAction(SAFETY_ACTION_BY_CODE[code])
}

/**
 * Which action each actionable Git failure offers. A wrong-account push switches
 * to the assigned profile and retries; a rejected/expired token reconnects
 * GitHub; a moved repo folder is navigate/explain-only — GitWarden will NOT write
 * a global `safe.directory`, so `dubiousOwnership` reuses the repositories-routing
 * action purely as a navigation vehicle and the real explanation is the
 * `GitError`'s `userMessage` (attached in Phase 64).
 */
const GIT_ERROR_ACTION: Record<RemediableGitErrorCode, SafetySuggestedAction> = {
  pushRejectedWrongAccount: 'switch-profile-and-retry-push',
  authenticationFailed: 'reconnect-github',
  dubiousOwnership: 'assign-repo-profile',
}

export function remediationForGitError(code: RemediableGitErrorCode): Remediation {
  return remediationForAction(GIT_ERROR_ACTION[code])
}

/**
 * Whether a Git error code (or any string) is one the model can remediate.
 * Derived from `GIT_ERROR_ACTION`'s keys so the remediable set has a single source
 * of truth — the IPC layer uses this to decide when to attach a remediation.
 */
export function isRemediableGitErrorCode(code: string): code is RemediableGitErrorCode {
  return Object.prototype.hasOwnProperty.call(GIT_ERROR_ACTION, code)
}

/**
 * Result of executing an executable remediation (Phase 65, via the
 * `remediation:execute` IPC channel). `ok` is true when the in-app action
 * completed; `deviceCode` carries the GitHub device-flow code/url for
 * `reconnect-github`; `remediation` + `message` describe a refusal (e.g. a
 * retry-push on an unassigned repo routes the user to assign a profile first).
 */
export interface RemediationResult {
  ok: boolean
  deviceCode?: GitHubDeviceCode
  remediation?: Remediation
  message?: string
}
