import { create } from 'zustand'
import type { RepositoryRecord } from '../../core/types'
import { useProfilesStore } from './profilesStore'

/**
 * Switch the active profile to follow the repo's assigned profile.
 *
 * Fired on real repo changes (header picker, Repositories screen, auto-select) and
 * assignment refreshes so the identity surfaced in the header matches the repo you're
 * working in — the core "right profile for the right repo" promise. Deliberately scoped
 * to those changes: reselecting the same repo never pulls a manual profile override back,
 * so PROFILE_MISMATCH can still surface.
 *
 * No-ops when the repo is unassigned (leaves the current identity intact so
 * REPO_UNASSIGNED warns instead), when the assignment already matches, or when the
 * assigned profile isn't loaded yet (e.g. a pruned/dangling id).
 */
function syncProfileToRepo(repo: RepositoryRecord | null): void {
  if (!repo?.assignedProfileId) return
  const { activeProfileId, profiles, setActiveProfile } = useProfilesStore.getState()
  if (activeProfileId === repo.assignedProfileId) return
  if (!profiles.some((p) => p.id === repo.assignedProfileId)) return
  void setActiveProfile(repo.assignedProfileId).catch(() => {
    // Best-effort: a failed settings write leaves the previous active profile in place;
    // the next repo change retries. Surfacing an error here would interrupt navigation.
  })
}

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

/** Which tab the right panel shows: deterministic context, or the AI chat. */
export type RightPanelTab = 'context' | 'chat'

interface AppState {
  activeScreen: NavScreen
  activeRepo: RepositoryRecord | null
  currentBranch: string | null
  /** Whether the right panel column is visible (kept as `inspectorOpen` for compat). */
  inspectorOpen: boolean
  /** Active tab inside the right panel. */
  rightPanelTab: RightPanelTab
  /** Incremented when the user invokes the chat focus shortcut (Cmd/Ctrl+L). */
  chatFocusNonce: number

  navigate: (screen: NavScreen) => void
  setActiveRepo: (repo: RepositoryRecord | null) => void
  setCurrentBranch: (branch: string | null) => void
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
  inspectorOpen: true,
  rightPanelTab: 'context',
  chatFocusNonce: 0,

  navigate: (screen) => set({ activeScreen: screen }),
  setActiveRepo: (repo) => {
    let shouldSyncProfile = false
    set((s) => {
      const sameRepo = repo?.id === s.activeRepo?.id
      const assignmentChanged = repo?.assignedProfileId !== s.activeRepo?.assignedProfileId
      shouldSyncProfile = Boolean(repo && (!sameRepo || assignmentChanged))

      return {
        activeRepo: repo,
        // Switching to a different repo invalidates the branch; re-setting the *same*
        // repo (a metadata refresh, e.g. after editing its profile assignment) keeps it.
        currentBranch: sameRepo ? s.currentBranch : null,
      }
    })
    if (shouldSyncProfile) syncProfileToRepo(repo)
  },
  setCurrentBranch: (branch) => set({ currentBranch: branch }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  openRightPanel: (tab) => set({ inspectorOpen: true, rightPanelTab: tab }),
  requestChatFocus: () => set((s) => ({ chatFocusNonce: s.chatFocusNonce + 1 })),
}))
