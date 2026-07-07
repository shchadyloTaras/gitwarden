import { create } from 'zustand'
import type { GitCommit, RepositoryRecord } from '../../core/types'
import type { UncommitEligibility } from '../../core/history/uncommit'
import { useAppStore } from './appStore'
import { createRequestTracker } from '../../core/concurrency/requestGuard'

const tracker = createRequestTracker()

const PAGE_SIZE = 50

interface HistoryState {
  repoPath: string | null
  repository: RepositoryRecord | null
  commits: GitCommit[]
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

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  loadMore(): Promise<void>
  returnLast(): Promise<void>
  returnAllUnpushed(): Promise<void>
  clearReturnError(): void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  repoPath: null,
  repository: null,
  commits: [],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  eligibility: null,
  unpushedCount: 0,
  returning: false,
  returnError: null,

  async load(repoPath, repository) {
    const token = tracker.begin()
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      commits: [],
      hasMore: false,
      eligibility: null,
      unpushedCount: 0,
      returnError: null,
    })
    try {
      const [historyRes, returnStateRes] = await Promise.all([
        window.api.git.getCommitHistory(repoPath, PAGE_SIZE, 0),
        window.api.history.getReturnState(repoPath),
      ])
      if (!historyRes.ok) throw new Error(historyRes.error)
      if (tracker.isCurrent(token)) {
        set({ commits: historyRes.data, hasMore: historyRes.data.length === PAGE_SIZE })
        if (returnStateRes.ok) {
          set({
            eligibility: returnStateRes.data.eligibility,
            unpushedCount: returnStateRes.data.unpushedCount,
          })
        }
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (tracker.isCurrent(token)) set({ loading: false })
    }
  },

  async loadMore() {
    const { repoPath, commits } = get()
    if (!repoPath) return
    const token = tracker.begin()
    set({ loadingMore: true, error: null })
    try {
      const res = await window.api.git.getCommitHistory(repoPath, PAGE_SIZE, commits.length)
      if (!res.ok) throw new Error(res.error)
      // #6: a load() (e.g. a branch/repo switch) that started after this page was
      // requested must win — an appended page from the wrong branch is worse than none.
      if (tracker.isCurrent(token)) {
        set((s) => ({
          commits: [...s.commits, ...res.data],
          hasMore: res.data.length === PAGE_SIZE,
        }))
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      // loadingMore is exclusive to this method — always clear it, regardless of
      // whether a later load() has since superseded this call's token.
      set({ loadingMore: false })
    }
  },

  async returnLast() {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ returning: true, returnError: null })
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
      // load() re-takes a token and applies its own guard; a superseded reload from
      // here is dropped exactly as any other load() call would be.
      await get().load(repoPath, repository)
      useAppStore.getState().navigate('status')
    } catch (err) {
      set({ returnError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ returning: false })
    }
  },

  async returnAllUnpushed() {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ returning: true, returnError: null })
    try {
      const expectedHeadBranch = useAppStore.getState().currentBranch ?? undefined
      const res = await window.api.history.returnUnpushed(repoPath, expectedHeadBranch)
      if (!res.ok) throw new Error(res.error)
      if (!res.data.ok) {
        set({ returnError: res.data.message ?? null })
        return
      }
      await get().load(repoPath, repository)
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
