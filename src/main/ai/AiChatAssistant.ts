import type { z } from 'zod'
import { CHAT_TASK_INSTRUCTION, parseChatResponse } from '../../core/ai/outputs.js'
import { AI_CHAT_RESPONSE_JSON_SCHEMA } from '../../core/ai/providerSchemas.js'
import { AiChatResponseSchema } from '../../core/ai/schemas.js'
import type { AiChatResponse, AiChatTurn, AiMessage } from '../../core/ai/types.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'

/** How many prior conversation turns to carry into a chat send. */
const MAX_HISTORY_TURNS = 10

export interface AiChatInput {
  repositoryId: string
  message: string
  history?: AiChatTurn[]
  expensiveSendAcknowledged?: boolean
}

/**
 * Advisory free-text chat (Phase 52). It reuses the same redaction + enablement
 * + send-preview pipeline (`AiContextBuilder`) and the injected adapter registry
 * as every other AI feature — it adds NO new authority. The chat never runs a
 * Git action; `suggestedCommands` are hints the user may choose to run.
 */
export class AiChatAssistant {
  constructor(
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async chat(input: AiChatInput): Promise<AiChatResponse> {
    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'chat',
    })

    const [system, contextUser] = createAiContextMessages(preview)
    const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS)
    const messages: AiMessage[] = [
      { ...system, content: `${system.content}\n\n${CHAT_TASK_INSTRUCTION}` },
      contextUser,
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user' as const, content: input.message },
    ]

    const raw = await this.generateStructured(
      preview,
      AiChatResponseSchema,
      messages,
      input.expensiveSendAcknowledged
    )
    return parseChatResponse(raw)
  }

  private async generateStructured<T>(
    preview: Awaited<ReturnType<AiContextBuilder['buildPreview']>>,
    responseSchema: z.ZodType<T>,
    messages: AiMessage[],
    expensiveSendAcknowledged?: boolean
  ): Promise<T> {
    const estimatedInputTokens = Math.ceil(
      messages.reduce((sum, m) => sum + m.content.length, 0) / 4
    )
    return this.adapters.generateStructured({
      requestId: preview.requestId,
      connectionId: preview.connectionId,
      kind: preview.kind,
      messages,
      responseSchema,
      responseSchemaJson: AI_CHAT_RESPONSE_JSON_SCHEMA,
      metadata: {
        destinationHost: preview.destinationHost,
        redactionCount: preview.redactions.count,
        truncated: preview.truncated,
      },
      estimatedInputTokens,
      expensiveSendAcknowledged,
    })
  }
}
