/**
 * Pure state model for the landing live demo — a scripted reproduction of the real
 * app's Commit & Push screen. The scenario is fixed and mirrors the actual product
 * behavior: a repository assigned to the Client profile still has Personal active,
 * so the screen starts BLOCKED with the safety issues visible (exactly like the real
 * CommitPushScreen, which always shows blockers and disables committing). The only
 * way forward is the same one-click remediation the app offers ("Switch to "Client""),
 * after which the visitor can run the simulated Commit or Commit & Push.
 */
export type LiveDemoProfile = 'Personal' | 'Client'

/**
 * blocked → the wrong profile is active; issues visible, committing disabled.
 * ready   → the fix was applied; Guard is green and both commit actions unlock.
 * committed / pushed → a simulated Commit Changes / Commit & Push completed.
 */
export type LiveDemoOutcome = 'blocked' | 'ready' | 'committed' | 'pushed'

export interface LiveDemoState {
  activeProfile: LiveDemoProfile
  outcome: LiveDemoOutcome
}

export type LiveDemoEvent =
  | { type: 'apply-profile-fix' }
  | { type: 'commit' }
  | { type: 'commit-and-push' }
  | { type: 'reset' }

export interface LiveDemoView {
  guard: 'ready' | 'blocked'
  issuesVisible: boolean
  canCommit: boolean
  /** Which simulated success banner to show, if any. */
  completed: 'committed' | 'pushed' | null
}

export const LIVE_DEMO_INITIAL_STATE: Readonly<LiveDemoState> = {
  activeProfile: 'Personal',
  outcome: 'blocked',
}

export function reduceLiveDemo(state: LiveDemoState, event: LiveDemoEvent): LiveDemoState {
  switch (event.type) {
    case 'apply-profile-fix':
      // The remediation only exists while blocked; applying it twice is a no-op.
      return state.outcome === 'blocked' ? { activeProfile: 'Client', outcome: 'ready' } : state
    case 'commit':
      // Committing is only possible once the identity is fixed — like the real
      // screen, where blockers disable the Commit button outright.
      return state.outcome === 'ready' ? { activeProfile: 'Client', outcome: 'committed' } : state
    case 'commit-and-push':
      return state.outcome === 'ready' ? { activeProfile: 'Client', outcome: 'pushed' } : state
    case 'reset':
      return { ...LIVE_DEMO_INITIAL_STATE }
  }
}

export function deriveLiveDemoView(state: LiveDemoState): LiveDemoView {
  const guard = state.activeProfile === 'Client' ? 'ready' : 'blocked'
  const completed =
    state.outcome === 'committed' ? 'committed' : state.outcome === 'pushed' ? 'pushed' : null

  return {
    guard,
    issuesVisible: state.outcome === 'blocked',
    canCommit: state.outcome === 'ready',
    completed,
  }
}
