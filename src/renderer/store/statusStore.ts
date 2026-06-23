import { create } from 'zustand'
import type { GitStatus } from '../../core/types'

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
    set({ loading: true, error: null, repoPath })
    try {
      const res = await window.api.git.getStatus(repoPath)
      if (res.ok) {
        set({ status: res.data })
      } else {
        set({ error: res.error, status: null })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), status: null })
    } finally {
      set({ loading: false })
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
