/**
 * Pure state model for the landing live demo — a scripted, fully clickable
 * reproduction of the real app with everything already connected. The visitor can
 * open every sidebar screen, switch the active profile from the Profiles screen,
 * check out another branch, open the AI Chat tab, and run the scripted mistake:
 * a repository assigned to the Client profile still has Personal active, so
 * Commit & Push starts BLOCKED (issues visible, committing disabled — exactly
 * like the real screen) until the one-click remediation or a profile switch
 * fixes the identity.
 */
export const LIVE_DEMO_PROFILES = ['Personal', 'Work', 'Client'] as const
export type LiveDemoProfile = (typeof LIVE_DEMO_PROFILES)[number]

export const LIVE_DEMO_SCREENS = [
  'profiles',
  'repositories',
  'status',
  'commit',
  'branches',
  'history',
  'safety-center',
  'settings',
] as const
export type LiveDemoScreen = (typeof LIVE_DEMO_SCREENS)[number]

export const LIVE_DEMO_BRANCHES = ['main', 'feature/access-rules'] as const
export type LiveDemoBranch = (typeof LIVE_DEMO_BRANCHES)[number]

export type LiveDemoTab = 'context' | 'ai-chat'

/** null until a simulated action completes; then which success banner to show. */
export type LiveDemoCompletion = 'committed' | 'pushed' | null

export interface LiveDemoState {
  activeProfile: LiveDemoProfile
  screen: LiveDemoScreen
  branch: LiveDemoBranch
  panelTab: LiveDemoTab
  panelOpen: boolean
  completed: LiveDemoCompletion
}

export type LiveDemoEvent =
  | { type: 'navigate'; screen: LiveDemoScreen }
  | { type: 'set-profile'; profile: LiveDemoProfile }
  | { type: 'set-branch'; branch: LiveDemoBranch }
  | { type: 'set-panel-tab'; tab: LiveDemoTab }
  | { type: 'toggle-panel' }
  | { type: 'commit' }
  | { type: 'commit-and-push' }
  | { type: 'reset' }

export interface LiveDemoView {
  guard: 'ready' | 'blocked'
  /** Identity issues are live checks — shown whenever the wrong profile is active. */
  issuesVisible: boolean
  canCommit: boolean
  completed: LiveDemoCompletion
  /** Legacy single-word outcome kept as a root data-attribute for tests/CSS. */
  outcome: 'blocked' | 'ready' | 'committed' | 'pushed'
}

export const LIVE_DEMO_INITIAL_STATE: Readonly<LiveDemoState> = {
  activeProfile: 'Personal',
  screen: 'commit',
  branch: 'main',
  panelTab: 'context',
  panelOpen: true,
  completed: null,
}

function guardFor(profile: LiveDemoProfile): 'ready' | 'blocked' {
  return profile === 'Client' ? 'ready' : 'blocked'
}

export function reduceLiveDemo(state: LiveDemoState, event: LiveDemoEvent): LiveDemoState {
  switch (event.type) {
    case 'navigate':
      return { ...state, screen: event.screen }
    case 'set-profile':
      // The Profiles screen's Set Active and the issues-card remediation both land
      // here; a completed simulation stays completed (its banner is history, and
      // the staged file is already gone) while the live identity checks re-derive.
      return { ...state, activeProfile: event.profile }
    case 'set-branch':
      return { ...state, branch: event.branch }
    case 'set-panel-tab':
      return { ...state, panelTab: event.tab, panelOpen: true }
    case 'toggle-panel':
      return { ...state, panelOpen: !state.panelOpen }
    case 'commit':
      // Only possible with the right identity and something staged — mirrors the
      // real screen, where blockers (or an empty stage) disable the button.
      return guardFor(state.activeProfile) === 'ready' && state.completed === null
        ? { ...state, completed: 'committed' }
        : state
    case 'commit-and-push':
      return guardFor(state.activeProfile) === 'ready' && state.completed === null
        ? { ...state, completed: 'pushed' }
        : state
    case 'reset':
      return { ...LIVE_DEMO_INITIAL_STATE }
  }
}

export function deriveLiveDemoView(state: LiveDemoState): LiveDemoView {
  const guard = guardFor(state.activeProfile)
  const outcome = state.completed ?? (guard === 'ready' ? 'ready' : 'blocked')

  return {
    guard,
    issuesVisible: guard === 'blocked',
    canCommit: guard === 'ready' && state.completed === null,
    completed: state.completed,
    outcome,
  }
}
