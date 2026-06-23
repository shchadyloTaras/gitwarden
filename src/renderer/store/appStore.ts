import { create } from 'zustand'

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

export interface SeedRepo {
  id: string
  name: string
  path: string
  profileId: string
}

interface AppState {
  activeScreen: NavScreen
  activeRepo: SeedRepo | null
  currentBranch: string | null
  safetyBadge: SafetyBadge
  inspectorOpen: boolean

  navigate: (screen: NavScreen) => void
  setActiveRepo: (repo: SeedRepo | null) => void
  setCurrentBranch: (branch: string | null) => void
  setSafetyBadge: (badge: SafetyBadge) => void
  toggleInspector: () => void
}

const SEED_REPO: SeedRepo = {
  id: 'seed-repo-1',
  name: 'gitwarden',
  path: '/Users/taras/projects/gitwarden',
  profileId: '',
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'repositories',
  activeRepo: SEED_REPO,
  currentBranch: 'main',
  safetyBadge: 'safe',
  inspectorOpen: true,

  navigate: (screen) => set({ activeScreen: screen }),
  setActiveRepo: (repo) => set({ activeRepo: repo }),
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setSafetyBadge: (badge) => set({ safetyBadge: badge }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
}))
