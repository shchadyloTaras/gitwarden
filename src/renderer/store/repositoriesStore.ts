import { create } from 'zustand'
import type { RepositoryRecord } from '../../core/types'

interface RepositoriesState {
  repos: RepositoryRecord[]
  loading: boolean
  /**
   * Set when the last `load()` failed. A failed list() must never look identical to
   * "the user genuinely has zero repos" — auto-select (App.tsx) reads this to avoid
   * clearing the active repo on a transient fetch failure (audit #11, W32).
   */
  error: string | null
  load(): Promise<void>
  addRepository(localPath: string): Promise<RepositoryRecord>
  initializeRepository(
    localPath: string,
    remoteUrl: string | undefined,
    identity: { name: string; email: string },
    profileId: string
  ): Promise<{ repo: RepositoryRecord; remoteError?: string }>
  updateRepo(id: string, patch: Partial<Omit<RepositoryRecord, 'id'>>): Promise<void>
  removeRepo(id: string): Promise<void>
}

export const useRepositoriesStore = create<RepositoriesState>((set) => ({
  repos: [],
  loading: false,
  error: null,

  async load() {
    if (!window.api) return
    set({ loading: true, error: null })
    try {
      const res = await window.api.repositories.list()
      if (res.ok) {
        set({ repos: res.data })
      } else {
        // Keep the last-known repos list rather than wiping it to [] — a transient
        // list failure must not be indistinguishable from "zero repos" (#11, W32).
        set({ error: res.error })
      }
    } catch (err) {
      // IPC unavailable during HMR reload, or a genuine failure — either way, do not
      // wipe the repos list; surface it as an error, not a false empty state.
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async addRepository(localPath: string) {
    const validateRes = await window.api.git.validateRepository(localPath)
    if (!validateRes.ok) throw new Error(validateRes.error)
    const { name, remoteUrl } = validateRes.data

    const createRes = await window.api.repositories.create({
      name,
      localPath,
      remoteUrl,
      isFavorite: false,
    })
    if (!createRes.ok) throw new Error(createRes.error)
    set((s) => ({ repos: [...s.repos, createRes.data] }))
    return createRes.data
  },

  async initializeRepository(localPath, remoteUrl, identity, profileId) {
    const initRes = await window.api.git.initializeRepository({
      repoPath: localPath,
      remoteUrl,
      identityName: identity.name,
      identityEmail: identity.email,
    })
    if (!initRes.ok) throw new Error(initRes.error)
    const { name, remoteUrl: connectedRemoteUrl, remoteError } = initRes.data

    const createRes = await window.api.repositories.create({
      name,
      localPath,
      remoteUrl: connectedRemoteUrl,
      assignedProfileId: profileId,
      isFavorite: false,
    })
    if (!createRes.ok) throw new Error(createRes.error)
    set((s) => ({ repos: [...s.repos, createRes.data] }))
    return { repo: createRes.data, remoteError }
  },

  async updateRepo(id, patch) {
    const res = await window.api.repositories.update(id, patch)
    if (!res.ok) throw new Error(res.error)
    set((s) => ({ repos: s.repos.map((r) => (r.id === id ? res.data : r)) }))
  },

  async removeRepo(id) {
    const res = await window.api.repositories.delete(id)
    if (!res.ok) throw new Error(res.error)
    set((s) => ({ repos: s.repos.filter((r) => r.id !== id) }))
  },
}))
