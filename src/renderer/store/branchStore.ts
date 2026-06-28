import { create } from 'zustand'
import type { GitBranch, RepositoryRecord } from '../../core/types'
import { useAppStore } from './appStore'

interface BranchState {
  repoPath: string | null
  repository: RepositoryRecord | null
  branches: GitBranch[]
  loading: boolean
  error: string | null
  successMessage: string | null
  deleteConfirmBranch: string | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  doSwitch(branch: string): Promise<void>
  doCreate(name: string): Promise<void>
  doDelete(branch: string): Promise<void>
  setDeleteConfirm(branch: string | null): void
  clearMessages(): void
}

async function refreshBranches(repoPath: string): Promise<GitBranch[] | null> {
  const listRes = await window.api.git.getBranches(repoPath)
  return listRes.ok ? listRes.data : null
}

export const useBranchStore = create<BranchState>((set, get) => ({
  repoPath: null,
  repository: null,
  branches: [],
  loading: false,
  error: null,
  successMessage: null,
  deleteConfirmBranch: null,

  async load(repoPath, repository) {
    set({ loading: true, error: null, repoPath, repository, branches: [], successMessage: null })
    try {
      const res = await window.api.git.getBranches(repoPath)
      if (!res.ok) throw new Error(res.error)
      set({ branches: res.data })
      const current = res.data.find((b) => b.isCurrent)
      if (current) useAppStore.getState().setCurrentBranch(current.name)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async doSwitch(branch) {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ error: null, successMessage: null })
    try {
      const res = await window.api.git.switchBranch(repoPath, branch)
      if (!res.ok) throw new Error(res.error)
      useAppStore.getState().setCurrentBranch(branch)
      // Reload branch list so isCurrent flags update
      const branches = await refreshBranches(repoPath)
      if (branches) set({ branches })
      set({ successMessage: `Switched to ${branch}.` })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  async doCreate(name) {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ error: null, successMessage: null })
    try {
      const res = await window.api.git.createBranch(repoPath, name)
      if (!res.ok) throw new Error(res.error)
      useAppStore.getState().setCurrentBranch(name)
      const branches = await refreshBranches(repoPath)
      if (branches) set({ branches })
      set({ successMessage: `Created and switched to ${name}.` })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  async doDelete(branch) {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    set({ error: null, successMessage: null, deleteConfirmBranch: null })
    try {
      const res = await window.api.git.deleteBranch(repoPath, branch)
      if (!res.ok) throw new Error(res.error)
      const branches = await refreshBranches(repoPath)
      if (branches) set({ branches })
      set({ successMessage: `Deleted branch ${branch}.` })
    } catch (err) {
      const branches = await refreshBranches(repoPath)
      set({
        ...(branches ? { branches } : {}),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  setDeleteConfirm(branch) {
    set({ deleteConfirmBranch: branch })
  },

  clearMessages() {
    set({ error: null, successMessage: null })
  },
}))
