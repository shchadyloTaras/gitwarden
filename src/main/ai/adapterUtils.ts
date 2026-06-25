import { z } from 'zod'
import {
  AiMessageSchema,
  AiRequestKindSchema,
  type AiUsageEstimateRequestInput,
} from '../../core/ai/schemas.js'
import type { AiConnection, AiModelInfo } from '../../core/ai/types.js'
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

export function modelInfo(id: string, localOnly: boolean, label?: string): AiModelInfo {
  return {
    id,
    label,
    structuredOutput: true,
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

export function parseStructuredValue<T>(schema: z.ZodType<T>, raw: unknown): T {
  const value = typeof raw === 'string' ? parseJsonString(raw) : raw
  return schema.parse(value)
}

export async function requestJson(
  http: HttpClient,
  input: Parameters<HttpClient['request']>[0]
): Promise<HttpResponse> {
  return http.request(input)
}

function parseJsonString(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('AI provider returned non-JSON structured content')
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function isRecommendedModel(id: string): boolean {
  return /claude|gpt-4|gpt-5|llama|mistral|qwen/i.test(id)
}
