export const LIVE_DEMO_PROFILES = ['Personal', 'Work', 'Client'] as const

export type LiveDemoProfile = (typeof LIVE_DEMO_PROFILES)[number]
export type LiveDemoOutcome = 'idle' | 'blocked' | 'ready' | 'complete'

export interface LiveDemoState {
  activeProfile: LiveDemoProfile
  outcome: LiveDemoOutcome
}

export type LiveDemoEvent =
  | { type: 'select-profile'; profile: LiveDemoProfile }
  | { type: 'attempt-commit' }
  | { type: 'apply-profile-fix' }
  | { type: 'reset' }

export interface LiveDemoView {
  guard: 'ready' | 'blocked'
  issuesVisible: boolean
  canCommit: boolean
}

export const LIVE_DEMO_INITIAL_STATE: Readonly<LiveDemoState> = {
  activeProfile: 'Personal',
  outcome: 'idle',
}

function selectProfile(profile: LiveDemoProfile): LiveDemoState {
  return {
    activeProfile: profile,
    outcome: profile === 'Client' ? 'ready' : 'idle',
  }
}

export function reduceLiveDemo(state: LiveDemoState, event: LiveDemoEvent): LiveDemoState {
  switch (event.type) {
    case 'select-profile':
      return selectProfile(event.profile)
    case 'attempt-commit':
      return state.activeProfile === 'Client'
        ? { activeProfile: 'Client', outcome: 'complete' }
        : { activeProfile: state.activeProfile, outcome: 'blocked' }
    case 'apply-profile-fix':
      return selectProfile('Client')
    case 'reset':
      return { ...LIVE_DEMO_INITIAL_STATE }
  }
}

export function deriveLiveDemoView(state: LiveDemoState): LiveDemoView {
  const guard = state.activeProfile === 'Client' ? 'ready' : 'blocked'

  return {
    guard,
    issuesVisible: guard === 'blocked' && state.outcome === 'blocked',
    canCommit: guard === 'ready' && state.outcome !== 'complete',
  }
}
