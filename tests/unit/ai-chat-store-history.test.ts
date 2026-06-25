import { describe, expect, it } from 'vitest'

/** Mirrors aiChatStore free-text chat history assembly after the duplicate fix. */
function priorHistoryForChatSend<
  T extends { role: string; content: string; isError?: boolean; kind?: string },
>(messages: T[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const priorMessages = messages.slice(0, -1)
  return priorMessages
    .filter((m) => !m.isError && (m.role === 'user' || (m.role === 'assistant' && !m.kind)))
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}

describe('ai chat history assembly', () => {
  it('does not duplicate the current user message in history', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'And now?' },
    ]

    const history = priorHistoryForChatSend(messages)
    const currentMessage = 'And now?'

    expect(history).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])
    expect(history.filter((turn) => turn.content === currentMessage)).toHaveLength(0)
  })
})
