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

/** Main-process adapter contract. Renderer never talks to providers directly. */
export interface AiAdapter {
  testConnection(connectionId: string): Promise<AiConnectionTestResult>
  listModels(connectionId: string): Promise<AiModelInfo[]>
  generateStructured<T>(request: AiStructuredRequest<T>): Promise<T>
  estimateUsage(request: AiUsageEstimateRequest): Promise<AiUsageEstimate>
  cancel(requestId: string): Promise<void>
}
