import type { z } from 'zod'
import { mergeHistorySummary } from '../../core/ai/historySummary.js'
import {
  HISTORY_SUMMARY_TASK_INSTRUCTION,
  parseHistorySummaryAiResponse,
} from '../../core/ai/outputs.js'
import { AiHistorySummaryAiResponseSchema } from '../../core/ai/schemas.js'
import type { AiHistorySummary } from '../../core/ai/types.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'
import type { HistorySummaryService } from './HistorySummaryService.js'

export interface AiHistorySummaryInput {
  repositoryId: string
  expensiveSendAcknowledged?: boolean
}

export class AiHistorySummaryAssistant {
  constructor(
    private readonly historySummaryService: HistorySummaryService,
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async generateHistorySummary(input: AiHistorySummaryInput): Promise<AiHistorySummary> {
    const deterministic = await this.historySummaryService.buildDeterministic(input.repositoryId)

    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'history-summary',
    })

    const raw = await this.generateStructured(
      preview,
      AiHistorySummaryAiResponseSchema,
      HISTORY_SUMMARY_TASK_INSTRUCTION,
      input.expensiveSendAcknowledged
    )
    const ai = parseHistorySummaryAiResponse(raw)
    return mergeHistorySummary(deterministic, ai)
  }

  buildDeterministic(repositoryId: string): Promise<AiHistorySummary> {
    return this.historySummaryService.buildDeterministic(repositoryId)
  }

  private async generateStructured<T>(
    preview: Awaited<ReturnType<AiContextBuilder['buildPreview']>>,
    responseSchema: z.ZodType<T>,
    taskInstruction: string,
    expensiveSendAcknowledged?: boolean
  ): Promise<T> {
    const messages = withTaskInstruction(createAiContextMessages(preview), taskInstruction)
    return this.adapters.generateStructured({
      requestId: preview.requestId,
      connectionId: preview.connectionId,
      kind: preview.kind,
      messages,
      responseSchema,
      responseSchemaJson: zodToMinimalJsonSchema(responseSchema),
      metadata: {
        destinationHost: preview.destinationHost,
        redactionCount: preview.redactions.count,
        truncated: preview.truncated,
      },
      estimatedInputTokens: Math.ceil(preview.payloadText.length / 4),
      expensiveSendAcknowledged,
    })
  }
}

function withTaskInstruction(
  messages: ReturnType<typeof createAiContextMessages>,
  taskInstruction: string
): ReturnType<typeof createAiContextMessages> {
  const [system, user] = messages
  return [{ ...system, content: `${system.content}\n\n${taskInstruction}` }, user]
}

function zodToMinimalJsonSchema(schema: z.ZodType<unknown>): unknown {
  return {
    type: 'object',
    description: schema.description ?? 'GitWarden structured response',
  }
}
