import { z } from 'zod'
import {
  AiMessageSchema,
  AiRequestKindSchema,
  type AiUsageEstimateRequestInput,
} from '../../core/ai/schemas.js'
import { parseStructuredAdapterValue } from '../../core/ai/structuredParse.js'
import type { AiConnection, AiModelInfo, AiRequestKind } from '../../core/ai/types.js'
import { deriveLocalOnly, isAllowedAiBaseUrl } from '../../core/ai/transport.js'
import type { HttpClient, HttpResponse } from '../services/HttpClient.js'
import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { IAiCredentialStore } from '../storage/AiCredentialStore.js'
import type { AiStructuredRequest } from './types.js'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENAI_COMPATIBLE_BASE_URL = 'https://api.openai.com/v1'
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
export const OLLAMA_BASE_URL = 'http://localhost:11434'

const StructuredRequestSchema = z.object({
  requestId: z.string().min(1),
  connectionId: z.string().min(1),
  kind: AiRequestKindSchema,
  messages: z.array(AiMessageSchema).min(1),
  prompt: z.string().optional(),
  model: z.string().optional(),
  responseSchemaJson: z.unknown(),
  metadata: z.record(z.unknown()).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  estimatedInputTokens: z.number().int().min(0).optional(),
  estimatedOutputTokens: z.number().int().min(0).optional(),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export abstract class AbortableAiAdapter {
  private readonly controllers = new Map<string, AbortController>()

  async cancel(requestId: string): Promise<void> {
    const controller = this.controllers.get(requestId)
    if (controller) {
      controller.abort()
      this.controllers.delete(requestId)
    }
  }

  protected async withAbortSignal<T>(
    requestId: string,
    run: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const controller = new AbortController()
    this.controllers.set(requestId, controller)
    try {
      return await run(controller.signal)
    } finally {
      this.controllers.delete(requestId)
    }
  }
}

export interface AdapterDeps {
  connections: IAiConnectionService
  credentials: IAiCredentialStore
  http: HttpClient
}

export async function getConnection(
  connections: IAiConnectionService,
  connectionId: string
): Promise<AiConnection> {
  const connection = await connections.get(connectionId)
  if (!connection) throw new Error(`AI connection not found: ${connectionId}`)
  return connection
}

export async function getApiKey(
  credentials: IAiCredentialStore,
  connection: AiConnection,
  required: boolean
): Promise<string | undefined> {
  const apiKey = await credentials.getSecret(connection.id, 'apiKey')
  if (required && !apiKey) throw new Error(`Missing API key for AI connection: ${connection.id}`)
  return apiKey
}

export function resolveBaseUrl(connection: AiConnection, fallback: string): string {
  const baseUrl = connection.baseUrl ?? fallback
  if (!isAllowedAiBaseUrl(baseUrl)) {
    throw new Error('AI base URL must be https:// or http:// loopback')
  }
  return trimTrailingSlash(baseUrl)
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlash(baseUrl)}/${path.replace(/^\/+/, '')}`
}

export function localOnlyFromBase(baseUrl: string): boolean {
  return deriveLocalOnly(baseUrl)
}

export function modelInfo(
  id: string,
  localOnly: boolean,
  label?: string,
  structuredOutput = true
): AiModelInfo {
  return {
    id,
    label,
    structuredOutput,
    recommended: isRecommendedModel(id) || undefined,
    localOnly,
  }
}

export function validateStructuredRequest<T>(request: AiStructuredRequest<T>): void {
  StructuredRequestSchema.parse(request)
  if (typeof request.responseSchema?.parse !== 'function') {
    throw new Error('AI structured request requires a Zod response schema')
  }
}

export function usageInputFromStructured<T>(
  request: AiStructuredRequest<T>
): AiUsageEstimateRequestInput {
  return {
    connectionId: request.connectionId,
    kind: request.kind,
    messages: request.messages,
    prompt: request.prompt,
    model: request.model,
    maxOutputTokens: request.maxOutputTokens,
    estimatedInputTokens: request.estimatedInputTokens,
    estimatedOutputTokens: request.estimatedOutputTokens,
    expensiveSendAcknowledged: request.expensiveSendAcknowledged,
  }
}

export function assertHttpOk(response: HttpResponse, label: string): void {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} failed with HTTP ${response.status}`)
  }
}

export function parseStructuredValue<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  kind: AiRequestKind
): T {
  return parseStructuredAdapterValue(schema, raw, kind)
}

export function modelSupportsStructuredOutput(supportedParameters: string[] | undefined): boolean {
  if (!supportedParameters || supportedParameters.length === 0) return false
  return supportedParameters.some(
    (param) => param === 'structured_outputs' || param === 'response_format'
  )
}

export async function assertStructuredOutputSupported(
  listModels: (connectionId: string) => Promise<AiModelInfo[]>,
  request: AiStructuredRequest<unknown>,
  modelId: string | undefined
): Promise<void> {
  if (request.kind === 'chat') return
  if (!modelId) return

  const models = await listModels(request.connectionId)
  const model = models.find((entry) => entry.id === modelId)
  // Only block when the provider explicitly reports no structured-output support.
  if (model && !model.structuredOutput) {
    throw new Error(
      `The selected model "${modelId}" does not support structured JSON output on this provider. Choose a structured-output-capable model or switch provider.`
    )
  }
}

export async function requestJson(
  http: HttpClient,
  input: Parameters<HttpClient['request']>[0]
): Promise<HttpResponse> {
  return http.request(input)
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function isRecommendedModel(id: string): boolean {
  return /claude|gpt-4|gpt-5|llama|mistral|qwen/i.test(id)
}
