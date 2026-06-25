import type { z } from 'zod'
import { mergePushBrief } from '../../core/ai/pushBrief.js'
import { PUSH_BRIEF_TASK_INSTRUCTION, parsePushBriefAiResponse } from '../../core/ai/outputs.js'
import { AiPushBriefAiResponseSchema } from '../../core/ai/schemas.js'
import type { AiPushBrief } from '../../core/ai/types.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'
import type { PushBriefInput, PushBriefService } from './PushBriefService.js'

export class AiPushBriefAssistant {
  constructor(
    private readonly pushBriefService: PushBriefService,
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async generatePushBrief(input: PushBriefInput): Promise<AiPushBrief> {
    const deterministic = await this.pushBriefService.buildDeterministic(input)

    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'push-brief',
      remoteName: input.remoteName,
      branch: input.branch,
      pushGithub: input.github,
    })

    const raw = await this.generateStructured(
      preview,
      AiPushBriefAiResponseSchema,
      PUSH_BRIEF_TASK_INSTRUCTION,
      input.expensiveSendAcknowledged
    )
    const ai = parsePushBriefAiResponse(raw)
    return mergePushBrief(deterministic, ai)
  }

  buildDeterministic(input: PushBriefInput): Promise<AiPushBrief> {
    return this.pushBriefService.buildDeterministic(input)
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
