import { create } from 'zustand'
import type {
  GitRemote,
  EffectiveGitIdentity,
  RepositoryRecord,
  GitErrorCode,
} from '../../core/types'
import type { Remediation } from '../../core/safety/remediation'
import { useAppStore } from './appStore'

interface RemoteState {
  repoPath: string | null
  repository: RepositoryRecord | null
  remotes: GitRemote[]
  upstream: string | null
  identity: EffectiveGitIdentity | null
  loading: boolean
  fetchLoading: string | null
  pullLoading: string | null
  pushLoading: boolean
  error: string | null
  successMessage: string | null
  /**
   * The last push failure, retaining the structured `code`/`remediation` from the
   * IPC envelope so the recovery banner (Phase 66) can offer a one-click fix
   * instead of the opaque error string. Cleared on a new push and on repo load.
   */
  lastFailure: { message: string; code?: GitErrorCode; remediation?: Remediation } | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  doFetch(remote: string): Promise<void>
  doPull(remote: string, branch: string): Promise<void>
  doRemotePush(remote: string, branch: string): Promise<void>
  clearMessages(): void
  /** Record a (re-diagnosed) push failure — used when a one-click retry fails again. */
  setLastFailure(failure: RemoteState['lastFailure']): void
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  repoPath: null,
  repository: null,
  remotes: [],
  upstream: null,
  identity: null,
  loading: false,
  fetchLoading: null,
  pullLoading: null,
  pushLoading: false,
  error: null,
  successMessage: null,
  lastFailure: null,

  async load(repoPath, repository) {
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      remotes: [],
      identity: null,
      successMessage: null,
      lastFailure: null,
    })
    try {
      const [remotesRes, statusRes, identityRes] = await Promise.all([
        window.api.git.getRemotes(repoPath),
        window.api.git.getStatus(repoPath),
        window.api.git.getEffectiveIdentity(repoPath),
      ])
      const branch = statusRes.ok ? (statusRes.data.branch ?? null) : null
      set({
        remotes: remotesRes.ok ? remotesRes.data : [],
        upstream: statusRes.ok ? (statusRes.data.upstream ?? null) : null,
        identity: identityRes.ok ? identityRes.data : null,
        error: !remotesRes.ok
          ? remotesRes.error
          : !statusRes.ok
            ? statusRes.error
            : !identityRes.ok
              ? identityRes.error
              : null,
      })
      // appStore.currentBranch is the single source of truth for the current branch
      // (read by GlobalHeader and RemoteScreen alike) — push the live git status into
      // it rather than keeping a second copy here that could drift out of sync.
      if (branch) useAppStore.getState().setCurrentBranch(branch)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async doFetch(remote) {
    const { repoPath } = get()
    if (!repoPath) return
    set({ fetchLoading: remote, error: null, successMessage: null })
    try {
      const res = await window.api.git.fetch(repoPath, remote)
      if (!res.ok) throw new Error(res.error)
      set({ successMessage: `Fetched from ${remote}.` })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ fetchLoading: null })
    }
  },

  async doPull(remote, branch) {
    const { repoPath } = get()
    if (!repoPath) return
    set({ pullLoading: remote, error: null, successMessage: null })
    try {
      const res = await window.api.git.pull(repoPath, remote, branch)
      if (!res.ok) throw new Error(res.error)
      // Refresh status after pull
      const statusRes = await window.api.git.getStatus(repoPath)
      if (statusRes.ok) {
        const liveBranch = statusRes.data.branch ?? null
        if (liveBranch) useAppStore.getState().setCurrentBranch(liveBranch)
      }
      set({ successMessage: `Pulled ${branch} from ${remote}.` })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ pullLoading: null })
    }
  },

  async doRemotePush(remote, branch) {
    const { repoPath } = get()
    if (!repoPath) return
    set({ pushLoading: true, error: null, successMessage: null, lastFailure: null })
    try {
      const res = await window.api.git.push(repoPath, remote, branch)
      if (!res.ok) {
        // Retain the structured failure (code + remediation) so the recovery
        // banner can offer the one-click fix; the `error` string still shows too.
        set({
          error: res.error,
          lastFailure: { message: res.error, code: res.code, remediation: res.remediation },
        })
        return
      }
      set({ successMessage: `Pushed ${branch} to ${remote}.` })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, lastFailure: { message } })
    } finally {
      set({ pushLoading: false })
    }
  },

  clearMessages() {
    set({ error: null, successMessage: null, lastFailure: null })
  },

  setLastFailure(failure) {
    set({ lastFailure: failure, error: failure?.message ?? null })
  },
}))
