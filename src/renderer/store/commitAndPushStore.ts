import { create } from 'zustand'
import {
  reduceCommitAndPushFlow,
  type CommitAndPushFlowState,
  type CommitAndPushFlowEvent,
} from '../../core/commitAndPush/flow'
import { useCommitStore } from './commitStore'
import { useRemoteStore } from './remoteStore'

interface CommitAndPushState {
  flow: CommitAndPushFlowState

  dispatch(event: CommitAndPushFlowEvent): void
  /** Opens the pre-flight sheet for an already-resolved remote (finding 6 — this is a
   *  store, not component state, so a mid-flight tab switch never orphans a running push). */
  open(remoteName: string): void
  cancel(): void
  /**
   * Runs the chained commit → push: `doCommit` first, and only on success
   * `doRemotePush` — reusing both stores' existing outcome machinery untouched
   * (their own `committedHash`/`successMessage`/`lastFailure` fields keep working
   * exactly as they do for the standalone Commit and Push actions). A failed push
   * never re-commits; `doRemotePush`'s own failure path already populates
   * `remoteStore.lastFailure`, so the existing recovery banner offers the fix.
   */
  confirm(message: string, branch: string): Promise<void>
  dismiss(): void
}

export const useCommitAndPushStore = create<CommitAndPushState>((set, get) => ({
  flow: { stage: 'idle' },

  dispatch(event) {
    set((s) => ({ flow: reduceCommitAndPushFlow(s.flow, event) }))
  },

  open(remoteName) {
    get().dispatch({ type: 'open', remoteName })
  },

  cancel() {
    get().dispatch({ type: 'cancel' })
  },

  async confirm(message, branch) {
    const before = get().flow
    if (before.stage !== 'confirming') return
    const remoteName = before.remoteName
    get().dispatch({ type: 'confirm' })

    await useCommitStore.getState().doCommit(message)
    const { committedHash, error: commitError } = useCommitStore.getState()
    if (!committedHash) {
      get().dispatch({ type: 'commit-failed', message: commitError ?? 'Commit failed.' })
      return
    }
    get().dispatch({ type: 'commit-succeeded', hash: committedHash })

    await useRemoteStore.getState().doRemotePush(remoteName, branch)
    const { error: pushError } = useRemoteStore.getState()
    if (pushError) {
      get().dispatch({ type: 'push-failed', message: pushError })
      return
    }
    get().dispatch({ type: 'push-succeeded' })
  },

  dismiss() {
    get().dispatch({ type: 'dismiss' })
  },
}))
