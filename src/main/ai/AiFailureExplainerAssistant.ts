import type { z } from 'zod'
import {
  buildDeterministicGitFailureExplanation,
  buildDeterministicToolFailureExplanation,
  mergeFailureExplanation,
  type GitFailureInput,
  type ToolFailureInput,
} from '../../core/ai/failureExplain.js'
import {
  FAILURE_EXPLAIN_TASK_INSTRUCTION,
  parseFailureExplanationAiResponse,
} from '../../core/ai/outputs.js'
import { AiFailureExplanationAiResponseSchema } from '../../core/ai/schemas.js'
import type { AiFailureExplanation } from '../../core/ai/types.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import { providerJsonSchemaForKind } from '../../core/ai/providerSchemas.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'

export class AiFailureExplainerAssistant {
  constructor(
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  explainGitFailure(
    input: GitFailureInput & { repositoryId: string }
  ): Promise<AiFailureExplanation> {
    return this.explainWithAi({
      repositoryId: input.repositoryId,
      deterministic: buildDeterministicGitFailureExplanation(input),
      previewInput: {
        repositoryId: input.repositoryId,
        kind: 'failure-explain',
        failureGitCode: input.code,
        failureUserMessage: input.userMessage,
      },
    })
  }

  explainToolOutput(
    input: ToolFailureInput & { repositoryId: string }
  ): Promise<AiFailureExplanation> {
    return this.explainWithAi({
      repositoryId: input.repositoryId,
      deterministic: buildDeterministicToolFailureExplanation(input),
      previewInput: {
        repositoryId: input.repositoryId,
        kind: 'failure-explain',
        failureToolOutput: input.output,
      },
    })
  }

  buildDeterministicGitFailure(input: GitFailureInput): AiFailureExplanation {
    return buildDeterministicGitFailureExplanation(input)
  }

  buildDeterministicToolFailure(input: ToolFailureInput): AiFailureExplanation {
    return buildDeterministicToolFailureExplanation(input)
  }

  private async explainWithAi(args: {
    repositoryId: string
    deterministic: AiFailureExplanation
    previewInput: Parameters<AiContextBuilder['buildPreview']>[0]
  }): Promise<AiFailureExplanation> {
    try {
      const preview = await this.contextBuilder.buildPreview(args.previewInput)
      const raw = await this.generateStructured(
        preview,
        AiFailureExplanationAiResponseSchema,
        FAILURE_EXPLAIN_TASK_INSTRUCTION
      )
      return mergeFailureExplanation(
        args.deterministic,
        parseFailureExplanationAiResponse(raw).explanation
      )
    } catch {
      return args.deterministic
    }
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
      responseSchemaJson: providerJsonSchemaForKind(preview.kind),
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
