// Pure reducer: the chained commit → push execution as an explicit state machine.
// No timers, randomness, or side effects — the renderer store drives real actions and
// feeds their outcomes back in as events.

export type CommitAndPushFlowState =
  | { stage: 'idle' }
  | { stage: 'confirming'; remoteName: string }
  | { stage: 'committing'; remoteName: string }
  | { stage: 'pushing'; remoteName: string; committedHash: string }
  | { stage: 'done'; remoteName: string; committedHash: string }
  | { stage: 'commit-failed'; message: string }
  | { stage: 'push-failed'; remoteName: string; committedHash: string; message: string }

export type CommitAndPushFlowEvent =
  | { type: 'open'; remoteName: string }
  | { type: 'cancel' } // only from 'confirming' — never mid-execution
  | { type: 'confirm' }
  | { type: 'commit-succeeded'; hash: string }
  | { type: 'commit-failed'; message: string }
  | { type: 'push-succeeded' }
  | { type: 'push-failed'; message: string }
  | { type: 'dismiss' } // from terminal stages back to idle

export function reduceCommitAndPushFlow(
  state: CommitAndPushFlowState,
  event: CommitAndPushFlowEvent
): CommitAndPushFlowState {
  switch (state.stage) {
    case 'idle':
      if (event.type === 'open') return { stage: 'confirming', remoteName: event.remoteName }
      return state

    case 'confirming':
      if (event.type === 'cancel') return { stage: 'idle' }
      if (event.type === 'confirm') return { stage: 'committing', remoteName: state.remoteName }
      return state

    case 'committing':
      if (event.type === 'commit-succeeded') {
        return { stage: 'pushing', remoteName: state.remoteName, committedHash: event.hash }
      }
      if (event.type === 'commit-failed') {
        return { stage: 'commit-failed', message: event.message }
      }
      return state

    case 'pushing':
      if (event.type === 'push-succeeded') {
        return { stage: 'done', remoteName: state.remoteName, committedHash: state.committedHash }
      }
      if (event.type === 'push-failed') {
        return {
          stage: 'push-failed',
          remoteName: state.remoteName,
          committedHash: state.committedHash,
          message: event.message,
        }
      }
      return state

    case 'done':
    case 'commit-failed':
    case 'push-failed':
      if (event.type === 'dismiss') return { stage: 'idle' }
      return state

    default:
      return state
  }
}
