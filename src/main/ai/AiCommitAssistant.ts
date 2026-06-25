import type { z } from 'zod'
import {
  CHANGE_SUMMARY_TASK_INSTRUCTION,
  COMMIT_DRAFT_TASK_INSTRUCTION,
  parseChangeSummary,
  parseCommitDraft,
} from '../../core/ai/outputs.js'
import { AiChangeSummarySchema, AiCommitDraftSchema } from '../../core/ai/schemas.js'
import type { AiChangeSummary, AiCommitDraft } from '../../core/ai/types.js'
import { createAiContextMessages, type AiPreparedContext } from '../../core/ai/context.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'

export interface AiCommitAssistantInput {
  repositoryId: string
  commitMessage?: string
}

export class AiCommitAssistant {
  constructor(
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async draftCommitMessage(input: AiCommitAssistantInput): Promise<AiCommitDraft> {
    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'commit-draft',
      commitMessage: input.commitMessage,
    })
    const raw = await this.generateStructured(
      preview,
      AiCommitDraftSchema,
      COMMIT_DRAFT_TASK_INSTRUCTION
    )
    return parseCommitDraft(raw)
  }

  async summarizeStagedChanges(input: AiCommitAssistantInput): Promise<AiChangeSummary> {
    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'change-summary',
      commitMessage: input.commitMessage,
    })
    const raw = await this.generateStructured(
      preview,
      AiChangeSummarySchema,
      CHANGE_SUMMARY_TASK_INSTRUCTION
    )
    return parseChangeSummary(raw)
  }

  private async generateStructured<T>(
    preview: AiPreparedContext,
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
