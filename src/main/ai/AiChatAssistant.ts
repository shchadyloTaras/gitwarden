import type { z } from 'zod'
import {
  CHAT_STREAM_TASK_INSTRUCTION,
  CHAT_TASK_INSTRUCTION,
  parseChatResponse,
} from '../../core/ai/outputs.js'
import { providerJsonSchemaForKind } from '../../core/ai/providerSchemas.js'
import { AiChatResponseSchema } from '../../core/ai/schemas.js'
import type { AiChatResponse, AiChatTurn, AiMessage } from '../../core/ai/types.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'
import {
  ChatBlockSuggestionSchema,
  CHAT_BLOCK_SUGGESTION_JSON_SCHEMA,
  CHAT_BLOCK_SUGGEST_INSTRUCTION,
  parseChatBlockSuggestion,
  type ChatBlockSuggestion,
} from '../../core/ai/chatBlocks.js'

/** How many prior conversation turns to carry into a chat send. */
const MAX_HISTORY_TURNS = 10

export interface AiChatInput {
  repositoryId: string
  message: string
  history?: AiChatTurn[]
  selectedUnstagedPaths?: string[]
  requestId?: string
  expensiveSendAcknowledged?: boolean
}

export interface AiChatSuggestBlockInput {
  repositoryId: string
  message: string
  assistantReply: string
  history?: AiChatTurn[]
  selectedUnstagedPaths?: string[]
  requestId?: string
  expensiveSendAcknowledged?: boolean
}

export interface AiChatStreamEmitter {
  onDelta: (delta: string) => void
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
      selectedUnstagedPaths: input.selectedUnstagedPaths,
      requestId: input.requestId,
    })

    const [system, contextUser] = createAiContextMessages(preview)
    const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS)
    const messages: AiMessage[] = [
      { ...system, content: `${system.content}\n\n${CHAT_STREAM_TASK_INSTRUCTION}` },
      contextUser,
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user' as const, content: input.message },
    ]

    try {
      let reply = ''
      await this.adapters.generateTextStream(
        {
          requestId: preview.requestId,
          connectionId: preview.connectionId,
          kind: preview.kind,
          messages,
          metadata: {
            destinationHost: preview.destinationHost,
            redactionCount: preview.redactions.count,
            truncated: preview.truncated,
          },
          estimatedInputTokens: Math.ceil(
            messages.reduce((sum, m) => sum + m.content.length, 0) / 4
          ),
          expensiveSendAcknowledged: input.expensiveSendAcknowledged,
        },
        (delta) => {
          reply += delta
        }
      )
      return { reply: reply.trim() || '(empty reply)' }
    } catch {
      return this.chatStructured(input, preview, messages)
    }
  }

  async chatStream(input: AiChatInput, emit: AiChatStreamEmitter): Promise<AiChatResponse> {
    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'chat',
      selectedUnstagedPaths: input.selectedUnstagedPaths,
      requestId: input.requestId,
    })

    const [system, contextUser] = createAiContextMessages(preview)
    const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS)
    const messages: AiMessage[] = [
      { ...system, content: `${system.content}\n\n${CHAT_STREAM_TASK_INSTRUCTION}` },
      contextUser,
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user' as const, content: input.message },
    ]

    try {
      let reply = ''
      await this.adapters.generateTextStream(
        {
          requestId: preview.requestId,
          connectionId: preview.connectionId,
          kind: preview.kind,
          messages,
          metadata: {
            destinationHost: preview.destinationHost,
            redactionCount: preview.redactions.count,
            truncated: preview.truncated,
          },
          estimatedInputTokens: Math.ceil(
            messages.reduce((sum, m) => sum + m.content.length, 0) / 4
          ),
          expensiveSendAcknowledged: input.expensiveSendAcknowledged,
        },
        (delta) => {
          reply += delta
          emit.onDelta(delta)
        }
      )
      return { reply: reply.trim() || '(empty reply)' }
    } catch {
      const structured = await this.chatStructured(input, preview, messages)
      if (structured.reply.length > 0) emit.onDelta(structured.reply)
      return structured
    }
  }

  /**
   * Post-stream pass (Phase 62, Level 2): given the finished free-text exchange,
   * OPTIONALLY return one allowlisted block (scoped to commit-draft — the chat
   * context has no diffs). Fail-closed: any error, or no fitting card, yields no
   * block, so the streamed text is left unchanged. Adds no new authority.
   */
  async suggestBlock(input: AiChatSuggestBlockInput): Promise<ChatBlockSuggestion> {
    try {
      const preview = await this.contextBuilder.buildPreview({
        repositoryId: input.repositoryId,
        kind: 'chat',
        selectedUnstagedPaths: input.selectedUnstagedPaths,
        requestId: input.requestId,
      })
      const [system, contextUser] = createAiContextMessages(preview)
      const history = (input.history ?? []).slice(-MAX_HISTORY_TURNS)
      const messages: AiMessage[] = [
        { ...system, content: `${system.content}\n\n${CHAT_BLOCK_SUGGEST_INSTRUCTION}` },
        contextUser,
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: 'user' as const, content: input.message },
        { role: 'assistant' as const, content: input.assistantReply },
      ]
      const raw = await this.adapters.generateStructured({
        requestId: preview.requestId,
        connectionId: preview.connectionId,
        kind: preview.kind,
        messages,
        responseSchema: ChatBlockSuggestionSchema,
        responseSchemaJson: CHAT_BLOCK_SUGGESTION_JSON_SCHEMA,
        metadata: {
          destinationHost: preview.destinationHost,
          redactionCount: preview.redactions.count,
          truncated: preview.truncated,
        },
        estimatedInputTokens: Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4),
        expensiveSendAcknowledged: input.expensiveSendAcknowledged,
      })
      return parseChatBlockSuggestion(raw)
    } catch {
      return { block: null }
    }
  }

  private async chatStructured(
    input: AiChatInput,
    preview: Awaited<ReturnType<AiContextBuilder['buildPreview']>>,
    messages: AiMessage[]
  ): Promise<AiChatResponse> {
    const structuredMessages: AiMessage[] = [
      {
        ...messages[0],
        content: `${messages[0].content.split('\n\n')[0]}\n\n${CHAT_TASK_INSTRUCTION}`,
      },
      ...messages.slice(1),
    ]
    const raw = await this.generateStructured(
      preview,
      AiChatResponseSchema,
      structuredMessages,
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
      responseSchemaJson: providerJsonSchemaForKind(preview.kind),
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
