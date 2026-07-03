import { create } from 'zustand'
import type { RepositoryRecord } from '../../core/types'

interface RepositoriesState {
  repos: RepositoryRecord[]
  loading: boolean
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

  async load() {
    if (!window.api) return
    set({ loading: true })
    try {
      const res = await window.api.repositories.list()
      set({ repos: res.ok ? res.data : [] })
    } catch {
      // IPC unavailable during HMR reload — next effect invocation will succeed
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
