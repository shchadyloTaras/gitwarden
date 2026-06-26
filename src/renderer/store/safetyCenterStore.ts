import { create } from 'zustand'
import type {
  Profile,
  RepositoryRecord,
  EffectiveGitIdentity,
  GitRemote,
  SafetyCheckResult,
} from '../../core/types'
import { safetyCheckService } from '../../core/safety/SafetyCheckService'

interface SafetyCenterState {
  repoPath: string | null
  repository: RepositoryRecord | null
  activeProfile: Profile | null
  assignedProfile: Profile | null
  identity: EffectiveGitIdentity | null
  remotes: GitRemote[]
  currentBranch: string | null
  identityCheck: SafetyCheckResult | null
  pushCheck: SafetyCheckResult | null
  loading: boolean
  error: string | null

  load(
    repoPath: string,
    repository: RepositoryRecord,
    activeProfile: Profile | null,
    profiles: Profile[]
  ): Promise<void>
}

export const useSafetyCenterStore = create<SafetyCenterState>((set) => ({
  repoPath: null,
  repository: null,
  activeProfile: null,
  assignedProfile: null,
  identity: null,
  remotes: [],
  currentBranch: null,
  identityCheck: null,
  pushCheck: null,
  loading: false,
  error: null,

  async load(repoPath, repository, activeProfile, profiles) {
    const assignedProfile = profiles.find((p) => p.id === repository.assignedProfileId) ?? null
    // A stored assignedProfileId that no longer resolves to a profile (e.g. the profile
    // was deleted) is a dangling reference. Treat the repo as unassigned so the engine
    // reports an honest "no assigned profile" and the UI offers the reassign action,
    // instead of a dead-end phantom "mismatch" with no way to recover.
    const effectiveRepository: RepositoryRecord =
      repository.assignedProfileId && !assignedProfile
        ? { ...repository, assignedProfileId: undefined }
        : repository
    set({
      loading: true,
      error: null,
      repoPath,
      repository: effectiveRepository,
      activeProfile,
      assignedProfile,
      identity: null,
      remotes: [],
      currentBranch: null,
      identityCheck: null,
      pushCheck: null,
    })
    try {
      const [identityRes, remotesRes, statusRes] = await Promise.all([
        window.api.git.getEffectiveIdentity(repoPath),
        window.api.git.getRemotes(repoPath),
        window.api.git.getStatus(repoPath),
      ])

      const identity = identityRes.ok ? identityRes.data : null
      const remotes = remotesRes.ok ? remotesRes.data : []
      const currentBranch = statusRes.ok ? (statusRes.data.branch ?? null) : null

      const identityCheck = identity
        ? safetyCheckService.checkRepositoryIdentity({
            repository: effectiveRepository,
            activeProfile: activeProfile ?? undefined,
            identity,
          })
        : null

      const pushCheck = identity
        ? safetyCheckService.checkPush({
            repository: effectiveRepository,
            activeProfile: activeProfile ?? undefined,
            identity,
            remotes,
            currentBranch: currentBranch ?? undefined,
          })
        : null

      set({
        identity,
        remotes,
        currentBranch,
        identityCheck,
        pushCheck,
        error: !identityRes.ok
          ? identityRes.error
          : !remotesRes.ok
            ? remotesRes.error
            : !statusRes.ok
              ? statusRes.error
              : null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },
}))
