import { create } from 'zustand'
import type { RepositoryRecord } from '../../core/types'

interface RepositoriesState {
  repos: RepositoryRecord[]
  loading: boolean
  load(): Promise<void>
  addRepository(localPath: string): Promise<RepositoryRecord>
  updateRepo(id: string, patch: Partial<Omit<RepositoryRecord, 'id'>>): Promise<void>
  removeRepo(id: string): Promise<void>
}

export const useRepositoriesStore = create<RepositoriesState>((set) => ({
  repos: [],
  loading: false,

  async load() {
    set({ loading: true })
    try {
      const res = await window.api.repositories.list()
      set({ repos: res.ok ? res.data : [] })
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
