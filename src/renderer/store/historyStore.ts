import { create } from 'zustand'
import type { GitCommit, RepositoryRecord } from '../../core/types'
import type { UncommitEligibility } from '../../core/history/uncommit'
import { useAppStore } from './appStore'

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
      set({ commits: historyRes.data, hasMore: historyRes.data.length === PAGE_SIZE })
      if (returnStateRes.ok) {
        set({
          eligibility: returnStateRes.data.eligibility,
          unpushedCount: returnStateRes.data.unpushedCount,
        })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async loadMore() {
    const { repoPath, commits } = get()
    if (!repoPath) return
    set({ loadingMore: true, error: null })
    try {
      const res = await window.api.git.getCommitHistory(repoPath, PAGE_SIZE, commits.length)
      if (!res.ok) throw new Error(res.error)
      set((s) => ({
        commits: [...s.commits, ...res.data],
        hasMore: res.data.length === PAGE_SIZE,
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loadingMore: false })
    }
  },

  async returnLast() {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ returning: true, returnError: null })
    try {
      const res = await window.api.history.returnLastCommit(repoPath)
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

  async returnAllUnpushed() {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ returning: true, returnError: null })
    try {
      const res = await window.api.history.returnUnpushed(repoPath)
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
