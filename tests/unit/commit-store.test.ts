import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'
import { STR } from '../../src/renderer/strings'
import { useAppStore } from '../../src/renderer/store/appStore'

// The renderer commit store talks to the AI store (for the draft capability) and to
// window.api.git (to load status/identity). Both are mocked the same way the other
// renderer-store unit tests do it, so the store can be driven headlessly.
const aiMethods = vi.hoisted(() => ({
  draftCommitMessage: vi.fn(),
}))

let aiStoreError: string | null = null

const aiGetState = vi.hoisted(() =>
  vi.fn(() => ({
    ...aiMethods,
    error: aiStoreError,
  }))
)

const apiGit = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getEffectiveIdentity: vi.fn(),
  setLocalIdentity: vi.fn(),
  commit: vi.fn(),
}))

vi.mock('../../src/renderer/store/aiStore', () => ({
  useAiStore: { getState: aiGetState },
}))

vi.stubGlobal('window', { api: { git: apiGit } })

import { useCommitStore } from '../../src/renderer/store/commitStore'

const repo = (id: string): RepositoryRecord => ({ id }) as unknown as RepositoryRecord

const INITIAL = useCommitStore.getState()

function reset(): void {
  useCommitStore.setState({
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
  })
}

describe('commitStore AI draft', () => {
  beforeEach(() => {
    reset()
    aiStoreError = null
    vi.clearAllMocks()
    apiGit.getStatus.mockResolvedValue({ ok: true, data: { branch: 'main', files: [] } })
    apiGit.getEffectiveIdentity.mockResolvedValue({ ok: true, data: { name: 'A', email: 'a@b.c' } })
  })

  it('exposes draft state on the store (not in a component) so it survives navigation', () => {
    // Regression guard: the "Drafting…" flag must be a store field, not React-local
    // state, or it is lost when CommitScreen unmounts on a tab switch.
    expect(INITIAL).toHaveProperty('draftLoading')
    expect(INITIAL).toHaveProperty('draftError')
    expect(typeof INITIAL.draftMessage).toBe('function')
  })

  it('keeps draftLoading true while the draft is in flight and writes the result', async () => {
    useCommitStore.setState({ repository: repo('repo-1'), message: 'wip' })
    let resolveDraft: (v: unknown) => void = () => {}
    aiMethods.draftCommitMessage.mockImplementation(
      () => new Promise((r) => (resolveDraft = r as (v: unknown) => void))
    )

    const pending = useCommitStore.getState().draftMessage()
    expect(useCommitStore.getState().draftLoading).toBe(true)
    expect(useCommitStore.getState().draftError).toBeNull()

    resolveDraft({ conventional: 'feat: add x', plain: 'Add x', summary: 's', body: 'Body line' })
    await pending

    expect(useCommitStore.getState().draftLoading).toBe(false)
    expect(useCommitStore.getState().message).toBe('feat: add x\n\nBody line')
    expect(aiMethods.draftCommitMessage).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      commitMessage: 'wip',
      expensiveSendAcknowledged: true,
    })
  })

  it('preserves draftLoading across a remount load() of the SAME repo', async () => {
    // CommitScreen calls load() again whenever it remounts. Navigating away and back
    // during a draft must NOT cancel the in-flight "Drafting…" state.
    useCommitStore.setState({ repository: repo('repo-1') })
    aiMethods.draftCommitMessage.mockImplementation(() => new Promise(() => {}))

    void useCommitStore.getState().draftMessage()
    expect(useCommitStore.getState().draftLoading).toBe(true)

    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    expect(useCommitStore.getState().draftLoading).toBe(true)
  })

  it('clears draft state when load() switches to a DIFFERENT repo', async () => {
    useCommitStore.setState({ repository: repo('repo-1'), draftLoading: true, draftError: 'old' })

    await useCommitStore.getState().load('/repo-2', repo('repo-2'))
    expect(useCommitStore.getState().draftLoading).toBe(false)
    expect(useCommitStore.getState().draftError).toBeNull()
  })

  it('does not clobber a different repo message if the repo switched mid-draft', async () => {
    useCommitStore.setState({ repository: repo('repo-1'), message: '' })
    let resolveDraft: (v: unknown) => void = () => {}
    aiMethods.draftCommitMessage.mockImplementation(
      () => new Promise((r) => (resolveDraft = r as (v: unknown) => void))
    )

    const pending = useCommitStore.getState().draftMessage()
    // User switches to repo-2 and types a message before repo-1's draft returns.
    useCommitStore.setState({ repository: repo('repo-2'), message: 'repo-2 message' })

    resolveDraft({ conventional: 'feat: repo-1', plain: 'p', summary: 's' })
    await pending

    expect(useCommitStore.getState().message).toBe('repo-2 message')
  })

  it('surfaces a draftError when the AI store returns no draft', async () => {
    useCommitStore.setState({ repository: repo('repo-1') })
    aiStoreError = 'rate limited'
    aiMethods.draftCommitMessage.mockResolvedValue(null)

    await useCommitStore.getState().draftMessage()
    expect(useCommitStore.getState().draftLoading).toBe(false)
    expect(useCommitStore.getState().draftError).toBe('rate limited')
  })

  it('falls back to the generic error string when the AI store has no error', async () => {
    useCommitStore.setState({ repository: repo('repo-1') })
    aiMethods.draftCommitMessage.mockResolvedValue(null)

    await useCommitStore.getState().draftMessage()
    expect(useCommitStore.getState().draftError).toBe(STR.AI_COMMIT_DRAFT_ERROR)
  })

  it('clears a stale draftError as soon as the user edits the message', () => {
    useCommitStore.setState({ draftError: 'boom' })
    useCommitStore.getState().setMessage('typing')
    expect(useCommitStore.getState().draftError).toBeNull()
  })

  it('ignores a second draftMessage call while one is already in flight', async () => {
    useCommitStore.setState({ repository: repo('repo-1') })
    aiMethods.draftCommitMessage.mockImplementation(() => new Promise(() => {}))

    void useCommitStore.getState().draftMessage()
    void useCommitStore.getState().draftMessage()
    expect(aiMethods.draftCommitMessage).toHaveBeenCalledTimes(1)
  })
})

describe('commitStore AI draft survives switching accounts / repos mid-draft', () => {
  beforeEach(() => {
    reset()
    aiStoreError = null
    vi.clearAllMocks()
    apiGit.getStatus.mockResolvedValue({ ok: true, data: { branch: 'main', files: [] } })
    apiGit.getEffectiveIdentity.mockResolvedValue({ ok: true, data: { name: 'A', email: 'a@b.c' } })
  })

  it('applies a draft that finished while you were on another repo when you return', async () => {
    // The reported bug: start a draft, switch GitHub account (→ different repo),
    // come back — the draft must NOT be silently lost.
    useCommitStore.setState({ repository: repo('A'), message: '' })
    let resolveDraft: (v: unknown) => void = () => {}
    aiMethods.draftCommitMessage.mockImplementation(
      () => new Promise((r) => (resolveDraft = r as (v: unknown) => void))
    )

    const pending = useCommitStore.getState().draftMessage()
    expect(useCommitStore.getState().draftLoading).toBe(true)

    // Switch to repo B (the other account's repo). B has no draft of its own.
    await useCommitStore.getState().load('/B', repo('B'))
    expect(useCommitStore.getState().draftLoading).toBe(false)

    // Repo A's draft fully returns WHILE we're on B — it must be stashed for A,
    // never written into B's message box.
    resolveDraft({ conventional: 'feat: for A', plain: 'p', summary: 's', body: 'Body' })
    await pending
    expect(useCommitStore.getState().message).toBe('')

    // Return to A — the finished draft appears in the box, no stuck loading.
    await useCommitStore.getState().load('/A', repo('A'))
    expect(useCommitStore.getState().message).toBe('feat: for A\n\nBody')
    expect(useCommitStore.getState().draftLoading).toBe(false)
  })

  it('resumes the Drafting indicator when you return to a repo whose draft is still running', async () => {
    useCommitStore.setState({ repository: repo('A'), message: '' })
    aiMethods.draftCommitMessage.mockImplementation(() => new Promise(() => {}))

    void useCommitStore.getState().draftMessage()
    expect(useCommitStore.getState().draftLoading).toBe(true)

    // Switch away to B, then back to A while A's draft is still generating.
    await useCommitStore.getState().load('/B', repo('B'))
    expect(useCommitStore.getState().draftLoading).toBe(false)

    await useCommitStore.getState().load('/A', repo('A'))
    expect(useCommitStore.getState().draftLoading).toBe(true)
  })

  it('surfaces an error draft on return instead of losing it', async () => {
    useCommitStore.setState({ repository: repo('A'), message: '' })
    aiStoreError = 'rate limited'
    let resolveDraft: (v: unknown) => void = () => {}
    aiMethods.draftCommitMessage.mockImplementation(
      () => new Promise((r) => (resolveDraft = r as (v: unknown) => void))
    )

    const pending = useCommitStore.getState().draftMessage()
    await useCommitStore.getState().load('/B', repo('B'))

    resolveDraft(null)
    await pending

    await useCommitStore.getState().load('/A', repo('A'))
    expect(useCommitStore.getState().draftError).toBe('rate limited')
    expect(useCommitStore.getState().draftLoading).toBe(false)
  })
})

describe('commitStore stale-request guard (Phase 89)', () => {
  beforeEach(() => {
    reset()
    aiStoreError = null
    vi.clearAllMocks()
  })

  it('drops a load() result that resolves after a newer load() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    apiGit.getStatus.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    apiGit.getEffectiveIdentity.mockResolvedValue({ ok: true, data: { name: 'A', email: 'a@b.c' } })

    const pendingA = useCommitStore.getState().load('/repo-A', repo('repo-A'))

    apiGit.getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main', files: [] } })
    const pendingB = useCommitStore.getState().load('/repo-B', repo('repo-B'))
    await pendingB
    expect(useCommitStore.getState().repository?.id).toBe('repo-B')

    // Repo A's slow response finally resolves — must not overwrite repo B's state.
    resolveA({ ok: true, data: { branch: 'stale', files: [] } })
    await pendingA
    expect(useCommitStore.getState().repository?.id).toBe('repo-B')
    expect(useCommitStore.getState().status?.branch).toBe('main')
  })
})

describe('commitStore per-repo typed message (W23)', () => {
  beforeEach(() => {
    reset()
    aiStoreError = null
    vi.clearAllMocks()
    apiGit.getStatus.mockResolvedValue({ ok: true, data: { branch: 'main', files: [] } })
    apiGit.getEffectiveIdentity.mockResolvedValue({ ok: true, data: { name: 'A', email: 'a@b.c' } })
  })

  it('does not carry a half-typed message from one repo into another', async () => {
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    useCommitStore.getState().setMessage('wip on repo 1')

    await useCommitStore.getState().load('/repo-2', repo('repo-2'))
    expect(useCommitStore.getState().message).toBe('')
  })

  it('restores the typed message when returning to a repo', async () => {
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    useCommitStore.getState().setMessage('wip on repo 1')

    await useCommitStore.getState().load('/repo-2', repo('repo-2'))
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    expect(useCommitStore.getState().message).toBe('wip on repo 1')
  })

  it('clears the saved message for a repo after a successful commit', async () => {
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    useCommitStore.getState().setMessage('wip on repo 1')
    apiGit.commit.mockResolvedValue({ ok: true, data: { hash: 'abc123' } })

    await useCommitStore.getState().doCommit('wip on repo 1')
    await useCommitStore.getState().load('/repo-2', repo('repo-2'))
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    expect(useCommitStore.getState().message).toBe('')
  })
})

describe('commitStore AI drafts keyed by repo AND branch (#5)', () => {
  beforeEach(() => {
    reset()
    aiStoreError = null
    vi.clearAllMocks()
    apiGit.getStatus.mockResolvedValue({ ok: true, data: { branch: 'main', files: [] } })
    apiGit.getEffectiveIdentity.mockResolvedValue({ ok: true, data: { name: 'A', email: 'a@b.c' } })
    useAppStore.setState({ currentBranch: null })
  })

  it('a draft started on branch A does not surface when the same repo is on branch B', async () => {
    useAppStore.setState({ currentBranch: 'feature-a' })
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))

    let resolveDraft: (v: unknown) => void = () => {}
    aiMethods.draftCommitMessage.mockImplementation(
      () => new Promise((r) => (resolveDraft = r as (v: unknown) => void))
    )
    const pending = useCommitStore.getState().draftMessage()

    // User switches branch on the SAME repo before the draft resolves.
    useAppStore.setState({ currentBranch: 'feature-b' })
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    expect(useCommitStore.getState().draftLoading).toBe(false)

    resolveDraft({ conventional: 'feat: for A', plain: 'p', summary: 's' })
    await pending
    expect(useCommitStore.getState().message).toBe('')

    // Returning to branch A surfaces the finished draft.
    useAppStore.setState({ currentBranch: 'feature-a' })
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    expect(useCommitStore.getState().message).toBe('feat: for A')
  })

  it('allows independent concurrent drafts for the same repo on two different branches', async () => {
    useAppStore.setState({ currentBranch: 'feature-a' })
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    aiMethods.draftCommitMessage.mockImplementation(() => new Promise(() => {}))
    void useCommitStore.getState().draftMessage()
    expect(aiMethods.draftCommitMessage).toHaveBeenCalledTimes(1)

    useAppStore.setState({ currentBranch: 'feature-b' })
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))
    void useCommitStore.getState().draftMessage()
    // A different branch is a different draft target — it is NOT blocked by branch A's
    // in-flight draft.
    expect(aiMethods.draftCommitMessage).toHaveBeenCalledTimes(2)
  })
})

describe('commitStore keeps an AI draft inserted before the Commit screen is first opened', () => {
  beforeEach(() => {
    reset()
    aiStoreError = null
    vi.clearAllMocks()
    apiGit.getStatus.mockResolvedValue({ ok: true, data: { branch: 'main', files: [] } })
    apiGit.getEffectiveIdentity.mockResolvedValue({ ok: true, data: { name: 'A', email: 'a@b.c' } })
    useAppStore.setState({ activeRepo: null, currentBranch: null })
  })

  it('does not wipe a message set while commitStore.repository is still null', async () => {
    // Repro of the AI commit-draft "Insert" bug: CommitDraftCard writes the message and
    // navigates to Commit WITHOUT the Commit screen ever having mounted, so
    // commitStore.repository is still null. The active repo is the draft's origin (the
    // card gates Insert on activeRepo?.id === originRepositoryId), so the message must be
    // persisted against the active repo and survive the first load() on mount.
    useAppStore.setState({ activeRepo: repo('repo-1') })
    expect(useCommitStore.getState().repository).toBeNull()

    // Insert applies the finished draft into the message box.
    useCommitStore.getState().setMessage('feat: inserted draft\n\nBody line')

    // CommitScreen mounts for the first time and calls load() for the active repo.
    await useCommitStore.getState().load('/repo-1', repo('repo-1'))

    expect(useCommitStore.getState().message).toBe('feat: inserted draft\n\nBody line')
  })
})
