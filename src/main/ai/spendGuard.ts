import type { AiUsageEstimate, AiUsageEstimateRequest } from '../../core/ai/types.js'
import { AiUsageEstimateRequestSchema } from '../../core/ai/schemas.js'

export interface AiSpendGuardConfig {
  perRequestTokenCap: number
  dailySoftCap: number
  expensiveTokenWarning: number
  now?: () => Date
}

const DEFAULT_CONFIG: AiSpendGuardConfig = {
  perRequestTokenCap: 20_000,
  dailySoftCap: 100_000,
  expensiveTokenWarning: 8_000,
}

export class AiSpendGuard {
  private readonly usedByDay = new Map<string, number>()
  private readonly config: Required<AiSpendGuardConfig>

  constructor(config: Partial<AiSpendGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, now: () => new Date(), ...config }
  }

  estimate(raw: AiUsageEstimateRequest): AiUsageEstimate {
    const request = AiUsageEstimateRequestSchema.parse(raw)
    const inputTokens = request.estimatedInputTokens ?? estimateTextTokens(request)
    const outputTokens = request.estimatedOutputTokens ?? request.maxOutputTokens ?? 0
    const total = inputTokens + outputTokens
    const warnings: string[] = []

    if (total > this.config.perRequestTokenCap) {
      warnings.push(`Request estimate ${total} tokens exceeds the per-request cap`)
    }
    if (total >= this.config.expensiveTokenWarning) {
      warnings.push('This AI request is estimated to be expensive')
    }
    if (this.usedToday() + total > this.config.dailySoftCap) {
      warnings.push('This AI request would exceed the daily soft cap')
    }

    return {
      inputTokens,
      outputTokens: outputTokens || undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      requiresExplicitWarning: warnings.some((w) => !w.includes('per-request cap')) || undefined,
    }
  }

  assertAllowed(request: AiUsageEstimateRequest): AiUsageEstimate {
    const estimate = this.estimate(request)
    const total = estimate.inputTokens + (estimate.outputTokens ?? 0)
    if (total > this.config.perRequestTokenCap) {
      throw new Error(
        `AI request estimate ${total} tokens exceeds the per-request cap of ${this.config.perRequestTokenCap}`
      )
    }
    if (estimate.requiresExplicitWarning && !request.expensiveSendAcknowledged) {
      throw new Error('AI request requires an explicit expensive-send warning acknowledgement')
    }
    return estimate
  }

  record(estimate: AiUsageEstimate): void {
    const key = dayKey(this.config.now())
    this.usedByDay.set(key, this.usedToday() + estimate.inputTokens + (estimate.outputTokens ?? 0))
  }

  private usedToday(): number {
    return this.usedByDay.get(dayKey(this.config.now())) ?? 0
  }
}

function estimateTextTokens(request: AiUsageEstimateRequest): number {
  const text = [
    request.prompt,
    ...(request.messages ?? []).map((m) => `${m.role}: ${m.content}`),
    request.model,
  ]
    .filter(Boolean)
    .join('\n')
  return Math.max(1, Math.ceil(text.length / 4))
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}
