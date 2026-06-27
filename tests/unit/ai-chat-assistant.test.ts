import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiChatAssistant } from '../../src/main/ai/AiChatAssistant'
import type { AiAdapter } from '../../src/main/ai/types'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'

describe('AiChatAssistant', () => {
  const preview = {
    requestId: 'req-1',
    connectionId: 'conn-1',
    kind: 'chat' as const,
    destinationHost: 'openrouter.ai',
    privacyMode: 'preview-each' as const,
    payloadText: '{"repo":"demo"}',
    chunks: [],
    truncated: false,
    omittedChars: 0,
    redactions: { count: 0, matches: [], labels: [] },
  }

  let contextBuilder: Pick<AiContextBuilder, 'buildPreview'>
  let adapters: Pick<AiAdapter, 'generateStructured' | 'generateTextStream'>

  beforeEach(() => {
    contextBuilder = { buildPreview: vi.fn().mockResolvedValue(preview) }
    adapters = {
      generateTextStream: vi.fn(async (_request, onDelta) => {
        onDelta('Run /review before committing.')
      }),
      generateStructured: vi.fn().mockResolvedValue({
        reply: 'Run /review before committing.',
        suggestedCommands: ['/review'],
      }),
    }
  })

  it('builds a chat-kind preview (no diffs) and returns the parsed reply', async () => {
    const assistant = new AiChatAssistant(contextBuilder as AiContextBuilder, adapters as AiAdapter)
    const result = await assistant.chat({ repositoryId: 'repo-1', message: 'What should I do?' })

    expect(result.reply).toBe('Run /review before committing.')
    expect(result.suggestedCommands).toBeUndefined()
    expect(contextBuilder.buildPreview).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'chat', repositoryId: 'repo-1' })
    )
  })

  it('sends the system + context + history + user message in order', async () => {
    const assistant = new AiChatAssistant(contextBuilder as AiContextBuilder, adapters as AiAdapter)
    await assistant.chat({
      repositoryId: 'repo-1',
      message: 'And now?',
      history: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
    })

    const call = (adapters.generateTextStream as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const roles = call.messages.map((m: { role: string }) => m.role)
    expect(roles).toEqual(['system', 'user', 'user', 'assistant', 'user'])
    expect(call.messages[0].content).toContain('advisory')
    expect(call.messages.at(-1).content).toBe('And now?')
    expect(call.kind).toBe('chat')
  })

  it('falls back to structured output when streaming is unsupported', async () => {
    adapters.generateTextStream = vi.fn().mockRejectedValue(new Error('unsupported'))
    const assistant = new AiChatAssistant(contextBuilder as AiContextBuilder, adapters as AiAdapter)
    const result = await assistant.chat({ repositoryId: 'repo-1', message: 'hi' })
    expect(result.reply).toBe('Run /review before committing.')
    expect(adapters.generateStructured).toHaveBeenCalled()
  })

  it('fails closed when streaming and structured fallback both fail', async () => {
    adapters.generateTextStream = vi.fn().mockRejectedValue(new Error('unsupported'))
    adapters.generateStructured = vi.fn().mockResolvedValue({ notReply: 1 })
    const assistant = new AiChatAssistant(contextBuilder as AiContextBuilder, adapters as AiAdapter)
    await expect(assistant.chat({ repositoryId: 'repo-1', message: 'hi' })).rejects.toThrow()
  })
})
