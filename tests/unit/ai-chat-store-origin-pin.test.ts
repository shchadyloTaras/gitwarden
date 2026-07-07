import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STR } from '../../src/renderer/strings'

// Phase 94 (W2/W11/W15): AI-generated actions carry the repo/branch they were
// generated for, stamped at send time — never at click time. applyProposal and
// CommitDraftCard's Insert must refuse (not silently retarget) when the active
// repo has moved on from that origin.
const aiMethods = vi.hoisted(() => ({
  draftCommitMessage: vi.fn(),
}))

const aiGetState = vi.hoisted(() => vi.fn(() => ({ ...aiMethods, error: null })))

// Mutable so tests can simulate the user switching repos BETWEEN generation and
// apply/insert — a plain object returned by a fixed mock couldn't model that race.
const appState = vi.hoisted(() => ({
  activeRepo: { id: 'repo-1', name: 'demo', localPath: '/tmp/repo-1' } as {
    id: string
    name: string
    localPath: string
  } | null,
  currentBranch: 'main' as string | null,
}))
const appGetState = vi.hoisted(() => vi.fn(() => appState))

const apiAi = vi.hoisted(() => ({
  proposeAgenticActions: vi.fn(),
  executeAgenticProposal: vi.fn(),
}))

const apiGit = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getEffectiveIdentity: vi.fn(),
}))

const profilesGetState = vi.hoisted(() => vi.fn(() => ({ profiles: [], activeProfileId: null })))

vi.mock('../../src/renderer/store/aiStore', () => ({
  useAiStore: { getState: aiGetState },
}))

vi.mock('../../src/renderer/store/appStore', () => ({
  useAppStore: { getState: appGetState },
}))

vi.mock('../../src/renderer/store/profilesStore', () => ({
  useProfilesStore: { getState: profilesGetState },
}))

vi.stubGlobal('window', { api: { ai: apiAi, git: apiGit } })

import { useAiChatStore } from '../../src/renderer/store/aiChatStore'
import { useStatusStore } from '../../src/renderer/store/statusStore'
import { useCommitStore } from '../../src/renderer/store/commitStore'

describe('aiChatStore AI-action origin pinning (Phase 94)', () => {
  beforeEach(() => {
    useAiChatStore.setState({ messages: [], pending: false, error: null })
    useStatusStore.setState({ status: null, loading: false, error: null, repoPath: null })
    useCommitStore.setState({
      repoPath: null,
      repository: null,
      message: '',
      status: null,
      identity: null,
    })
    vi.clearAllMocks()
    appState.activeRepo = { id: 'repo-1', name: 'demo', localPath: '/tmp/repo-1' }
    appState.currentBranch = 'main'
    apiAi.proposeAgenticActions.mockResolvedValue({
      ok: true,
      data: { summary: 'Proposal', actions: [], fileEdits: [{ path: 'a.txt', after: 'x' }] },
    })
    apiGit.getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })
    apiGit.getEffectiveIdentity.mockResolvedValue({
      ok: true,
      data: { userName: 'Dev', userEmail: 'dev@example.com', emailSource: 'local' },
    })
  })

  it('/propose stamps the origin repo + branch onto the proposal at generation time', async () => {
    await useAiChatStore.getState().send('/propose add a readme note')
    const message = useAiChatStore.getState().messages.at(-1)
    expect(message?.proposal?.originRepositoryId).toBe('repo-1')
    expect(message?.proposal?.originBranch).toBe('main')
  })

  it('applyProposal refuses with a plain bubble when the active repo no longer matches the origin', async () => {
    await useAiChatStore.getState().send('/propose add a readme note')
    const message = useAiChatStore.getState().messages.at(-1)!

    // The user switches to a different repo before clicking Apply.
    appState.activeRepo = { id: 'repo-2', name: 'other', localPath: '/tmp/repo-2' }

    await useAiChatStore.getState().applyProposal(message.id)

    expect(apiAi.executeAgenticProposal).not.toHaveBeenCalled()
    const last = useAiChatStore.getState().messages.at(-1)
    expect(last?.isError).toBe(true)
    expect(last?.content).toBe(STR.CHAT_PROPOSAL_WRONG_REPO)
  })

  it('applyProposal proceeds (targeting the origin repo) when the active repo still matches', async () => {
    apiAi.executeAgenticProposal.mockResolvedValue({ ok: true, data: { writtenFiles: ['a.txt'] } })
    await useAiChatStore.getState().send('/propose add a readme note')
    const message = useAiChatStore.getState().messages.at(-1)!

    await useAiChatStore.getState().applyProposal(message.id)

    expect(apiAi.executeAgenticProposal).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryId: 'repo-1' })
    )
    expect(
      useAiChatStore.getState().messages.find((m) => m.id === message.id)?.proposalApplied
    ).toBe(true)
  })

  it('W15: a successful apply refreshes status/commit for the active repo', async () => {
    apiAi.executeAgenticProposal.mockResolvedValue({ ok: true, data: { writtenFiles: ['a.txt'] } })
    await useAiChatStore.getState().send('/propose add a readme note')
    const message = useAiChatStore.getState().messages.at(-1)!

    await useAiChatStore.getState().applyProposal(message.id)

    expect(apiGit.getStatus).toHaveBeenCalledWith('/tmp/repo-1')
    expect(useStatusStore.getState().repoPath).toBe('/tmp/repo-1')
  })

  it('W15: does NOT refresh status/commit if the user switched repos while the write was in flight', async () => {
    let resolveApply: (v: unknown) => void = () => {}
    apiAi.executeAgenticProposal.mockImplementation(
      () => new Promise((resolve) => (resolveApply = resolve))
    )
    await useAiChatStore.getState().send('/propose add a readme note')
    const message = useAiChatStore.getState().messages.at(-1)!

    const applyPending = useAiChatStore.getState().applyProposal(message.id)
    // Switch away WHILE the write is in flight — the callsite already committed to
    // origin='repo-1' for the write itself, but the post-success refresh must not
    // clobber whatever the user is looking at now.
    appState.activeRepo = { id: 'repo-2', name: 'other', localPath: '/tmp/repo-2' }
    resolveApply({ ok: true, data: { writtenFiles: ['a.txt'] } })
    await applyPending

    expect(apiGit.getStatus).not.toHaveBeenCalled()
    expect(useStatusStore.getState().repoPath).toBeNull()
  })

  it('/commit stamps the origin repo + branch onto the commit-draft block', async () => {
    aiMethods.draftCommitMessage.mockResolvedValue({
      conventional: 'feat: test',
      plain: 'Test',
      summary: 'Summary',
    })
    await useAiChatStore.getState().send('/commit')
    const message = useAiChatStore.getState().messages.at(-1)
    expect(message?.block?.kind).toBe('commit-draft')
    if (message?.block?.kind === 'commit-draft') {
      expect(message.block.originRepositoryId).toBe('repo-1')
      expect(message.block.originBranch).toBe('main')
    }
  })
})
