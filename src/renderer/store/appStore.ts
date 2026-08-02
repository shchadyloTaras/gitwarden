import { create } from 'zustand'
import type { RepositoryRecord } from '../../core/types'
import { useProfilesStore } from './profilesStore'

/**
 * Full value equality (not just `id`) — a same-repo metadata save (e.g. editing notes or
 * a push policy) constructs a fresh object with identical id but a genuinely different
 * field, and that case must still go through as a real change. `JSON.stringify` is safe
 * here: `RepositoryRecord` is a plain JSON-serializable record built consistently from
 * IPC responses / zod-parsed data, so key order is stable across instances (audit W30).
 */
function sameRepoRecord(a: RepositoryRecord | null, b: RepositoryRecord | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

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
  /** Profile selected for inspection/editing on Profiles; transient renderer state only. */
  selectedProfileId: string | null
  /** Whether the right panel column is visible (kept as `inspectorOpen` for compat). */
  inspectorOpen: boolean
  /** Active tab inside the right panel. */
  rightPanelTab: RightPanelTab
  /** Incremented when the user invokes the chat focus shortcut (Cmd/Ctrl+L). */
  chatFocusNonce: number

  navigate: (screen: NavScreen) => void
  setActiveRepo: (repo: RepositoryRecord | null) => void
  setCurrentBranch: (branch: string | null) => void
  setSelectedProfileId: (profileId: string | null) => void
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
  selectedProfileId: null,
  inspectorOpen: true,
  rightPanelTab: 'context',
  chatFocusNonce: 0,

  // 'remote' is a legacy id from before the Commit and Remote tabs were unified into
  // one "Commit & Push" tab. NavScreen and core's NavTarget both keep it as a stable
  // id (existing remediations still route `configure-remote` there), but the renderer
  // has only one screen for it now — normalize here so every caller lands correctly.
  navigate: (screen) => set({ activeScreen: screen === 'remote' ? 'commit' : screen }),
  setActiveRepo: (repo) => {
    let shouldSyncProfile = false
    set((s) => {
      // Bail entirely on a value-equal record — returning the same state reference is a
      // documented Zustand no-op (no merge, no listener notification), so a same-repo
      // re-select or an unrelated re-render can never churn activeRepo's identity and
      // retrigger every effect keyed on it (W30).
      if (sameRepoRecord(repo, s.activeRepo)) return s

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
  setSelectedProfileId: (profileId) => set({ selectedProfileId: profileId }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  openRightPanel: (tab) => set({ inspectorOpen: true, rightPanelTab: tab }),
  requestChatFocus: () => set((s) => ({ chatFocusNonce: s.chatFocusNonce + 1 })),
}))
