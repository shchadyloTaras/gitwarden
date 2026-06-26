import type { z } from 'zod'
import { mergeRepoBrief } from '../../core/ai/repoBrief.js'
import { REPO_BRIEF_TASK_INSTRUCTION, parseRepoBriefAiResponse } from '../../core/ai/outputs.js'
import { AiRepoBriefAiResponseSchema } from '../../core/ai/schemas.js'
import type { AiRepoBrief } from '../../core/ai/types.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import { providerJsonSchemaForKind } from '../../core/ai/providerSchemas.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'
import type { RepoBriefService } from './RepoBriefService.js'

export interface AiRepoBriefInput {
  repositoryId: string
  expensiveSendAcknowledged?: boolean
}

export class AiRepoBriefAssistant {
  constructor(
    private readonly repoBriefService: RepoBriefService,
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async generateRepoBrief(input: AiRepoBriefInput): Promise<AiRepoBrief> {
    const deterministic = await this.repoBriefService.buildDeterministic(input.repositoryId)
    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'repo-brief',
    })
    const raw = await this.generateStructured(
      preview,
      AiRepoBriefAiResponseSchema,
      REPO_BRIEF_TASK_INSTRUCTION,
      input.expensiveSendAcknowledged
    )
    return mergeRepoBrief(deterministic, parseRepoBriefAiResponse(raw))
  }

  buildDeterministic(repositoryId: string): Promise<AiRepoBrief> {
    return this.repoBriefService.buildDeterministic(repositoryId)
  }

  listAllowlistedFiles(repositoryId: string) {
    return this.repoBriefService.listAllowlistedFiles(repositoryId)
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
      responseSchemaJson: providerJsonSchemaForKind(preview.kind),
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
