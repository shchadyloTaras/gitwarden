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
import type { AiStructuredRequest, AiTextStreamRequest } from './types.js'

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

const TextStreamRequestSchema = z.object({
  requestId: z.string().min(1),
  connectionId: z.string().min(1),
  kind: AiRequestKindSchema,
  messages: z.array(AiMessageSchema).min(1),
  model: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  estimatedInputTokens: z.number().int().min(0).optional(),
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

export function validateTextStreamRequest(request: AiTextStreamRequest): void {
  TextStreamRequestSchema.parse(request)
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

export function usageInputFromTextStream(
  request: AiTextStreamRequest
): AiUsageEstimateRequestInput {
  return {
    connectionId: request.connectionId,
    kind: request.kind,
    messages: request.messages,
    model: request.model,
    estimatedInputTokens: request.estimatedInputTokens,
    expensiveSendAcknowledged: request.expensiveSendAcknowledged,
  }
}

/** Error carrying the originating HTTP status, so retry/branch logic needn't parse strings. */
export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'HttpStatusError'
  }
}

/**
 * Pulls a human-readable reason out of a provider error body. OpenAI-compatible
 * and Anthropic 4xx/5xx responses carry the real cause (e.g. context-length
 * overflow, unsupported `response_format`) under `error.message`; without this the
 * UI only ever sees a bare status code. The body is response data (never headers),
 * so no secrets are surfaced.
 */
export function providerErrorDetail(body: unknown): string {
  if (body == null) return ''
  if (typeof body === 'string') return truncateDetail(body)
  if (typeof body === 'object') {
    const record = body as Record<string, unknown>
    const error = record['error']
    if (typeof error === 'string') {
      const detail = truncateDetail(error)
      if (detail) return detail
    } else if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>)['message']
      if (typeof message === 'string') {
        const detail = truncateDetail(message)
        if (detail) return detail
      }
    }
    const topMessage = record['message']
    if (typeof topMessage === 'string') {
      const detail = truncateDetail(topMessage)
      if (detail) return detail
    }
  }
  try {
    const serialized = JSON.stringify(body)
    if (serialized && serialized !== '{}' && serialized !== 'null') {
      return truncateDetail(serialized)
    }
  } catch {
    // Non-serializable body — nothing more to surface.
  }
  return ''
}

function truncateDetail(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed
}

/** Builds the canonical "<label> failed with HTTP <status>[: <provider detail>]" error. */
export function httpStatusError(response: HttpResponse, label: string): HttpStatusError {
  const detail = providerErrorDetail(response.json) || truncateDetail(response.bodyText ?? '')
  const suffix = detail ? `: ${detail}` : ''
  return new HttpStatusError(
    `${label} failed with HTTP ${response.status}${suffix}`,
    response.status
  )
}

export function assertHttpOk(response: HttpResponse, label: string): void {
  if (response.status < 200 || response.status >= 300) {
    throw httpStatusError(response, label)
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

/** Parse OpenAI-compatible SSE chat completion chunks. */
export async function streamOpenAiChatCompletions(
  fetchImpl: typeof fetch,
  input: {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
    signal: AbortSignal
    onDelta: (delta: string) => void
  }
): Promise<void> {
  const res = await fetchImpl(input.url, {
    method: 'POST',
    headers: {
      ...input.headers,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...input.body, stream: true }),
    signal: input.signal,
  })
  if (!res.ok) {
    throw new Error(`Streaming chat failed with HTTP ${res.status}`)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Streaming chat returned no response body')

  const decoder = new TextDecoder()
  let buffer = ''
  // Intentional read-until-exhausted loop: the stream ends via `done` (or an inner `[DONE]`
  // sentinel), not a loop condition.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: unknown } }>
        }
        const delta = json.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) input.onDelta(delta)
      } catch {
        // Ignore malformed SSE JSON lines.
      }
    }
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function isRecommendedModel(id: string): boolean {
  return /claude|gpt-4|gpt-5|llama|mistral|qwen/i.test(id)
}
