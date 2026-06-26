import { z } from 'zod'
import type {
  AiConnection,
  AiConnectionTestResult,
  AiMessage,
  AiModelInfo,
  AiUsageEstimate,
  AiUsageEstimateRequest,
} from '../../core/ai/types.js'
import type { HttpClient } from '../services/HttpClient.js'
import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { IAiCredentialStore } from '../storage/AiCredentialStore.js'
import { isStructuredParseFailure } from '../../core/ai/capabilityErrors.js'
import {
  ANTHROPIC_BASE_URL,
  AbortableAiAdapter,
  HttpStatusError,
  OLLAMA_BASE_URL,
  OPENAI_COMPATIBLE_BASE_URL,
  OPENROUTER_BASE_URL,
  assertHttpOk,
  assertStructuredOutputSupported,
  getApiKey,
  getConnection,
  joinUrl,
  localOnlyFromBase,
  modelInfo,
  modelSupportsStructuredOutput,
  parseStructuredValue,
  requestJson,
  resolveBaseUrl,
  streamOpenAiChatCompletions,
  usageInputFromStructured,
  usageInputFromTextStream,
  validateStructuredRequest,
  validateTextStreamRequest,
} from './adapterUtils.js'
import type { AdapterDeps } from './adapterUtils.js'
import { AiSpendGuard } from './spendGuard.js'
import type { AiStructuredRequest, AiTextStreamRequest } from './types.js'

const OpenAiModelsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string(),
          name: z.string().optional(),
          supported_parameters: z.array(z.string()).optional(),
        })
        .passthrough()
    ),
  })
  .passthrough()

const OpenAiChatResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.unknown().optional(),
              })
              .passthrough(),
          })
          .passthrough()
      )
      .min(1),
  })
  .passthrough()

const AnthropicModelsResponseSchema = z
  .object({
    data: z
      .array(z.object({ id: z.string(), display_name: z.string().optional() }).passthrough())
      .default([]),
  })
  .passthrough()

const AnthropicMessagesResponseSchema = z
  .object({
    content: z.array(z.object({ type: z.string() }).passthrough()).min(1),
  })
  .passthrough()

const OllamaModelsResponseSchema = z
  .object({
    models: z.array(z.object({ name: z.string(), model: z.string().optional() }).passthrough()),
  })
  .passthrough()

const OllamaChatResponseSchema = z
  .object({
    message: z.object({ content: z.unknown() }).passthrough(),
  })
  .passthrough()

abstract class BaseBuiltInAdapter extends AbortableAiAdapter {
  protected readonly connections: IAiConnectionService
  protected readonly credentials: IAiCredentialStore
  protected readonly http: HttpClient

  constructor(
    deps: AdapterDeps,
    protected readonly guard: AiSpendGuard
  ) {
    super()
    this.connections = deps.connections
    this.credentials = deps.credentials
    this.http = deps.http
  }

  estimateUsage(request: AiUsageEstimateRequest): Promise<AiUsageEstimate> {
    return Promise.resolve(this.guard.estimate(request))
  }
}

export class OpenAICompatibleAdapter extends BaseBuiltInAdapter {
  constructor(
    deps: AdapterDeps,
    guard: AiSpendGuard,
    private readonly fallbackBaseUrl = OPENAI_COMPATIBLE_BASE_URL,
    private readonly label = 'OpenAI-compatible'
  ) {
    super(deps, guard)
  }

  async testConnection(connectionId: string): Promise<AiConnectionTestResult> {
    const connection = await getConnection(this.connections, connectionId)
    const baseUrl = resolveBaseUrl(connection, this.fallbackBaseUrl)
    const models = await this.listModels(connectionId)
    return {
      connectionId,
      ok: true,
      localOnly: localOnlyFromBase(baseUrl),
      models,
      message: `${this.label} connection returned ${models.length} model(s)`,
    }
  }

  async listModels(connectionId: string): Promise<AiModelInfo[]> {
    const connection = await getConnection(this.connections, connectionId)
    const baseUrl = resolveBaseUrl(connection, this.fallbackBaseUrl)
    const localOnly = localOnlyFromBase(baseUrl)
    const headers = await this.authHeaders(connection, !localOnly)
    const response = await requestJson(this.http, {
      method: 'GET',
      url: joinUrl(baseUrl, '/models'),
      headers,
    })
    assertHttpOk(response, `${this.label} model list`)
    const parsed = OpenAiModelsResponseSchema.parse(response.json)
    return parsed.data.map((m) => modelInfo(m.id, localOnly, m.name))
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    validateStructuredRequest(request)
    const connection = await getConnection(this.connections, request.connectionId)
    const baseUrl = resolveBaseUrl(connection, this.fallbackBaseUrl)
    const localOnly = localOnlyFromBase(baseUrl)
    const model = request.model ?? connection.defaultModel
    if (!model) throw new Error('AI model is required')
    const estimate = this.guard.assertAllowed(usageInputFromStructured({ ...request, model }))
    const headers = await this.authHeaders(connection, !localOnly)

    const attempts = openAiStructuredAttempts(request, model)
    let lastError: Error | undefined
    for (const json of attempts) {
      const isFinalAttempt = json === attempts[attempts.length - 1]
      try {
        const response = await this.withAbortSignal(request.requestId, (signal) =>
          requestJson(this.http, {
            method: 'POST',
            url: joinUrl(baseUrl, '/chat/completions'),
            headers,
            signal,
            json,
          })
        )
        // Throws an HttpStatusError carrying the provider's error body on any
        // non-2xx (e.g. a 400 that explains an unsupported response_format or a
        // context-length overflow), so the surfaced message names the real cause.
        assertHttpOk(response, `${this.label} structured generation`)
        const parsed = OpenAiChatResponseSchema.parse(response.json)
        const raw = parsed.choices[0].message.content
        const result = parseStructuredValue(request.responseSchema, raw, request.kind)
        this.guard.record(estimate)
        return result
      } catch (err) {
        // Earlier attempts use progressively looser request shapes: a 400 (the
        // shape was rejected) or an unparseable 200 (the model ignored the schema)
        // should fall through to the next shape — ultimately the plain completion.
        if (!isFinalAttempt && isRetriableStructuredError(err)) {
          lastError = err instanceof Error ? err : new Error(String(err))
          continue
        }
        throw err
      }
    }
    throw lastError ?? new Error(`${this.label} structured generation failed`)
  }

  async generateTextStream(
    request: AiTextStreamRequest,
    onDelta: (delta: string) => void
  ): Promise<void> {
    validateTextStreamRequest(request)
    const connection = await getConnection(this.connections, request.connectionId)
    const baseUrl = resolveBaseUrl(connection, this.fallbackBaseUrl)
    const localOnly = localOnlyFromBase(baseUrl)
    const model = request.model ?? connection.defaultModel
    if (!model) throw new Error('AI model is required')
    const estimate = this.guard.assertAllowed(usageInputFromTextStream({ ...request, model }))
    const headers = await this.authHeaders(connection, !localOnly)

    await this.withAbortSignal(request.requestId, (signal) =>
      streamOpenAiChatCompletions(fetch, {
        url: joinUrl(baseUrl, '/chat/completions'),
        headers,
        body: {
          model,
          messages: request.messages,
          temperature: 0.2,
        },
        signal,
        onDelta,
      })
    )
    this.guard.record(estimate)
  }

  protected async authHeaders(
    connection: AiConnection,
    required: boolean
  ): Promise<Record<string, string>> {
    const apiKey = await getApiKey(this.credentials, connection, required)
    return {
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }
  }
}

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor(deps: AdapterDeps, guard: AiSpendGuard) {
    super(deps, guard, OPENROUTER_BASE_URL, 'OpenRouter')
  }

  override async listModels(connectionId: string): Promise<AiModelInfo[]> {
    const connection = await getConnection(this.connections, connectionId)
    const baseUrl = resolveBaseUrl(connection, OPENROUTER_BASE_URL)
    const headers = await this.authHeaders(connection, true)
    const response = await requestJson(this.http, {
      method: 'GET',
      url: joinUrl(baseUrl, '/models'),
      headers,
    })
    assertHttpOk(response, 'OpenRouter model list')
    const parsed = OpenAiModelsResponseSchema.parse(response.json)
    return parsed.data.map((m) =>
      modelInfo(m.id, false, m.name, modelSupportsStructuredOutput(m.supported_parameters))
    )
  }

  override async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    const connection = await getConnection(this.connections, request.connectionId)
    const effectiveModel = request.model ?? connection.defaultModel
    await assertStructuredOutputSupported((id) => this.listModels(id), request, effectiveModel)
    return super.generateStructured(request)
  }
}

export class AnthropicAdapter extends BaseBuiltInAdapter {
  async testConnection(connectionId: string): Promise<AiConnectionTestResult> {
    const connection = await getConnection(this.connections, connectionId)
    const baseUrl = resolveBaseUrl(connection, ANTHROPIC_BASE_URL)
    const models = await this.listModels(connectionId)
    return {
      connectionId,
      ok: true,
      localOnly: localOnlyFromBase(baseUrl),
      models,
      message: `Anthropic connection returned ${models.length} model(s)`,
    }
  }

  async listModels(connectionId: string): Promise<AiModelInfo[]> {
    const connection = await getConnection(this.connections, connectionId)
    const baseUrl = resolveBaseUrl(connection, ANTHROPIC_BASE_URL)
    const localOnly = localOnlyFromBase(baseUrl)
    const apiKey = await getApiKey(this.credentials, connection, !localOnly)
    const response = await requestJson(this.http, {
      method: 'GET',
      url: joinUrl(baseUrl, '/models'),
      headers: anthropicHeaders(apiKey),
    })
    assertHttpOk(response, 'Anthropic model list')
    const parsed = AnthropicModelsResponseSchema.parse(response.json)
    return parsed.data.map((m) => modelInfo(m.id, localOnly, m.display_name))
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    validateStructuredRequest(request)
    const connection = await getConnection(this.connections, request.connectionId)
    const baseUrl = resolveBaseUrl(connection, ANTHROPIC_BASE_URL)
    const localOnly = localOnlyFromBase(baseUrl)
    const model = request.model ?? connection.defaultModel
    if (!model) throw new Error('AI model is required')
    const estimate = this.guard.assertAllowed(usageInputFromStructured({ ...request, model }))
    const apiKey = await getApiKey(this.credentials, connection, !localOnly)
    const { system, messages } = splitAnthropicMessages(request.messages)

    const response = await this.withAbortSignal(request.requestId, (signal) =>
      requestJson(this.http, {
        method: 'POST',
        url: joinUrl(baseUrl, '/messages'),
        headers: anthropicHeaders(apiKey),
        signal,
        json: {
          model,
          max_tokens: request.maxOutputTokens ?? 1024,
          ...(system ? { system } : {}),
          messages,
          tools: [
            {
              name: 'gitwarden_response',
              description: 'Return the GitWarden structured response.',
              input_schema: request.responseSchemaJson,
            },
          ],
          tool_choice: { type: 'tool', name: 'gitwarden_response' },
        },
      })
    )
    assertHttpOk(response, 'Anthropic structured generation')
    const parsed = AnthropicMessagesResponseSchema.parse(response.json)
    const raw = readAnthropicStructuredContent(parsed.content)
    const result = parseStructuredValue(request.responseSchema, raw, request.kind)
    this.guard.record(estimate)
    return result
  }

  async generateTextStream(
    _request: AiTextStreamRequest,
    _onDelta: (delta: string) => void
  ): Promise<void> {
    throw new Error('Streaming is not supported for Anthropic connections.')
  }
}

export class OllamaAdapter extends BaseBuiltInAdapter {
  async testConnection(connectionId: string): Promise<AiConnectionTestResult> {
    const connection = await getConnection(this.connections, connectionId)
    const baseUrl = resolveBaseUrl(connection, OLLAMA_BASE_URL)
    const models = await this.listModels(connectionId)
    return {
      connectionId,
      ok: true,
      localOnly: localOnlyFromBase(baseUrl),
      models,
      message: `Ollama connection returned ${models.length} model(s)`,
    }
  }

  async listModels(connectionId: string): Promise<AiModelInfo[]> {
    const connection = await getConnection(this.connections, connectionId)
    const baseUrl = resolveBaseUrl(connection, OLLAMA_BASE_URL)
    const localOnly = localOnlyFromBase(baseUrl)
    const response = await requestJson(this.http, {
      method: 'GET',
      url: joinUrl(baseUrl, '/api/tags'),
      headers: { Accept: 'application/json' },
    })
    assertHttpOk(response, 'Ollama model list')
    const parsed = OllamaModelsResponseSchema.parse(response.json)
    return parsed.models.map((m) => modelInfo(m.model ?? m.name, localOnly, m.name))
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    validateStructuredRequest(request)
    const connection = await getConnection(this.connections, request.connectionId)
    const baseUrl = resolveBaseUrl(connection, OLLAMA_BASE_URL)
    const model = request.model ?? connection.defaultModel
    if (!model) throw new Error('AI model is required')
    const estimate = this.guard.assertAllowed(usageInputFromStructured({ ...request, model }))

    const response = await this.withAbortSignal(request.requestId, (signal) =>
      requestJson(this.http, {
        method: 'POST',
        url: joinUrl(baseUrl, '/api/chat'),
        headers: { Accept: 'application/json' },
        signal,
        json: {
          model,
          messages: request.messages,
          stream: false,
          format: request.responseSchemaJson,
          options: { temperature: 0.2 },
        },
      })
    )
    assertHttpOk(response, 'Ollama structured generation')
    const parsed = OllamaChatResponseSchema.parse(response.json)
    const result = parseStructuredValue(
      request.responseSchema,
      parsed.message.content,
      request.kind
    )
    this.guard.record(estimate)
    return result
  }

  async generateTextStream(
    _request: AiTextStreamRequest,
    _onDelta: (delta: string) => void
  ): Promise<void> {
    throw new Error('Streaming is not supported for Ollama connections.')
  }
}

function anthropicHeaders(apiKey: string | undefined): Record<string, string> {
  return {
    Accept: 'application/json',
    'anthropic-version': '2023-06-01',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  }
}

function splitAnthropicMessages(messages: AiMessage[]): {
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  return {
    system: system || undefined,
    messages: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  }
}

function readAnthropicStructuredContent(content: Array<Record<string, unknown>>): unknown {
  const toolUse = content.find((item) => item['type'] === 'tool_use')
  if (toolUse && 'input' in toolUse) return toolUse['input']
  const text = content.find((item) => item['type'] === 'text')
  if (text && 'text' in text) return text['text']
  throw new Error('Anthropic response did not contain structured output')
}

function openAiStructuredAttempts<T>(
  request: AiStructuredRequest<T>,
  model: string
): Record<string, unknown>[] {
  const base = {
    model,
    messages: request.messages,
    temperature: 0.2,
  }
  const schema = request.responseSchemaJson
  return [
    {
      ...base,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'gitwarden_response', strict: true, schema },
      },
    },
    {
      ...base,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'gitwarden_response', strict: false, schema },
      },
    },
    {
      ...base,
      response_format: { type: 'json_object' },
    },
    base,
  ]
}

function isRetriableStructuredError(err: unknown): boolean {
  // Only a rejected request shape (HTTP 400) or a structured-parse failure is
  // worth retrying with a looser shape; auth/rate-limit/server errors and aborts
  // propagate immediately rather than hammering the provider four times.
  if (err instanceof HttpStatusError) return err.status === 400
  if (err instanceof Error) return isStructuredParseFailure(err.message)
  return false
}
