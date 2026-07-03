import { create } from 'zustand'
import type { GitBranch, RepositoryRecord } from '../../core/types'
import type { RemediationFailure } from '../components/RemediationButton'
import { useAppStore } from './appStore'
import { STR } from '../strings'

interface BranchState {
  repoPath: string | null
  repository: RepositoryRecord | null
  branches: GitBranch[]
  loading: boolean
  error: string | null
  successMessage: string | null
  deleteConfirmBranch: string | null
  mergeConfirmBranch: string | null
  mergeConflict: RemediationFailure | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  doSwitch(branch: string): Promise<void>
  doCreate(name: string): Promise<void>
  doDelete(branch: string): Promise<void>
  doMerge(branch: string): Promise<void>
  setDeleteConfirm(branch: string | null): void
  setMergeConfirm(branch: string | null): void
  clearMessages(): void
  clear(): void
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
  mergeConfirmBranch: null,
  mergeConflict: null,

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

  async doMerge(branch) {
    const { repoPath, repository, branches } = get()
    if (!repoPath || !repository) return
    const current = branches.find((b) => b.isCurrent)?.name ?? branch
    set({
      error: null,
      successMessage: null,
      mergeConfirmBranch: null,
      mergeConflict: null,
    })
    try {
      const res = await window.api.git.merge(repoPath, branch)
      if (!res.ok) {
        if (res.remediation) {
          set({ mergeConflict: { message: res.error, remediation: res.remediation } })
          return
        }
        throw new Error(res.error)
      }
      const updated = await refreshBranches(repoPath)
      if (updated) set({ branches: updated })
      set({ successMessage: STR.BRANCH_MERGE_SUCCESS(branch, current) })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  setDeleteConfirm(branch) {
    set({ deleteConfirmBranch: branch })
  },

  setMergeConfirm(branch) {
    set({ mergeConfirmBranch: branch })
  },

  clearMessages() {
    set({ error: null, successMessage: null, mergeConflict: null })
  },

  clear() {
    set({
      branches: [],
      repoPath: null,
      repository: null,
      error: null,
      successMessage: null,
      deleteConfirmBranch: null,
      mergeConfirmBranch: null,
      mergeConflict: null,
    })
  },
}))
