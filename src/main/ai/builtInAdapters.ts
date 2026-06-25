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
import {
  ANTHROPIC_BASE_URL,
  AbortableAiAdapter,
  OLLAMA_BASE_URL,
  OPENAI_COMPATIBLE_BASE_URL,
  OPENROUTER_BASE_URL,
  assertHttpOk,
  getApiKey,
  getConnection,
  joinUrl,
  localOnlyFromBase,
  modelInfo,
  parseStructuredValue,
  requestJson,
  resolveBaseUrl,
  usageInputFromStructured,
  validateStructuredRequest,
} from './adapterUtils.js'
import type { AdapterDeps } from './adapterUtils.js'
import { AiSpendGuard } from './spendGuard.js'
import type { AiStructuredRequest } from './types.js'

const OpenAiModelsResponseSchema = z
  .object({
    data: z.array(z.object({ id: z.string(), name: z.string().optional() }).passthrough()),
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

    const response = await this.withAbortSignal(request.requestId, (signal) =>
      requestJson(this.http, {
        method: 'POST',
        url: joinUrl(baseUrl, '/chat/completions'),
        headers,
        signal,
        json: {
          model,
          messages: request.messages,
          temperature: 0.2,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'gitwarden_response',
              strict: true,
              schema: request.responseSchemaJson,
            },
          },
        },
      })
    )
    assertHttpOk(response, `${this.label} structured generation`)
    const parsed = OpenAiChatResponseSchema.parse(response.json)
    const raw = parsed.choices[0].message.content
    const result = parseStructuredValue(request.responseSchema, raw)
    this.guard.record(estimate)
    return result
  }

  private async authHeaders(
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
    const result = parseStructuredValue(request.responseSchema, raw)
    this.guard.record(estimate)
    return result
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
    const result = parseStructuredValue(request.responseSchema, parsed.message.content)
    this.guard.record(estimate)
    return result
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
