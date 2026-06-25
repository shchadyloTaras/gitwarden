import type { z } from 'zod'
import { validateAgenticProposal } from '../../core/ai/agenticProposal.js'
import { AGENTIC_PROPOSAL_TASK_INSTRUCTION, parseAgenticProposal } from '../../core/ai/outputs.js'
import { AiAgenticProposalSchema } from '../../core/ai/schemas.js'
import type { AiAgenticProposal } from '../../core/ai/types.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'

export class AiAgenticAssistant {
  constructor(
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async propose(repositoryId: string, userPrompt: string): Promise<AiAgenticProposal> {
    const preview = await this.contextBuilder.buildPreview({
      repositoryId,
      kind: 'agentic-proposal',
      commitMessage: userPrompt,
    })
    const raw = await this.generateStructured(
      preview,
      AiAgenticProposalSchema,
      `${AGENTIC_PROPOSAL_TASK_INSTRUCTION}\n\nUser request: ${userPrompt}`
    )
    return validateAgenticProposal(parseAgenticProposal(raw))
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
