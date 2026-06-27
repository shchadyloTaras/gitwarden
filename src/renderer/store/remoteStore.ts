import { create } from 'zustand'
import type { GitRemote, EffectiveGitIdentity, RepositoryRecord } from '../../core/types'

interface RemoteState {
  repoPath: string | null
  repository: RepositoryRecord | null
  remotes: GitRemote[]
  currentBranch: string | null
  upstream: string | null
  identity: EffectiveGitIdentity | null
  loading: boolean
  fetchLoading: string | null
  pullLoading: string | null
  pushLoading: boolean
  error: string | null
  successMessage: string | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  doFetch(remote: string): Promise<void>
  doPull(remote: string, branch: string): Promise<void>
  doRemotePush(remote: string, branch: string): Promise<void>
  clearMessages(): void
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  repoPath: null,
  repository: null,
  remotes: [],
  currentBranch: null,
  upstream: null,
  identity: null,
  loading: false,
  fetchLoading: null,
  pullLoading: null,
  pushLoading: false,
  error: null,
  successMessage: null,

  async load(repoPath, repository) {
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      remotes: [],
      currentBranch: null,
      identity: null,
      successMessage: null,
    })
    try {
      const [remotesRes, statusRes, identityRes] = await Promise.all([
        window.api.git.getRemotes(repoPath),
        window.api.git.getStatus(repoPath),
        window.api.git.getEffectiveIdentity(repoPath),
      ])
      set({
        remotes: remotesRes.ok ? remotesRes.data : [],
        currentBranch: statusRes.ok ? (statusRes.data.branch ?? null) : null,
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
      if (statusRes.ok) set({ currentBranch: statusRes.data.branch ?? null })
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
    set({ pushLoading: true, error: null, successMessage: null })
    try {
      const res = await window.api.git.push(repoPath, remote, branch)
      if (!res.ok) throw new Error(res.error)
      set({ successMessage: `Pushed ${branch} to ${remote}.` })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ pushLoading: false })
    }
  },

  clearMessages() {
    set({ error: null, successMessage: null })
  },
}))
