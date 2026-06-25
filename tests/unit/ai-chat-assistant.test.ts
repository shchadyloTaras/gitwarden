import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiChatAssistant } from '../../src/main/ai/AiChatAssistant'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'
import type { AiAdapter } from '../../src/main/ai/types'
import { AI_CHAT_RESPONSE_JSON_SCHEMA } from '../../src/core/ai/providerSchemas'

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
  let adapters: Pick<AiAdapter, 'generateStructured'>

  beforeEach(() => {
    contextBuilder = { buildPreview: vi.fn().mockResolvedValue(preview) }
    adapters = {
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
    expect(result.suggestedCommands).toEqual(['/review'])
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

    const call = (adapters.generateStructured as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const roles = call.messages.map((m: { role: string }) => m.role)
    expect(roles).toEqual(['system', 'user', 'user', 'assistant', 'user'])
    expect(call.messages[0].content).toContain('advisory')
    expect(call.messages.at(-1).content).toBe('And now?')
    expect(call.kind).toBe('chat')
    expect(call.responseSchemaJson).toEqual(AI_CHAT_RESPONSE_JSON_SCHEMA)
  })

  it('fails closed when the adapter returns a malformed response', async () => {
    adapters.generateStructured = vi.fn().mockResolvedValue({ notReply: 1 })
    const assistant = new AiChatAssistant(contextBuilder as AiContextBuilder, adapters as AiAdapter)
    await expect(assistant.chat({ repositoryId: 'repo-1', message: 'hi' })).rejects.toThrow()
  })
})
