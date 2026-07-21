import { create } from 'zustand'
import type {
  GitRemote,
  EffectiveGitIdentity,
  RepositoryRecord,
  GitErrorCode,
} from '../../core/types'
import type { Remediation } from '../../core/safety/remediation'
import { useAppStore } from './appStore'
import { useBranchStore } from './branchStore'
import { useHistoryStore } from './historyStore'
import { createRequestTracker } from '../../core/concurrency/requestGuard'

const tracker = createRequestTracker()

interface RemoteState {
  repoPath: string | null
  repository: RepositoryRecord | null
  remotes: GitRemote[]
  upstream: string | null
  /** True when `upstream` is configured but its remote-tracking ref is gone (Phase 92, W20) —
   * rendered honestly instead of a misleading "0 ahead / 0 behind". */
  upstreamGone: boolean
  identity: EffectiveGitIdentity | null
  loading: boolean
  fetchLoading: string | null
  pullLoading: string | null
  pushLoading: boolean
  error: string | null
  successMessage: string | null
  /**
   * The last push OR pull failure, retaining the structured `code`/`remediation`
   * from the IPC envelope so the recovery banner (Phase 66; Phase 71 extends it to
   * pull) can offer a one-click fix instead of the opaque error string. `remote`/
   * `branch` are carried here (not just read from `selectedRemote`, which the push
   * sheet sets but a pull failure never does) so the banner's fix button has a
   * target regardless of which action failed. Cleared on a new push/pull and on
   * repo load.
   */
  lastFailure: {
    message: string
    code?: GitErrorCode
    remediation?: Remediation
    remote?: string
    branch?: string
  } | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  doFetch(remote: string): Promise<void>
  doPull(remote: string, branch: string): Promise<void>
  doRemotePush(remote: string, branch: string): Promise<void>
  clearMessages(): void
  /** Record a (re-diagnosed) push failure — used when a one-click retry fails again. */
  setLastFailure(failure: RemoteState['lastFailure']): void
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  repoPath: null,
  repository: null,
  remotes: [],
  upstream: null,
  upstreamGone: false,
  identity: null,
  loading: false,
  fetchLoading: null,
  pullLoading: null,
  pushLoading: false,
  error: null,
  successMessage: null,
  lastFailure: null,

  async load(repoPath, repository) {
    const token = tracker.begin()
    // Phase 102: successMessage/lastFailure are operation OUTCOMES, not loaded data —
    // a same-repo refresh (a watcher event, focus revalidation, re-selecting the same
    // repo) must not wipe them out from under the user. They reset only on an actual
    // repo change here; an explicit dismiss (clearMessages) or the start of a new
    // push/pull/fetch (each sets its own fresh null) are the other two reset paths.
    const isRepoChange = get().repoPath !== repoPath
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      remotes: [],
      // #9: upstream must reset with the rest of the load — a stale upstream from the
      // previous repo must not survive as this repo's answer.
      upstream: null,
      upstreamGone: false,
      identity: null,
      ...(isRepoChange ? { successMessage: null, lastFailure: null } : {}),
    })
    try {
      const [remotesRes, statusRes, identityRes] = await Promise.all([
        window.api.git.getRemotes(repoPath),
        window.api.git.getStatus(repoPath),
        window.api.git.getEffectiveIdentity(repoPath),
      ])
      const branch = statusRes.ok ? (statusRes.data.branch ?? null) : null
      if (tracker.isCurrent(token)) {
        set({
          remotes: remotesRes.ok ? remotesRes.data : [],
          upstream: statusRes.ok ? (statusRes.data.upstream ?? null) : null,
          upstreamGone: statusRes.ok ? Boolean(statusRes.data.upstreamGone) : false,
          identity: identityRes.ok ? identityRes.data : null,
          error: !remotesRes.ok
            ? remotesRes.error
            : !statusRes.ok
              ? statusRes.error
              : !identityRes.ok
                ? identityRes.error
                : null,
        })
        // branchStore is the sole writer of appStore.currentBranch (Phase 90) — when the
        // live branch disagrees with what's currently shown, reconcile THROUGH the
        // owner instead of writing appStore directly (kills the 5-writer race).
        if (branch && branch !== useAppStore.getState().currentBranch) {
          await useBranchStore.getState().load(repoPath, repository)
        }
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (tracker.isCurrent(token)) set({ loading: false })
    }
  },

  async doFetch(remote) {
    const { repoPath, repository } = get()
    if (!repoPath) return
    set({ fetchLoading: remote, error: null, successMessage: null })
    try {
      const res = await window.api.git.fetch(repoPath, remote)
      if (!res.ok) throw new Error(res.error)
      set({ successMessage: `Fetched from ${remote}.` })
      // W25: a fetch can move remote-tracking refs (ahead/behind, upstream status)
      // and pull in new incoming commits — reload this store plus nudge
      // branch/history so those tabs don't keep showing pre-fetch data. A same-repo
      // load() no longer resets successMessage (Phase 102), so this can run in
      // either order now — kept after the success message for clarity. Guarded on
      // the repo not having changed while the fetch was in flight — a slow network
      // fetch must not overwrite whatever repo the user has since switched to.
      if (repository && get().repoPath === repoPath) {
        await Promise.all([
          get().load(repoPath, repository),
          useBranchStore.getState().load(repoPath, repository),
          useHistoryStore
            .getState()
            .load(repoPath, repository, useAppStore.getState().currentBranch),
        ])
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ fetchLoading: null })
    }
  },

  async doPull(remote, branch) {
    const { repoPath, repository } = get()
    if (!repoPath) return
    const token = tracker.begin()
    set({ pullLoading: remote, error: null, successMessage: null, lastFailure: null })
    try {
      // The main process verifies HEAD is still this branch inside the compound pull
      // job before integrating anything (Phase 91, wave-1 #2) — a moved HEAD refuses
      // with a plain message instead of pulling onto the wrong branch.
      const expectedHeadBranch = useAppStore.getState().currentBranch ?? undefined
      const res = await window.api.git.pull(repoPath, remote, branch, expectedHeadBranch)
      if (!res.ok) {
        // Retain the structured failure (code + remediation) so the recovery
        // banner can offer the one-click fix (e.g. merge-remote-into-local for a
        // genuine divergence) instead of the opaque error string.
        set({
          error: res.error,
          lastFailure: {
            message: res.error,
            code: res.code,
            remediation: res.remediation,
            remote,
            branch,
          },
        })
        return
      }
      // doPull's status refresh: dropped if a newer load() already landed the live
      // branch, so a slow pull can't yank appStore.currentBranch backwards. When it
      // disagrees, reconcile THROUGH branchStore — the sole writer (Phase 90).
      const statusRes = await window.api.git.getStatus(repoPath)
      if (statusRes.ok && tracker.isCurrent(token)) {
        const liveBranch = statusRes.data.branch ?? null
        if (liveBranch && liveBranch !== useAppStore.getState().currentBranch && repository) {
          await useBranchStore.getState().load(repoPath, repository)
        }
      }
      set({ successMessage: `Pulled ${branch} from ${remote}.` })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, lastFailure: { message, remote, branch } })
    } finally {
      // pullLoading is exclusive to this method — always clear it, regardless of
      // whether a later load() has since superseded this call's token.
      set({ pullLoading: null })
    }
  },

  async doRemotePush(remote, branch) {
    const { repoPath } = get()
    if (!repoPath) return
    set({ pushLoading: true, error: null, successMessage: null, lastFailure: null })
    try {
      const res = await window.api.git.push(repoPath, remote, branch)
      if (!res.ok) {
        // Retain the structured failure (code + remediation) so the recovery
        // banner can offer the one-click fix; the `error` string still shows too.
        // remote/branch are pinned too (W21) — matching doPull above — so the
        // recovery banner's fix button always has a target regardless of which
        // action failed.
        set({
          error: res.error,
          lastFailure: {
            message: res.error,
            code: res.code,
            remediation: res.remediation,
            remote,
            branch,
          },
        })
        return
      }
      set({ successMessage: `Pushed ${branch} to ${remote}.` })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ error: message, lastFailure: { message, remote, branch } })
    } finally {
      set({ pushLoading: false })
    }
  },

  clearMessages() {
    set({ error: null, successMessage: null, lastFailure: null })
  },

  setLastFailure(failure) {
    set({ lastFailure: failure, error: failure?.message ?? null })
  },
}))
