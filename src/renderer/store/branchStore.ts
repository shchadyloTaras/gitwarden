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
  /** Set when the safe `-d` delete refused with branchNotMerged — the escalated,
   * visibly stronger second confirm BranchesScreen renders (W6/W27). */
  forceDeleteConfirmBranch: string | null
  mergeConfirmBranch: string | null
  mergeConflict: RemediationFailure | null
  /** True while a switch (plain or the stash quick-fix) is in flight — the header
   * picker disables itself so a rapid second pick can't queue a checkout pile-up
   * (fix B, W3). */
  switching: boolean
  /** The last switch failure, tagged with which branch it was FOR (#13) — rendered
   * inline next to the header picker, not buried in the Branches-only `error`. */
  switchError: { branch: string; message: string } | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  doSwitch(branch: string): Promise<void>
  /** The "bring changes & switch" quick-fix: stash → switch → pop, one compound job.
   * Offered inline after a dirty-tree switch failure; runs behind the confirm the
   * button's own label constitutes (AGENTS.md #6). A pop conflict is never
   * auto-resolved — the stash stays, and the caller is routed to Status. */
  doSwitchBringChanges(branch: string): Promise<void>
  doCreate(name: string): Promise<void>
  doDelete(branch: string): Promise<void>
  /** The escalated path — `branch -D` — reachable only after doDelete's refusal. */
  doForceDelete(branch: string): Promise<void>
  doMerge(branch: string): Promise<void>
  setDeleteConfirm(branch: string | null): void
  setForceDeleteConfirm(branch: string | null): void
  setMergeConfirm(branch: string | null): void
  clearSwitchError(): void
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
  forceDeleteConfirmBranch: null,
  mergeConfirmBranch: null,
  mergeConflict: null,
  switching: false,
  switchError: null,

  async load(repoPath, repository) {
    const token = tracker.begin()
    // W5/W16: an armed destructive confirm (or a stale merge conflict) must not survive
    // a repo switch — reset them here, alongside the usual load-start hygiene. A stale
    // switchError from a different repo/branch must not survive either.
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      branches: [],
      successMessage: null,
      deleteConfirmBranch: null,
      forceDeleteConfirmBranch: null,
      mergeConfirmBranch: null,
      mergeConflict: null,
      switchError: null,
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
    const { repoPath, repository, switching } = get()
    if (!repoPath || !repository) return
    if (switching) return // non-reentrant (fix B) — ignore a rapid second pick
    const token = tracker.begin()
    set({ error: null, successMessage: null, switching: true, switchError: null })
    try {
      const res = await window.api.git.switchBranch(repoPath, branch)
      if (!res.ok) {
        if (tracker.isCurrent(token)) set({ switchError: { branch, message: res.error } })
        return
      }
      if (tracker.isCurrent(token)) useAppStore.getState().setCurrentBranch(branch)
      // Reload branch list so isCurrent flags update
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (branches) set({ branches })
        set({ successMessage: `Switched to ${branch}.` })
      }
    } catch (err) {
      if (tracker.isCurrent(token)) {
        set({ switchError: { branch, message: err instanceof Error ? err.message : String(err) } })
      }
    } finally {
      // switching is exclusive to doSwitch/doSwitchBringChanges — always clear it,
      // regardless of whether a later request has since superseded this call's
      // token (the Phase 89 stuck-busy-flag lesson).
      set({ switching: false })
    }
  },

  async doSwitchBringChanges(branch) {
    const { repoPath, repository, switching } = get()
    if (!repoPath || !repository) return
    if (switching) return
    const token = tracker.begin()
    set({ error: null, successMessage: null, switching: true, switchError: null })
    try {
      const res = await window.api.git.stashSwitchPop(repoPath, branch)
      if (!res.ok) throw new Error(res.error)
      if (!res.data.ok) {
        // A stash-pop conflict — never auto-resolved. The switch itself succeeded;
        // the stash is kept, and the user is routed to Status to finish resolving
        // it, exactly like a merge conflict.
        if (tracker.isCurrent(token)) {
          set({ switchError: { branch, message: res.data.message } })
          useAppStore.getState().setCurrentBranch(branch)
          useAppStore.getState().navigate('status')
        }
        return
      }
      if (tracker.isCurrent(token)) useAppStore.getState().setCurrentBranch(branch)
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (branches) set({ branches })
        set({ successMessage: `Switched to ${branch} and brought your changes along.` })
      }
    } catch (err) {
      if (tracker.isCurrent(token)) {
        set({ switchError: { branch, message: err instanceof Error ? err.message : String(err) } })
      }
    } finally {
      set({ switching: false })
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
      if (!res.ok) {
        if (res.code === 'branchNotMerged') {
          // Escalate to the second, visibly stronger confirm (W6/W27) instead of
          // surfacing this as a plain error — force-delete is reachable ONLY
          // through that confirm, honoring AGENTS.md #6.
          if (tracker.isCurrent(token)) set({ forceDeleteConfirmBranch: branch })
          return
        }
        throw new Error(res.error)
      }
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (branches) set({ branches })
        set({ successMessage: STR.BRANCH_DELETE_SUCCESS(branch) })
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

  async doForceDelete(branch) {
    const { repoPath, repository } = get()
    if (!repoPath || !repository) return
    const token = tracker.begin()
    set({ error: null, successMessage: null, forceDeleteConfirmBranch: null })
    try {
      const res = await window.api.git.forceDeleteBranch(repoPath, branch)
      if (!res.ok) throw new Error(res.error)
      const branches = await refreshBranches(repoPath)
      if (tracker.isCurrent(token)) {
        if (branches) set({ branches })
        set({ successMessage: STR.BRANCH_DELETE_SUCCESS(branch) })
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

  setForceDeleteConfirm(branch) {
    set({ forceDeleteConfirmBranch: branch })
  },

  setMergeConfirm(branch) {
    set({ mergeConfirmBranch: branch })
  },

  clearSwitchError() {
    set({ switchError: null })
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
      forceDeleteConfirmBranch: null,
      mergeConfirmBranch: null,
      mergeConflict: null,
      switchError: null,
    })
  },
}))
