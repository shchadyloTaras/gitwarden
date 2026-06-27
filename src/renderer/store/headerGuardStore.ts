import { create } from 'zustand'
import type { Profile, RepositoryRecord } from '../../core/types'
import { deriveHeaderGuard, type HeaderGuardState } from '../../core/safety/headerGuard'

interface HeaderGuardStoreState {
  loading: boolean
  state: HeaderGuardState
  issueCount: number
  error: string | null

  /**
   * Recompute the guard for the active repo. Calls ONLY getEffectiveIdentity (the header
   * needs no remotes/status), applies the same dangling-profile normalization as
   * safetyCenterStore, then maps via the pure deriveHeaderGuard so the header and Safety
   * Center can never disagree.
   */
  refresh(
    repoPath: string,
    repository: RepositoryRecord,
    activeProfile: Profile | null,
    profiles: Profile[]
  ): Promise<void>

  /** No active repo: clear to the neutral 'not-checked' chip. */
  reset(): void
}

// Monotonic request id: the header recomputes on every fast repo switch, so a slow
// getEffectiveIdentity for repo A must not land after a newer refresh for repo B and
// overwrite it. Each refresh captures its id; results from a superseded refresh are dropped.
let reqId = 0

export const useHeaderGuardStore = create<HeaderGuardStoreState>((set) => ({
  loading: false,
  state: 'not-checked',
  issueCount: 0,
  error: null,

  async refresh(repoPath, repository, activeProfile, profiles) {
    const myReq = ++reqId
    set({ loading: true, state: 'checking', issueCount: 0, error: null })

    // A stored assignedProfileId that no longer resolves to a profile is a dangling
    // reference (e.g. the profile was deleted). Treat the repo as unassigned so the header
    // reports an honest REPO_UNASSIGNED — matching safetyCenterStore's verdict exactly.
    const assignedProfile = profiles.find((p) => p.id === repository.assignedProfileId) ?? null
    const effectiveRepository: RepositoryRecord =
      repository.assignedProfileId && !assignedProfile
        ? { ...repository, assignedProfileId: undefined }
        : repository

    const res = await window.api.git.getEffectiveIdentity(repoPath)
    if (myReq !== reqId) return // superseded by a newer refresh — drop this stale result

    const identity = res.ok ? res.data : null
    const guard = deriveHeaderGuard({
      loading: false,
      hasRepo: true,
      errored: !res.ok,
      repository: effectiveRepository,
      activeProfile,
      identity,
    })
    set({
      loading: false,
      state: guard.state,
      issueCount: guard.issueCount,
      error: res.ok ? null : res.error,
    })
  },

  reset() {
    // Bump reqId so any in-flight refresh result is dropped — switching away from a repo
    // must not let a late identity result flip the chip off 'not-checked'.
    reqId++
    set({ loading: false, state: 'not-checked', issueCount: 0, error: null })
  },
}))
