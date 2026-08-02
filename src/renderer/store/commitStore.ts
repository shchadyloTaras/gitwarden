import { create } from 'zustand'
import type { GitStatus, EffectiveGitIdentity, RepositoryRecord } from '../../core/types'
import { useAiStore } from './aiStore'
import { useAppStore } from './appStore'
import { STR } from '../strings'
import { createRequestTracker } from '../../core/concurrency/requestGuard'

const tracker = createRequestTracker()

/** AI drafts are scoped to the repo AND the branch they were started on (audit #5). */
function draftKey(repositoryId: string, branch: string | null): string {
  return `${repositoryId}:${branch ?? ''}`
}

/**
 * A commit-message draft, tracked per repository so it survives switching repos
 * (i.e. switching GitHub accounts — each account owns different repos). A draft is
 * bound to the repo it was started for; when the user returns to that repo the
 * entry is surfaced: a still-running draft resumes the "Drafting…" indicator, a
 * finished one lands in the message box, an error is shown. This is what keeps a
 * draft from silently vanishing when you start it, switch account, and come back.
 */
type DraftEntry =
  { status: 'loading' } | { status: 'ready'; message: string } | { status: 'error'; error: string }

interface CommitState {
  repoPath: string | null
  repository: RepositoryRecord | null
  message: string
  status: GitStatus | null
  identity: EffectiveGitIdentity | null
  loading: boolean
  identityLoading: boolean
  commitLoading: boolean
  /**
   * True while an AI commit-message draft is in flight FOR THE ACTIVE REPO. It is
   * always derived from `draftsByRepo` (on `load`, and by `draftMessage` as the
   * draft progresses), so it can never get stuck: navigating away and back
   * re-derives it from the active repo's tracked draft instead of leaving a stale
   * flag that would block every future click via the in-flight guard.
   */
  draftLoading: boolean
  /** Last AI draft failure for the active repo, surfaced under the message box. */
  draftError: string | null
  /**
   * In-flight / finished drafts keyed by `repositoryId:branch` (audit #5). Lets a draft
   * started on one repo+branch be picked back up when the user returns to it after
   * switching accounts or branches, instead of being silently discarded by the
   * repo-mismatch guard or bleeding into an unrelated branch.
   */
  draftsByRepo: Record<string, DraftEntry>
  /**
   * The typed (not-yet-committed) message, per repository id (W23) — so switching
   * repos never carries one repo's half-typed message into another repo's commit.
   */
  messagesByRepo: Record<string, string>
  error: string | null
  committedHash: string | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  setMessage(message: string): void
  applyLocalIdentity(name: string, email: string): Promise<void>
  doCommit(message: string): Promise<void>
  /** Draft the commit message with AI; result lands on this repo (now or on return). */
  draftMessage(): Promise<void>
}

export const useCommitStore = create<CommitState>((set, get) => ({
  repoPath: null,
  repository: null,
  message: '',
  status: null,
  identity: null,
  loading: false,
  identityLoading: false,
  commitLoading: false,
  draftLoading: false,
  draftError: null,
  draftsByRepo: {},
  messagesByRepo: {},
  error: null,
  committedHash: null,

  async load(repoPath, repository) {
    // CommitScreen calls load() on every mount, so this also runs when the user
    // navigates back to the tab (or back from another account's repo, or after a
    // branch switch). Reconcile the AI-draft affordance to THIS repo+branch's tracked
    // draft: resume a running one, surface a finished one into the box, show an
    // error — never leave it stuck.
    const token = tracker.begin()
    // Phase 102: committedHash is an operation OUTCOME, not loaded data — a same-repo
    // refresh (this same load() re-running on remount, a watcher event) must not wipe
    // the "✓ Committed …" confirmation out from under the user. It resets only on an
    // actual repo change here; doCommit clears it itself when a NEW commit starts.
    const isRepoChange = get().repoPath !== repoPath
    const branch = useAppStore.getState().currentBranch
    const key = draftKey(repository.id, branch)
    const entry = get().draftsByRepo[key]
    const savedMessage = get().messagesByRepo[repository.id] ?? ''
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      status: null,
      identity: null,
      ...(isRepoChange ? { committedHash: null } : {}),
      // W23: the per-repo typed message wins unless a ready draft is surfacing now.
      message: entry?.status === 'ready' ? entry.message : savedMessage,
      draftLoading: entry?.status === 'loading',
      draftError: entry?.status === 'error' ? entry.error : null,
    })
    // A surfaced (finished or errored) draft is consumed; a running one stays tracked.
    if (entry && entry.status !== 'loading') {
      set((s) => {
        const draftsByRepo = { ...s.draftsByRepo }
        delete draftsByRepo[key]
        return { draftsByRepo }
      })
    }
    try {
      const [statusRes, identityRes] = await Promise.all([
        window.api.git.getStatus(repoPath),
        window.api.git.getEffectiveIdentity(repoPath),
      ])
      if (tracker.isCurrent(token)) {
        set({
          status: statusRes.ok ? statusRes.data : null,
          identity: identityRes.ok ? identityRes.data : null,
          error: !statusRes.ok ? statusRes.error : !identityRes.ok ? identityRes.error : null,
        })
      }
    } catch (err) {
      if (tracker.isCurrent(token)) set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      if (tracker.isCurrent(token)) set({ loading: false })
    }
  },

  setMessage(message) {
    // Editing the message dismisses any stale AI-draft error, and keeps the per-repo
    // draft (W23) in sync so it survives a repo switch and back. When the message is set
    // before the Commit screen has ever mounted — e.g. the AI commit-draft card's
    // "Insert", which writes the message then navigates to Commit — commitStore.repository
    // is still null; fall back to the active repo (CommitDraftCard gates Insert on it) so
    // the per-repo message is persisted and the first load() on mount restores it instead
    // of wiping it to the empty saved value.
    set((s) => {
      const repoId = s.repository?.id ?? useAppStore.getState().activeRepo?.id
      return {
        message,
        draftError: null,
        messagesByRepo: repoId ? { ...s.messagesByRepo, [repoId]: message } : s.messagesByRepo,
      }
    })
  },

  async applyLocalIdentity(name, email) {
    // Not guarded by the shared tracker: identityLoading is exclusive to this method
    // (load() never touches it), so gating its reset on store-wide currency would leave
    // it stuck at true if an unrelated load() started while this was in flight.
    const { repoPath } = get()
    if (!repoPath) return
    set({ identityLoading: true })
    try {
      const res = await window.api.git.setLocalIdentity(repoPath, name, email)
      if (!res.ok) throw new Error(res.error)
      const identityRes = await window.api.git.getEffectiveIdentity(repoPath)
      if (identityRes.ok) set({ identity: identityRes.data })
    } finally {
      set({ identityLoading: false })
    }
  },

  async doCommit(message) {
    const { repoPath, repository } = get()
    if (!repoPath) return
    const token = tracker.begin()
    set({ commitLoading: true, error: null, committedHash: null })
    try {
      const res = await window.api.git.commit(repoPath, message)
      if (!res.ok) throw new Error(res.error)
      set((s) => ({
        committedHash: res.data.hash,
        message: '',
        messagesByRepo: repository
          ? { ...s.messagesByRepo, [repository.id]: '' }
          : s.messagesByRepo,
      }))
      // doCommit's status refresh: dropped if a newer load() already landed fresher data.
      const statusRes = await window.api.git.getStatus(repoPath)
      if (statusRes.ok && tracker.isCurrent(token)) set({ status: statusRes.data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      // commitLoading is exclusive to this method — always clear it, regardless of
      // whether a later load() has since superseded this call's token.
      set({ commitLoading: false })
    }
  },

  async draftMessage() {
    const { repository, message } = get()
    if (!repository) return
    const repoId = repository.id
    const branch = useAppStore.getState().currentBranch
    const key = draftKey(repoId, branch)
    // Per-repo-and-branch in-flight guard: don't double-fire for the same target, but
    // a draft for another repo or branch may run concurrently.
    if (get().draftsByRepo[key]?.status === 'loading') return

    // Record this draft's progress and reconcile the visible affordance. The result
    // is written into the box only while its repo+branch is active — so it never
    // lands on the wrong target — and when the user is elsewhere it is stashed under
    // draftsByRepo for load() to surface on return, instead of being silently lost.
    const record = (entry: DraftEntry): void =>
      set((s) => {
        const active =
          s.repository?.id === repoId && useAppStore.getState().currentBranch === branch
        const draftsByRepo = { ...s.draftsByRepo }
        if (active && entry.status !== 'loading') delete draftsByRepo[key]
        else draftsByRepo[key] = entry
        if (!active) return { draftsByRepo }
        if (entry.status === 'loading')
          return { draftsByRepo, draftLoading: true, draftError: null }
        if (entry.status === 'ready')
          return {
            draftsByRepo,
            draftLoading: false,
            draftError: null,
            message: entry.message,
            messagesByRepo: { ...s.messagesByRepo, [repoId]: entry.message },
          }
        return { draftsByRepo, draftLoading: false, draftError: entry.error }
      })

    record({ status: 'loading' })
    try {
      const draft = await useAiStore.getState().draftCommitMessage({
        repositoryId: repoId,
        commitMessage: message,
        expensiveSendAcknowledged: true,
      })
      if (draft) {
        const body = draft.body?.trim()
        const drafted = body ? `${draft.conventional}\n\n${body}` : draft.conventional
        record({ status: 'ready', message: drafted })
      } else {
        record({ status: 'error', error: useAiStore.getState().error ?? STR.AI_COMMIT_DRAFT_ERROR })
      }
    } catch (err) {
      record({
        status: 'error',
        error: err instanceof Error ? err.message : STR.AI_COMMIT_DRAFT_ERROR,
      })
    }
  },
}))
