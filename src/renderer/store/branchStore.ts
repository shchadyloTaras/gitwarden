import { create } from 'zustand'
import type { GitBranch, RepositoryRecord } from '../../core/types'
import type { RemediationFailure } from '../components/RemediationButton'
import { useAppStore } from './appStore'
import { STR } from '../strings'
import { createRequestTracker } from '../../core/concurrency/requestGuard'

const tracker = createRequestTracker()

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
    const token = tracker.begin()
    // W5/W16: an armed destructive confirm (or a stale merge conflict) must not survive
    // a repo switch — reset them here, alongside the usual load-start hygiene.
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      branches: [],
      successMessage: null,
      deleteConfirmBranch: null,
      mergeConfirmBranch: null,
      mergeConflict: null,
    })
    try {
      const res = await window.api.git.getBranches(repoPath)
      if (!res.ok) throw new Error(res.error)
      if (tracker.isCurrent(token)) {
        set({ branches: res.data })
        const current = res.data.find((b) => b.isCurrent)
        // branchStore is the sole writer of appStore.currentBranch (Phase 90) — always
        // assert the truth on every load: a real name, or null when none is found (the
        // previously-current branch was deleted/renamed away elsewhere) — audit #4.
        useAppStore.getState().setCurrentBranch(current ? current.name : null)
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (tracker.isCurrent(token)) set({ loading: false })
    }
  },

  async doSwitch(branch) {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    const token = tracker.begin()
    set({ error: null, successMessage: null })
    try {
      const res = await window.api.git.switchBranch(repoPath, branch)
      if (!res.ok) throw new Error(res.error)
      if (tracker.isCurrent(token)) useAppStore.getState().setCurrentBranch(branch)
      // Reload branch list so isCurrent flags update
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (branches) set({ branches })
        set({ successMessage: `Switched to ${branch}.` })
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  async doCreate(name) {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    const token = tracker.begin()
    set({ error: null, successMessage: null })
    try {
      const res = await window.api.git.createBranch(repoPath, name)
      if (!res.ok) throw new Error(res.error)
      if (tracker.isCurrent(token)) useAppStore.getState().setCurrentBranch(name)
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (branches) set({ branches })
        set({ successMessage: `Created and switched to ${name}.` })
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  async doDelete(branch) {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    const token = tracker.begin()
    set({ error: null, successMessage: null, deleteConfirmBranch: null })
    try {
      const res = await window.api.git.deleteBranch(repoPath, branch)
      if (!res.ok) throw new Error(res.error)
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (branches) set({ branches })
        set({ successMessage: `Deleted branch ${branch}.` })
      }
    } catch (err) {
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        set({
          ...(branches ? { branches } : {}),
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  },

  async doMerge(branch) {
    const { repoPath, repository, branches } = get()
    if (!repoPath || !repository) return
    const token = tracker.begin()
    // The genuinely-observed current branch (undefined, not a fallback, when the
    // local list has no isCurrent entry) — passed as expectedTargetBranch so the
    // main process can refuse if HEAD moved since this render (Phase 91, W8).
    // Falling back to `branch` here would be wrong: it would ask the compound job to
    // verify HEAD equals the branch being merged IN, which is never true.
    const currentBranchName = branches.find((b) => b.isCurrent)?.name
    const current = currentBranchName ?? branch
    set({
      error: null,
      successMessage: null,
      mergeConfirmBranch: null,
      mergeConflict: null,
    })
    try {
      const res = await window.api.git.merge(repoPath, branch, currentBranchName)
      if (!res.ok) {
        if (res.remediation) {
          if (tracker.isCurrent(token)) {
            set({ mergeConflict: { message: res.error, remediation: res.remediation } })
          }
          return
        }
        throw new Error(res.error)
      }
      const updated = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (updated) set({ branches: updated })
        set({ successMessage: STR.BRANCH_MERGE_SUCCESS(branch, current) })
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
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
    tracker.begin() // invalidate any in-flight request before wiping state
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
