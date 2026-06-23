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

export interface SeedProfile {
  id: string
  name: string
  gitName: string
  gitEmail: string
  color: string
}

export interface SeedRepo {
  id: string
  name: string
  path: string
  profileId: string
}

interface AppState {
  activeScreen: NavScreen
  activeProfile: SeedProfile | null
  activeRepo: SeedRepo | null
  currentBranch: string | null
  safetyBadge: SafetyBadge
  inspectorOpen: boolean

  navigate: (screen: NavScreen) => void
  setActiveProfile: (profile: SeedProfile | null) => void
  setActiveRepo: (repo: SeedRepo | null) => void
  setCurrentBranch: (branch: string | null) => void
  setSafetyBadge: (badge: SafetyBadge) => void
  toggleInspector: () => void
}

const SEED_PROFILE: SeedProfile = {
  id: 'seed-personal',
  name: 'Personal',
  gitName: 'Taras Shchadylo',
  gitEmail: 'taras@personal.dev',
  color: '#4ade80',
}

const SEED_REPO: SeedRepo = {
  id: 'seed-repo-1',
  name: 'gitwarden',
  path: '/Users/taras/projects/gitwarden',
  profileId: 'seed-personal',
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'repositories',
  activeProfile: SEED_PROFILE,
  activeRepo: SEED_REPO,
  currentBranch: 'main',
  safetyBadge: 'safe',
  inspectorOpen: true,

  navigate: (screen) => set({ activeScreen: screen }),
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  setActiveRepo: (repo) => set({ activeRepo: repo }),
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setSafetyBadge: (badge) => set({ safetyBadge: badge }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
}))
