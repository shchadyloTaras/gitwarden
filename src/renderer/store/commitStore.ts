import { create } from 'zustand'
import type { GitStatus, EffectiveGitIdentity, RepositoryRecord } from '../../core/types'

interface CommitState {
  repoPath: string | null
  repository: RepositoryRecord | null
  message: string
  status: GitStatus | null
  identity: EffectiveGitIdentity | null
  loading: boolean
  identityLoading: boolean
  commitLoading: boolean
  error: string | null
  committedHash: string | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  setMessage(message: string): void
  applyLocalIdentity(name: string, email: string): Promise<void>
  doCommit(message: string): Promise<void>
}

export const useCommitStore = create<CommitState>((set, get) => ({
  repoPath: null,
  repository: null,
  message: '',
  status: null,
  identity: null,
  loading: false,
  identityLoading: false,
  commitLoading: false,
  error: null,
  committedHash: null,

  async load(repoPath, repository) {
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      status: null,
      identity: null,
      committedHash: null,
    })
    try {
      const [statusRes, identityRes] = await Promise.all([
        window.api.git.getStatus(repoPath),
        window.api.git.getEffectiveIdentity(repoPath),
      ])
      set({
        status: statusRes.ok ? statusRes.data : null,
        identity: identityRes.ok ? identityRes.data : null,
        error: !statusRes.ok ? statusRes.error : !identityRes.ok ? identityRes.error : null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  setMessage(message) {
    set({ message })
  },

  async applyLocalIdentity(name, email) {
    const { repoPath } = get()
    if (!repoPath) return
    set({ identityLoading: true })
    try {
      const res = await window.api.git.setLocalIdentity(repoPath, name, email)
      if (!res.ok) throw new Error(res.error)
      const identityRes = await window.api.git.getEffectiveIdentity(repoPath)
      if (identityRes.ok) set({ identity: identityRes.data })
    } finally {
      set({ identityLoading: false })
    }
  },

  async doCommit(message) {
    const { repoPath } = get()
    if (!repoPath) return
    set({ commitLoading: true, error: null })
    try {
      const res = await window.api.git.commit(repoPath, message)
      if (!res.ok) throw new Error(res.error)
      set({ committedHash: res.data.hash, message: '' })
      const statusRes = await window.api.git.getStatus(repoPath)
      if (statusRes.ok) set({ status: statusRes.data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ commitLoading: false })
    }
  },
}))
