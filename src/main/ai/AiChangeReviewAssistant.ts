import type { z } from 'zod'
import { mergeChangeReview } from '../../core/ai/changeReview.js'
import { CHANGE_REVIEW_TASK_INSTRUCTION, parseChangeReview } from '../../core/ai/outputs.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import { AiChangeReviewSchema } from '../../core/ai/schemas.js'
import type { AiChangeReview, AiReviewFinding } from '../../core/ai/types.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'
import type { StagedChangeReviewService } from './StagedChangeReviewService.js'

export interface AiChangeReviewAssistantInput {
  repositoryId: string
  commitMessage?: string
}

export class AiChangeReviewAssistant {
  constructor(
    private readonly stagedReview: StagedChangeReviewService,
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async reviewStagedChanges(input: AiChangeReviewAssistantInput): Promise<AiChangeReview> {
    const deterministic = await this.stagedReview.scanDeterministic({
      repositoryId: input.repositoryId,
    })

    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'change-review',
      commitMessage: input.commitMessage,
    })

    const raw = await this.generateStructured(
      preview,
      AiChangeReviewSchema,
      CHANGE_REVIEW_TASK_INSTRUCTION
    )
    const aiReview = parseChangeReview(raw)
    const aiFindings = aiReview.findings.filter((f) => f.source === 'ai')

    return mergeChangeReview(deterministic, aiFindings, aiReview.overall)
  }

  private async generateStructured<T>(
    preview: Awaited<ReturnType<AiContextBuilder['buildPreview']>>,
    responseSchema: z.ZodType<T>,
    taskInstruction: string
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

export type { AiReviewFinding }
