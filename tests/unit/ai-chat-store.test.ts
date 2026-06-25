import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STR } from '../../src/renderer/strings'

const aiMethods = vi.hoisted(() => ({
  draftCommitMessage: vi.fn(),
  reviewStagedChanges: vi.fn(),
  generatePushBrief: vi.fn(),
  generateHistorySummary: vi.fn(),
}))

let aiStoreError: string | null = null

const aiGetState = vi.hoisted(() =>
  vi.fn(() => ({
    ...aiMethods,
    error: aiStoreError,
  }))
)

const appGetState = vi.hoisted(() =>
  vi.fn(() => ({
    activeRepo: { id: 'repo-1', name: 'demo' },
    currentBranch: 'main',
  }))
)

const apiAi = vi.hoisted(() => ({
  generateRepoBrief: vi.fn(),
  proposeAgenticActions: vi.fn(),
  chat: vi.fn(),
}))

vi.mock('../../src/renderer/store/aiStore', () => ({
  useAiStore: { getState: aiGetState },
}))

vi.mock('../../src/renderer/store/appStore', () => ({
  useAppStore: { getState: appGetState },
}))

vi.stubGlobal('window', { api: { ai: apiAi } })

import { useAiChatStore } from '../../src/renderer/store/aiChatStore'

describe('aiChatStore slash-commands', () => {
  beforeEach(() => {
    useAiChatStore.setState({ messages: [], pending: false, error: null })
    aiStoreError = null
    vi.clearAllMocks()
    aiMethods.draftCommitMessage.mockResolvedValue({
      conventional: 'feat: test',
      plain: 'Test',
      summary: 'Summary',
    })
    aiMethods.reviewStagedChanges.mockResolvedValue({ findings: [], overall: undefined })
    aiMethods.generatePushBrief.mockResolvedValue({
      summary: 'Push summary',
      highlights: ['abc — feat'],
      identityNote: 'Identity ok',
    })
    aiMethods.generateHistorySummary.mockResolvedValue({
      releaseNotesDraft: 'Notes',
      changelogDraft: 'Log',
    })
    apiAi.generateRepoBrief.mockResolvedValue({
      ok: true,
      data: {
        projectSummary: 'Repo guide',
        likelyBuildCommands: ['npm run build'],
        likelyTestCommands: ['npm test'],
      },
    })
    apiAi.proposeAgenticActions.mockResolvedValue({
      ok: true,
      data: { summary: 'Proposal', actions: [], fileEdits: [] },
    })
    apiAi.chat.mockResolvedValue({
      ok: true,
      data: { reply: 'Hello', suggestedCommands: [] },
    })
  })

  it.each([
    ['commit', '/commit', aiMethods.draftCommitMessage],
    ['review', '/review', aiMethods.reviewStagedChanges],
    ['push-brief', '/push-brief', aiMethods.generatePushBrief],
    ['history', '/history', aiMethods.generateHistorySummary],
  ] as const)('sends expensiveSendAcknowledged for /%s', async (_label, command, mockFn) => {
    await useAiChatStore.getState().send(command)
    expect(mockFn).toHaveBeenCalledWith(
      expect.objectContaining({ expensiveSendAcknowledged: true, repositoryId: 'repo-1' })
    )
  })

  it('sends expensiveSendAcknowledged for direct window.api capabilities', async () => {
    await useAiChatStore.getState().send('/repo-brief')
    expect(apiAi.generateRepoBrief).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      expensiveSendAcknowledged: true,
    })

    await useAiChatStore.getState().send('/propose add a readme note')
    expect(apiAi.proposeAgenticActions).toHaveBeenCalledWith(
      expect.objectContaining({ expensiveSendAcknowledged: true, repositoryId: 'repo-1' })
    )

    await useAiChatStore.getState().send('What changed?')
    expect(apiAi.chat).toHaveBeenCalledWith(
      expect.objectContaining({ expensiveSendAcknowledged: true, repositoryId: 'repo-1' })
    )
  })

  it('uses the live aiStore error after an awaited failure (not a stale snapshot)', async () => {
    aiMethods.reviewStagedChanges.mockImplementation(async () => {
      aiStoreError = 'Review failed: missing acknowledgement'
      return null
    })
    aiMethods.draftCommitMessage.mockImplementation(async () => {
      aiStoreError = 'Commit failed: nothing staged'
      return null
    })

    await useAiChatStore.getState().send('/review')
    let messages = useAiChatStore.getState().messages
    expect(messages.at(-1)?.content).toBe('Review failed: missing acknowledgement')

    await useAiChatStore.getState().send('/commit')
    messages = useAiChatStore.getState().messages
    expect(messages.at(-1)?.content).toBe('Commit failed: nothing staged')
  })

  it('shows a friendly bubble for structured-parse IPC failures', async () => {
    apiAi.generateRepoBrief.mockResolvedValue({
      ok: false,
      error:
        '[{"code":"invalid_type","expected":"string","received":"number","path":["projectSummary"]}]',
    })

    await useAiChatStore.getState().send('/repo-brief')
    const last = useAiChatStore.getState().messages.at(-1)
    expect(last?.isError).toBe(true)
    expect(last?.content).toBe(STR.CHAT_CAPABILITY_STRUCTURED_PARSE_ERROR)
    expect(last?.content).not.toContain('invalid_type')
  })
})
