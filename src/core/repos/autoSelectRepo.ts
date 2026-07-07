import type { RepositoryRecord } from '../types.js'

/**
 * Decide whether the active-repo auto-select should change anything, given the current
 * repo list and the currently active repo's id. Returns `undefined` when nothing should
 * change (the caller must leave `activeRepo` alone); otherwise the record to activate
 * (or `null` to clear it).
 *
 * Re-picks `repos[0]` only when the active id has genuinely vanished from the list (or
 * nothing is active yet) — never on an unrelated re-render — so a same-repo metadata
 * save can't bump the selection back to the top of the list (audit #11).
 */
export function pickAutoSelectedRepo(
  repos: RepositoryRecord[],
  activeRepoId: string | null
): RepositoryRecord | null | undefined {
  if (repos.length === 0) return activeRepoId ? null : undefined
  if (!activeRepoId || !repos.some((r) => r.id === activeRepoId)) return repos[0]
  return undefined
}
