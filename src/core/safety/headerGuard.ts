import type { Profile, RepositoryRecord, EffectiveGitIdentity } from '../types.js'
import { safetyCheckService } from './SafetyCheckService.js'

/**
 * The header guard answers exactly one question: does GitWarden currently see the right
 * profile and Git identity for *this* repository? It NEVER promises commit/push safety —
 * those verdicts stay on the Commit / Remote / Safety Center screens.
 *
 * - `checking`    async in flight
 * - `ready`       repo/profile/identity aligned (NOT "safe to commit/push")
 * - `review`      warnings only (email mismatch / global-only identity)
 * - `blocked`     any blocker (unassigned / profile mismatch / identity unset / no profile)
 * - `not-checked` no active repo, or identity could not be resolved (IPC error)
 */
export type HeaderGuardState = 'checking' | 'ready' | 'review' | 'blocked' | 'not-checked'

export interface HeaderGuardInput {
  loading: boolean
  hasRepo: boolean
  /** getEffectiveIdentity (or any prerequisite) failed to resolve. */
  errored: boolean
  repository: RepositoryRecord | null
  activeProfile: Profile | null
  /** Resolved identity, or null if it could not be read. */
  identity: EffectiveGitIdentity | null
}

export interface HeaderGuard {
  state: HeaderGuardState
  issueCount: number
}

/**
 * Maps the resolved repo/profile/identity context to a header guard state. The mapper calls
 * `checkRepositoryIdentity` itself (never `checkCommit`/`checkPush`) so callers structurally
 * cannot feed it commit/push results — the header can never inherit a NOTHING_STAGED /
 * NO_REMOTE / EMPTY_MESSAGE verdict.
 *
 * Note: an identity object with empty `userName`/`userEmail` is NOT `not-checked` — it is a
 * real misconfiguration (`IDENTITY_UNSET`) and resolves to `blocked`. `not-checked` is
 * reserved for "no active repo" or "the IPC call itself failed".
 */
export function deriveHeaderGuard(input: HeaderGuardInput): HeaderGuard {
  if (input.loading) return { state: 'checking', issueCount: 0 }
  if (!input.hasRepo || input.errored || !input.repository || !input.identity) {
    return { state: 'not-checked', issueCount: 0 }
  }
  const { issues } = safetyCheckService.checkRepositoryIdentity({
    repository: input.repository,
    activeProfile: input.activeProfile ?? undefined,
    identity: input.identity,
  })
  if (issues.some((i) => i.severity === 'blocker')) {
    return { state: 'blocked', issueCount: issues.length }
  }
  if (issues.length > 0) return { state: 'review', issueCount: issues.length }
  return { state: 'ready', issueCount: 0 }
}
