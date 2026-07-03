import { create } from 'zustand'
import type { GitStatus, EffectiveGitIdentity, RepositoryRecord } from '../../core/types'
import { useAiStore } from './aiStore'
import { STR } from '../strings'

/**
 * A commit-message draft, tracked per repository so it survives switching repos
 * (i.e. switching GitHub accounts — each account owns different repos). A draft is
 * bound to the repo it was started for; when the user returns to that repo the
 * entry is surfaced: a still-running draft resumes the "Drafting…" indicator, a
 * finished one lands in the message box, an error is shown. This is what keeps a
 * draft from silently vanishing when you start it, switch account, and come back.
 */
type DraftEntry =
  | { status: 'loading' }
  | { status: 'ready'; message: string }
  | { status: 'error'; error: string }

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
   * In-flight / finished drafts keyed by repository id. Lets a draft started on one
   * repo be picked back up when the user returns to that repo after switching
   * accounts, instead of being silently discarded by the repo-mismatch guard.
   */
  draftsByRepo: Record<string, DraftEntry>
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
  error: null,
  committedHash: null,

  async load(repoPath, repository) {
    // CommitScreen calls load() on every mount, so this also runs when the user
    // navigates back to the tab (or back from another account's repo). Reconcile
    // the AI-draft affordance to THIS repo's tracked draft: resume a running one,
    // surface a finished one into the box, show an error — never leave it stuck.
    const entry = get().draftsByRepo[repository.id]
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      status: null,
      identity: null,
      committedHash: null,
      draftLoading: entry?.status === 'loading',
      draftError: entry?.status === 'error' ? entry.error : null,
      ...(entry?.status === 'ready' ? { message: entry.message } : {}),
    })
    // A surfaced (finished or errored) draft is consumed; a running one stays tracked.
    if (entry && entry.status !== 'loading') {
      set((s) => {
        const draftsByRepo = { ...s.draftsByRepo }
        delete draftsByRepo[repository.id]
        return { draftsByRepo }
      })
    }
    try {
      const [statusRes, identityRes] = await Promise.all([
        window.api.git.getStatus(repoPath),
        window.api.git.getEffectiveIdentity(repoPath),
      ])
      set({
        status: statusRes.ok ? statusRes.data : null,
        identity: identityRes.ok ? identityRes.data : null,
        error: !statusRes.ok ? statusRes.error : !identityRes.ok ? identityRes.error : null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  setMessage(message) {
    // Editing the message dismisses any stale AI-draft error.
    set({ message, draftError: null })
  },

  async applyLocalIdentity(name, email) {
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
    const { repoPath } = get()
    if (!repoPath) return
    set({ commitLoading: true, error: null })
    try {
      const res = await window.api.git.commit(repoPath, message)
      if (!res.ok) throw new Error(res.error)
      set({ committedHash: res.data.hash, message: '' })
      const statusRes = await window.api.git.getStatus(repoPath)
      if (statusRes.ok) set({ status: statusRes.data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ commitLoading: false })
    }
  },

  async draftMessage() {
    const { repository, message } = get()
    if (!repository) return
    const repoId = repository.id
    // Per-repo in-flight guard: don't double-fire for the same repo, but a draft
    // for another repo may run concurrently.
    if (get().draftsByRepo[repoId]?.status === 'loading') return

    // Record this draft's progress and reconcile the visible affordance. The result
    // is written into the box only while its repo is active — so it never lands in
    // the wrong repo — and when the user is elsewhere it is stashed under
    // draftsByRepo for load() to surface on return, instead of being silently lost.
    const record = (entry: DraftEntry): void =>
      set((s) => {
        const active = s.repository?.id === repoId
        const draftsByRepo = { ...s.draftsByRepo }
        if (active && entry.status !== 'loading') delete draftsByRepo[repoId]
        else draftsByRepo[repoId] = entry
        if (!active) return { draftsByRepo }
        if (entry.status === 'loading')
          return { draftsByRepo, draftLoading: true, draftError: null }
        if (entry.status === 'ready')
          return { draftsByRepo, draftLoading: false, draftError: null, message: entry.message }
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
