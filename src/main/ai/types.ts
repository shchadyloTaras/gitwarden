import type { z } from 'zod'
import type {
  AiConnectionTestResult,
  AiMessage,
  AiModelInfo,
  AiRequestKind,
  AiUsageEstimate,
  AiUsageEstimateRequest,
} from '../../core/ai/types.js'

/** Request shape used by adapters that must return a Zod-validated object. */
export interface AiStructuredRequest<T> {
  requestId: string
  connectionId: string
  kind: AiRequestKind
  messages: AiMessage[]
  prompt?: string
  model?: string
  responseSchema: z.ZodType<T>
  responseSchemaJson: unknown
  metadata?: Record<string, unknown>
  maxOutputTokens?: number
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  expensiveSendAcknowledged?: boolean
}

/** Request shape for plain-text streaming completions (advisory chat). */
export interface AiTextStreamRequest {
  requestId: string
  connectionId: string
  kind: AiRequestKind
  messages: AiMessage[]
  model?: string
  metadata?: Record<string, unknown>
  estimatedInputTokens?: number
  expensiveSendAcknowledged?: boolean
}

/** Main-process adapter contract. Renderer never talks to providers directly. */
export interface AiAdapter {
  testConnection(connectionId: string): Promise<AiConnectionTestResult>
  listModels(connectionId: string): Promise<AiModelInfo[]>
  generateStructured<T>(request: AiStructuredRequest<T>): Promise<T>
  /** Stream plain-text tokens. Implementations may throw when unsupported. */
  generateTextStream(request: AiTextStreamRequest, onDelta: (delta: string) => void): Promise<void>
  estimateUsage(request: AiUsageEstimateRequest): Promise<AiUsageEstimate>
  cancel(requestId: string): Promise<void>
}
