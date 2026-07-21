import { create } from 'zustand'
import type { GitCommit, RepositoryRecord } from '../../core/types'
import type { UncommitEligibility } from '../../core/history/uncommit'
import { useAppStore } from './appStore'
import { createRequestTracker } from '../../core/concurrency/requestGuard'
import { STR } from '../strings'

// Phase 112: load() (target changes + same-target refreshes) and loadMore() (pagination)
// each get their OWN guard — sharing one tracker was the root cause of a same-target
// refresh silently discarding an in-flight Load-more response (see the plan's finding #3).
const targetTracker = createRequestTracker()
const paginationTracker = createRequestTracker()

const PAGE_SIZE = 50

function dedupeByFullHash(commits: GitCommit[]): GitCommit[] {
  const seen = new Set<string>()
  const result: GitCommit[] = []
  for (const commit of commits) {
    if (seen.has(commit.fullHash)) continue
    seen.add(commit.fullHash)
    result.push(commit)
  }
  return result
}

interface HistoryState {
  repoPath: string | null
  /** The load target's branch identity (Phase 112) — paired with repoPath to decide
   *  whether a load() call is a genuine target change or a same-target refresh. */
  branch: string | null
  repository: RepositoryRecord | null
  commits: GitCommit[]
  /** How many commits the user has asked to see (Phase 112) — 50 initially, +50 per
   *  accepted `loadMore()`. Every fetch requests `visibleLimit + 1` from offset zero and
   *  slices to `visibleLimit`, so pagination never depends on offset/skip arithmetic. */
  visibleLimit: number
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  /** Uncommit eligibility for the two return actions; null until the first load completes. */
  eligibility: UncommitEligibility | null
  /** Commits at index < unpushedCount (within `commits`) are not yet on the remote. */
  unpushedCount: number
  /** True while a return action's IPC round-trip is in flight. */
  returning: boolean
  returnError: string | null
  /**
   * The last successful return's confirmation (Phase 102) — an operation OUTCOME, not
   * loaded data, so it survives a same-repo refresh. The screen navigates to Status
   * immediately on success (the returned file lives there), so this is what a user
   * sees if/when they come back to History, not a fleeting toast they'd otherwise miss.
   */
  returnSuccessMessage: string | null

  load(repoPath: string, repository: RepositoryRecord, branch?: string | null): Promise<void>
  loadMore(): Promise<void>
  returnLast(): Promise<void>
  returnAllUnpushed(): Promise<void>
  clearReturnError(): void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  repoPath: null,
  branch: null,
  repository: null,
  commits: [],
  visibleLimit: PAGE_SIZE,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  eligibility: null,
  unpushedCount: 0,
  returning: false,
  returnError: null,
  returnSuccessMessage: null,

  async load(repoPath, repository, branch = null) {
    const prev = get()
    // A repository OR branch change is a genuine target change — reset depth to 50 and
    // clear stale content. A same-target refresh (e.g. a `.git` watcher event, focus
    // revalidation, or a post-fetch/pull reload) keeps whatever depth the user reached.
    const isTargetChange = prev.repoPath !== repoPath || prev.branch !== branch
    const token = targetTracker.begin()
    const visibleLimit = isTargetChange ? PAGE_SIZE : prev.visibleLimit
    set({
      loading: true,
      error: null,
      repoPath,
      branch,
      repository,
      visibleLimit,
      ...(isTargetChange
        ? {
            commits: [],
            hasMore: false,
            eligibility: null,
            unpushedCount: 0,
            returnError: null,
            returnSuccessMessage: null,
          }
        : {}),
    })
    try {
      const [historyRes, returnStateRes] = await Promise.all([
        window.api.git.getCommitHistory(repoPath, visibleLimit + 1, 0),
        window.api.history.getReturnState(repoPath),
      ])
      if (!historyRes.ok) throw new Error(historyRes.error)
      // Drop this response if superseded by a newer load() (repo/branch switch or
      // another refresh), OR if a concurrent loadMore() already raised the visible
      // depth past what this fetch requested — applying it now would revert pagination.
      if (targetTracker.isCurrent(token) && get().visibleLimit === visibleLimit) {
        const deduped = dedupeByFullHash(historyRes.data)
        set({ commits: deduped.slice(0, visibleLimit), hasMore: deduped.length > visibleLimit })
        if (returnStateRes.ok) {
          set({
            eligibility: returnStateRes.data.eligibility,
            unpushedCount: returnStateRes.data.unpushedCount,
          })
        }
      }
    } catch (err) {
      if (targetTracker.isCurrent(token))
        set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (targetTracker.isCurrent(token)) set({ loading: false })
    }
  },

  async loadMore() {
    const prev = get()
    // Single-flight: a rapid second click while the first is in flight is a no-op, not
    // a duplicate read. `!hasMore` also refuses — there is nothing left to request.
    if (!prev.repoPath || prev.loadingMore || !prev.hasMore) return
    const { repoPath, branch, visibleLimit: previousLimit } = prev
    const requestedLimit = previousLimit + PAGE_SIZE
    const token = paginationTracker.begin()
    set({ loadingMore: true, error: null, visibleLimit: requestedLimit })
    try {
      const res = await window.api.git.getCommitHistory(repoPath, requestedLimit + 1, 0)
      if (!res.ok) throw new Error(res.error)
      const isSameTarget = get().repoPath === repoPath && get().branch === branch
      // A target change mid-flight means the new target's own load() already reset
      // visibleLimit/commits for itself — this response is for a target that no
      // longer exists on screen, so it is dropped without touching current state.
      if (paginationTracker.isCurrent(token) && isSameTarget) {
        const deduped = dedupeByFullHash(res.data)
        set({ commits: deduped.slice(0, requestedLimit), hasMore: deduped.length > requestedLimit })
      }
    } catch {
      const isSameTarget = get().repoPath === repoPath && get().branch === branch
      if (paginationTracker.isCurrent(token) && isSameTarget) {
        set({ visibleLimit: previousLimit, error: STR.HISTORY_LOAD_MORE_FAILED })
      }
    } finally {
      set({ loadingMore: false })
    }
  },

  async returnLast() {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ returning: true, returnError: null, returnSuccessMessage: null })
    try {
      // The main process verifies HEAD is still this branch inside the compound
      // uncommit job before resetting anything (Phase 91, W1 — critical) — a moved
      // HEAD refuses with a plain message instead of returning the wrong commits.
      const expectedHeadBranch = useAppStore.getState().currentBranch ?? undefined
      const res = await window.api.history.returnLastCommit(repoPath, expectedHeadBranch)
      if (!res.ok) throw new Error(res.error)
      if (!res.data.ok) {
        set({ returnError: res.data.message ?? null })
        return
      }
      set({ returnSuccessMessage: 'Returned the last commit to your working changes.' })
      // load() re-takes a token and applies its own guard; a superseded reload from
      // here is dropped exactly as any other load() call would be.
      await get().load(repoPath, repository, useAppStore.getState().currentBranch)
      useAppStore.getState().navigate('status')
    } catch (err) {
      set({ returnError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ returning: false })
    }
  },

  async returnAllUnpushed() {
    const { repoPath, repository, unpushedCount } = get()
    if (!repoPath || !repository) return
    set({ returning: true, returnError: null, returnSuccessMessage: null })
    try {
      const expectedHeadBranch = useAppStore.getState().currentBranch ?? undefined
      const res = await window.api.history.returnUnpushed(repoPath, expectedHeadBranch)
      if (!res.ok) throw new Error(res.error)
      if (!res.data.ok) {
        set({ returnError: res.data.message ?? null })
        return
      }
      set({
        returnSuccessMessage: `Returned ${unpushedCount} unpushed commit${unpushedCount === 1 ? '' : 's'} to your working changes.`,
      })
      await get().load(repoPath, repository, useAppStore.getState().currentBranch)
      useAppStore.getState().navigate('status')
    } catch (err) {
      set({ returnError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ returning: false })
    }
  },

  clearReturnError() {
    set({ returnError: null })
  },
}))
