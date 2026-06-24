import { create } from 'zustand'
import type { Profile } from '../../core/types'

const COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#34d399']

export function profileColor(id: string): string {
  let h = 5381
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h) ^ id.charCodeAt(i)
  return COLORS[Math.abs(h) % COLORS.length]
}

interface ProfilesState {
  profiles: Profile[]
  activeProfileId: string | null
  loading: boolean
  load(): Promise<void>
  createProfile(input: Omit<Profile, 'id'>): Promise<Profile>
  updateProfile(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<void>
  deleteProfile(id: string): Promise<void>
  setActiveProfile(id: string | null): Promise<void>
}

export const useProfilesStore = create<ProfilesState>((set) => ({
  profiles: [],
  activeProfileId: null,
  loading: false,

  async load() {
    if (!window.api) return
    set({ loading: true })
    try {
      const [profilesRes, settingsRes] = await Promise.all([
        window.api.profiles.list(),
        window.api.settings.get(),
      ])
      set({
        profiles: profilesRes.ok ? profilesRes.data : [],
        activeProfileId: settingsRes.ok ? (settingsRes.data.activeProfileId ?? null) : null,
      })
    } catch {
      // IPC unavailable during HMR reload — next effect invocation will succeed
    } finally {
      set({ loading: false })
    }
  },

  async createProfile(input) {
    const res = await window.api.profiles.create(input)
    if (!res.ok) throw new Error(res.error)
    set((s) => ({ profiles: [...s.profiles, res.data] }))
    return res.data
  },

  async updateProfile(id, patch) {
    const res = await window.api.profiles.update(id, patch)
    if (!res.ok) throw new Error(res.error)
    set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? res.data : p)) }))
  },

  async deleteProfile(id) {
    const res = await window.api.profiles.delete(id)
    if (!res.ok) throw new Error(res.error)
    set((s) => ({
      profiles: s.profiles.filter((p) => p.id !== id),
      activeProfileId: s.activeProfileId === id ? null : s.activeProfileId,
    }))
  },

  async setActiveProfile(profileId) {
    const res = await window.api.settings.update({ activeProfileId: profileId ?? undefined })
    if (!res.ok) throw new Error(res.error)
    set({ activeProfileId: profileId })
  },
}))
