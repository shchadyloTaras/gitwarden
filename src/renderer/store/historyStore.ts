import { create } from 'zustand'
import type { GitCommit, RepositoryRecord } from '../../core/types'

const PAGE_SIZE = 50

interface HistoryState {
  repoPath: string | null
  repository: RepositoryRecord | null
  commits: GitCommit[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  loadMore(): Promise<void>
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  repoPath: null,
  repository: null,
  commits: [],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,

  async load(repoPath, repository) {
    set({ loading: true, error: null, repoPath, repository, commits: [], hasMore: false })
    try {
      const res = await window.api.git.getCommitHistory(repoPath, PAGE_SIZE, 0)
      if (!res.ok) throw new Error(res.error)
      set({ commits: res.data, hasMore: res.data.length === PAGE_SIZE })
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
}))
