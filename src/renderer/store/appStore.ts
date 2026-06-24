import { create } from 'zustand'
import type { RepositoryRecord } from '../../core/types'

export type NavScreen =
  | 'repositories'
  | 'status'
  | 'commit'
  | 'remote'
  | 'branches'
  | 'history'
  | 'safety-center'
  | 'profiles'
  | 'settings'

export type SafetyBadge = 'safe' | 'warning' | 'blocked'

interface AppState {
  activeScreen: NavScreen
  activeRepo: RepositoryRecord | null
  currentBranch: string | null
  safetyBadge: SafetyBadge
  inspectorOpen: boolean

  navigate: (screen: NavScreen) => void
  setActiveRepo: (repo: RepositoryRecord | null) => void
  setCurrentBranch: (branch: string | null) => void
  setSafetyBadge: (badge: SafetyBadge) => void
  toggleInspector: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'repositories',
  activeRepo: null,
  currentBranch: null,
  safetyBadge: 'safe',
  inspectorOpen: true,

  navigate: (screen) => set({ activeScreen: screen }),
  setActiveRepo: (repo) => set({ activeRepo: repo, currentBranch: null }),
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setSafetyBadge: (badge) => set({ safetyBadge: badge }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
}))
