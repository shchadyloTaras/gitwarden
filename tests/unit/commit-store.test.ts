import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'
import { STR } from '../../src/renderer/strings'

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
