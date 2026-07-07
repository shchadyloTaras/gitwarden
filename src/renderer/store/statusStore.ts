import { create } from 'zustand'
import type { GitStatus } from '../../core/types'
import { createRequestTracker } from '../../core/concurrency/requestGuard'

const tracker = createRequestTracker()

interface StatusState {
  status: GitStatus | null
  loading: boolean
  error: string | null
  repoPath: string | null

  loadStatus(repoPath: string): Promise<void>
  stageFile(filePath: string): Promise<void>
  unstageFile(filePath: string): Promise<void>
  stageAll(): Promise<void>
  unstageAll(): Promise<void>
}

export const useStatusStore = create<StatusState>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  repoPath: null,

  async loadStatus(repoPath: string) {
    const token = tracker.begin()
    // W7: reset the stale payload when the target repo differs from the one already
    // loaded, so a superseded row can't be clicked mid-load; an in-place refresh of
    // the SAME repo stays flicker-free (status keeps rendering while it reloads).
    const isRepoChange = get().repoPath !== repoPath
    set({ loading: true, error: null, repoPath, ...(isRepoChange ? { status: null } : {}) })
    try {
      const res = await window.api.git.getStatus(repoPath)
      if (res.ok) {
        if (tracker.isCurrent(token)) set({ status: res.data })
      } else {
        if (tracker.isCurrent(token)) set({ error: res.error, status: null })
      }
    } catch (err) {
      if (tracker.isCurrent(token)) {
        set({ error: err instanceof Error ? err.message : String(err), status: null })
      }
    } finally {
      if (tracker.isCurrent(token)) set({ loading: false })
    }
  },

  async stageFile(filePath: string) {
    const { repoPath } = get()
    if (!repoPath) return
    const res = await window.api.git.stageFile(repoPath, filePath)
    if (!res.ok) throw new Error(res.error)
    await get().loadStatus(repoPath)
  },

  async unstageFile(filePath: string) {
    const { repoPath } = get()
    if (!repoPath) return
    const res = await window.api.git.unstageFile(repoPath, filePath)
    if (!res.ok) throw new Error(res.error)
    await get().loadStatus(repoPath)
  },

  async stageAll() {
    const { repoPath } = get()
    if (!repoPath) return
    const res = await window.api.git.stageAll(repoPath)
    if (!res.ok) throw new Error(res.error)
    await get().loadStatus(repoPath)
  },

  async unstageAll() {
    const { repoPath } = get()
    if (!repoPath) return
    const res = await window.api.git.unstageAll(repoPath)
    if (!res.ok) throw new Error(res.error)
    await get().loadStatus(repoPath)
  },
}))
