import type { z } from 'zod'
import {
  buildDeterministicSafetyExplanation,
  mergeSafetyExplanation,
} from '../../core/ai/safetyCopilot.js'
import { SAFETY_EXPLAIN_TASK_INSTRUCTION, parseSafetyExplanation } from '../../core/ai/outputs.js'
import { AiSafetyExplanationSchema } from '../../core/ai/schemas.js'
import type { AiSafetyExplanation } from '../../core/ai/types.js'
import type { SafetyCode } from '../../core/safety/SafetyCheckService.js'
import { createAiContextMessages } from '../../core/ai/context.js'
import { providerJsonSchemaForKind } from '../../core/ai/providerSchemas.js'
import type { AiAdapter } from './types.js'
import type { AiContextBuilder } from './AiContextBuilder.js'

export interface AiSafetyCopilotInput {
  repositoryId: string
  safetyCode: SafetyCode
}

export class AiSafetyCopilotAssistant {
  constructor(
    private readonly contextBuilder: AiContextBuilder,
    private readonly adapters: AiAdapter
  ) {}

  async explainSafetyIssue(input: AiSafetyCopilotInput): Promise<AiSafetyExplanation> {
    const deterministic = buildDeterministicSafetyExplanation(input.safetyCode)

    const preview = await this.contextBuilder.buildPreview({
      repositoryId: input.repositoryId,
      kind: 'safety-explain',
      safetyCode: input.safetyCode,
    })

    const raw = await this.generateStructured(
      preview,
      AiSafetyExplanationSchema,
      `${SAFETY_EXPLAIN_TASK_INSTRUCTION}\n\nSafety issue code to explain: ${input.safetyCode}.`
    )
    const ai = parseSafetyExplanation(raw)
    return mergeSafetyExplanation(deterministic, ai.explanation)
  }

  /** Deterministic-only path — no network, works with AI disabled. */
  explainDeterministic(safetyCode: SafetyCode): AiSafetyExplanation {
    return buildDeterministicSafetyExplanation(safetyCode)
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
