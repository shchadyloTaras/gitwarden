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

/** Which tab the right panel shows: deterministic context, or the AI chat. */
export type RightPanelTab = 'context' | 'chat'

interface AppState {
  activeScreen: NavScreen
  activeRepo: RepositoryRecord | null
  currentBranch: string | null
  safetyBadge: SafetyBadge
  /** Whether the right panel column is visible (kept as `inspectorOpen` for compat). */
  inspectorOpen: boolean
  /** Active tab inside the right panel. */
  rightPanelTab: RightPanelTab
  /** Incremented when the user invokes the chat focus shortcut (Cmd/Ctrl+L). */
  chatFocusNonce: number

  navigate: (screen: NavScreen) => void
  setActiveRepo: (repo: RepositoryRecord | null) => void
  setCurrentBranch: (branch: string | null) => void
  setSafetyBadge: (badge: SafetyBadge) => void
  toggleInspector: () => void
  setRightPanelTab: (tab: RightPanelTab) => void
  /** Open the right panel on a specific tab (used by the header chat affordance). */
  openRightPanel: (tab: RightPanelTab) => void
  /** Focus the chat composer (used by Cmd/Ctrl+L). */
  requestChatFocus: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeScreen: 'repositories',
  activeRepo: null,
  currentBranch: null,
  safetyBadge: 'safe',
  inspectorOpen: true,
  rightPanelTab: 'context',
  chatFocusNonce: 0,

  navigate: (screen) => set({ activeScreen: screen }),
  setActiveRepo: (repo) => set({ activeRepo: repo, currentBranch: null }),
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  setSafetyBadge: (badge) => set({ safetyBadge: badge }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  openRightPanel: (tab) => set({ inspectorOpen: true, rightPanelTab: tab }),
  requestChatFocus: () => set((s) => ({ chatFocusNonce: s.chatFocusNonce + 1 })),
}))
