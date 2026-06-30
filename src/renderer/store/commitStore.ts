import { create } from 'zustand'
import type { GitStatus, EffectiveGitIdentity, RepositoryRecord } from '../../core/types'
import { useAiStore } from './aiStore'
import { STR } from '../strings'

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
   * True while an AI commit-message draft is in flight. This lives in the store
   * (not in CommitScreen's React state) on purpose: the screen unmounts when the
   * user switches tabs, so a component-local flag would silently vanish mid-draft
   * and the "Drafting…" affordance would disappear even though the request is
   * still running. Keeping it here lets the indicator survive navigating away and
   * back.
   */
  draftLoading: boolean
  /** Last AI draft failure, surfaced under the message box. Cleared on edit/repo switch. */
  draftError: string | null
  error: string | null
  committedHash: string | null

  load(repoPath: string, repository: RepositoryRecord): Promise<void>
  setMessage(message: string): void
  applyLocalIdentity(name: string, email: string): Promise<void>
  doCommit(message: string): Promise<void>
  /** Draft the commit message with AI and write the result into `message`. */
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
  error: null,
  committedHash: null,

  async load(repoPath, repository) {
    // CommitScreen calls load() on every mount, so this also runs when the user
    // navigates back to the tab. Only clear an in-flight draft when the repo
    // actually changes — a same-repo remount must preserve the "Drafting…" state.
    const repoChanged = get().repository?.id !== repository.id
    set({
      loading: true,
      error: null,
      repoPath,
      repository,
      status: null,
      identity: null,
      committedHash: null,
      ...(repoChanged ? { draftLoading: false, draftError: null } : {}),
    })
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
    const { repository, message, draftLoading } = get()
    if (!repository || draftLoading) return
    // Capture the repo this draft is for: the request may outlive a repo switch,
    // and we must never write repo A's draft into repo B's message box.
    const repoId = repository.id
    set({ draftLoading: true, draftError: null })
    try {
      const draft = await useAiStore.getState().draftCommitMessage({
        repositoryId: repoId,
        commitMessage: message,
        expensiveSendAcknowledged: true,
      })
      if (get().repository?.id !== repoId) return
      if (draft) {
        const body = draft.body?.trim()
        set({ message: body ? `${draft.conventional}\n\n${body}` : draft.conventional })
      } else {
        set({ draftError: useAiStore.getState().error ?? STR.AI_COMMIT_DRAFT_ERROR })
      }
    } catch (err) {
      if (get().repository?.id === repoId) {
        set({ draftError: err instanceof Error ? err.message : STR.AI_COMMIT_DRAFT_ERROR })
      }
    } finally {
      if (get().repository?.id === repoId) set({ draftLoading: false })
    }
  },
}))
