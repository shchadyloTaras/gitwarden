import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type {
  AiConnection,
  AiConnectionKind,
  AiCredentialMetadata,
} from '../../src/core/ai/index.js'
import { deriveLocalOnly } from '../../src/core/ai/index.js'
import type { IAiConnectionService } from '../../src/main/services/AiConnectionService.js'
import type {
  AiCredentialInput,
  IAiCredentialStore,
} from '../../src/main/storage/AiCredentialStore.js'
import type { HttpClient, HttpRequest, HttpResponse } from '../../src/main/services/HttpClient.js'
import {
  AnthropicAdapter,
  OllamaAdapter,
  OpenAICompatibleAdapter,
  OpenRouterAdapter,
} from '../../src/main/ai/builtInAdapters.js'
import { CustomHttpAdapter, maskHeaderValues } from '../../src/main/ai/CustomHttpAdapter.js'
import { AiAdapterRegistry } from '../../src/main/ai/AiAdapterRegistry.js'
import { AiSpendGuard } from '../../src/main/ai/spendGuard.js'
import type { AiAdapter, AiStructuredRequest } from '../../src/main/ai/types.js'

const ISO = '2026-06-25T10:00:00.000Z'

class FakeHttp implements HttpClient {
  readonly requests: HttpRequest[] = []

  constructor(private readonly replies: HttpResponse[]) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request)
    const reply = this.replies.shift()
    if (!reply) throw new Error(`unexpected HTTP request: ${request.method} ${request.url}`)
    return reply
  }

  async postForm(): Promise<HttpResponse> {
    throw new Error('postForm() not used by AI adapters')
  }

  async get(): Promise<HttpResponse> {
    throw new Error('get() not used by AI adapters')
  }
}

class FakeConnections implements IAiConnectionService {
  constructor(private readonly records: AiConnection[]) {}

  async list(): Promise<{ connections: AiConnection[]; activeConnectionId?: string }> {
    return { connections: this.records, activeConnectionId: this.records[0]?.id }
  }

  async get(id: string): Promise<AiConnection | undefined> {
    return this.records.find((c) => c.id === id)
  }

  async create(): Promise<AiConnection> {
    throw new Error('create() not used')
  }

  async update(): Promise<AiConnection> {
    throw new Error('update() not used')
  }

  async delete(): Promise<void> {
    throw new Error('delete() not used')
  }

  async setActive(): Promise<void> {
    throw new Error('setActive() not used')
  }
}

class FakeCredentials implements IAiCredentialStore {
  constructor(private readonly secrets: Record<string, Record<string, string>> = {}) {}

  async save(_input: AiCredentialInput): Promise<AiCredentialMetadata> {
    throw new Error('save() not used')
  }

  async getMetadata(): Promise<AiCredentialMetadata | undefined> {
    return undefined
  }

  async getSecret(connectionId: string, field: string): Promise<string | undefined> {
    return this.secrets[connectionId]?.[field]
  }

  async delete(): Promise<void> {}
}

function connection(kind: AiConnectionKind, patch: Partial<AiConnection> = {}): AiConnection {
  const baseUrl = patch.baseUrl
  return {
    id: patch.id ?? 'ai-1',
    name: patch.name ?? kind,
    kind,
    enabled: patch.enabled ?? true,
    baseUrl,
    defaultModel: patch.defaultModel,
    privacyMode: patch.privacyMode ?? 'preview-each',
    retention: patch.retention ?? 'unknown',
    capabilities: patch.capabilities ?? {
      structuredOutput: true,
      streaming: kind !== 'custom-http',
      modelList: kind !== 'custom-http',
      usage: kind !== 'ollama' && kind !== 'custom-http',
      localOnly: deriveLocalOnly(baseUrl),
    },
    customHttpMapping: patch.customHttpMapping,
    createdAt: patch.createdAt ?? ISO,
    updatedAt: patch.updatedAt ?? ISO,
  }
}

function structuredRequest<T>(
  connectionId: string,
  responseSchema: z.ZodType<T>,
  patch: Partial<AiStructuredRequest<T>> = {}
): AiStructuredRequest<T> {
  return {
    requestId: patch.requestId ?? 'req-1',
    connectionId,
    kind: patch.kind ?? 'change-summary',
    messages: patch.messages ?? [{ role: 'user', content: 'Summarize this change.' }],
    prompt: patch.prompt,
    model: patch.model,
    responseSchema,
    responseSchemaJson: patch.responseSchemaJson ?? {
      type: 'object',
      properties: { summary: { type: 'string' }, highlights: { type: 'array' } },
      required: ['summary', 'highlights'],
    },
    maxOutputTokens: patch.maxOutputTokens,
    estimatedInputTokens: patch.estimatedInputTokens,
    estimatedOutputTokens: patch.estimatedOutputTokens,
    expensiveSendAcknowledged: patch.expensiveSendAcknowledged,
    metadata: patch.metadata,
  }
}

describe('built-in AI adapters', () => {
  it('lists local OpenAI-compatible models over loopback http without pre-filtering them away', async () => {
    const conn = connection('openai-compatible', {
      baseUrl: 'http://localhost:1234/v1',
    })
    const http = new FakeHttp([
      { status: 200, json: { data: [{ id: 'local-a' }, { id: 'local-b' }] } },
    ])
    const adapter = new OpenAICompatibleAdapter(
      { connections: new FakeConnections([conn]), credentials: new FakeCredentials(), http },
      new AiSpendGuard()
    )

    const models = await adapter.listModels(conn.id)

    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      url: 'http://localhost:1234/v1/models',
    })
    expect(http.requests[0].headers).not.toHaveProperty('Authorization')
    expect(models.map((m) => m.id)).toEqual(['local-a', 'local-b'])
    expect(models.every((m) => m.structuredOutput && m.localOnly)).toBe(true)
  })

  it('rejects non-loopback http base URLs before any provider call', async () => {
    const conn = connection('openai-compatible', { baseUrl: 'http://192.168.1.20:1234/v1' })
    const http = new FakeHttp([])
    const adapter = new OpenAICompatibleAdapter(
      { connections: new FakeConnections([conn]), credentials: new FakeCredentials(), http },
      new AiSpendGuard()
    )

    await expect(adapter.listModels(conn.id)).rejects.toThrow(/base URL/)
    expect(http.requests).toHaveLength(0)
  })

  it('requests OpenAI-style structured JSON and fail-closes through Zod parsing', async () => {
    const conn = connection('openai-compatible', {
      baseUrl: 'http://127.0.0.1:1234/v1',
      defaultModel: 'local-model',
    })
    const schema = z.object({ summary: z.string(), highlights: z.array(z.string()) })
    const http = new FakeHttp([
      {
        status: 200,
        json: { choices: [{ message: { content: '{"summary":"ok","highlights":["a"]}' } }] },
      },
      {
        status: 200,
        json: { choices: [{ message: { content: '{"summary":7,"highlights":[]}' } }] },
      },
    ])
    const adapter = new OpenAICompatibleAdapter(
      { connections: new FakeConnections([conn]), credentials: new FakeCredentials(), http },
      new AiSpendGuard()
    )

    await expect(adapter.generateStructured(structuredRequest(conn.id, schema))).resolves.toEqual({
      summary: 'ok',
      highlights: ['a'],
    })
    expect(http.requests[0].json).toMatchObject({
      response_format: { type: 'json_schema' },
    })
    await expect(adapter.generateStructured(structuredRequest(conn.id, schema))).rejects.toThrow()
  })

  it('uses OpenRouter default routing with a stored API key', async () => {
    const conn = connection('openrouter')
    const http = new FakeHttp([{ status: 200, json: { data: [{ id: 'openrouter/fake' }] } }])
    const adapter = new OpenRouterAdapter(
      {
        connections: new FakeConnections([conn]),
        credentials: new FakeCredentials({ [conn.id]: { apiKey: 'sk-or-secret' } }),
        http,
      },
      new AiSpendGuard()
    )

    await expect(adapter.listModels(conn.id)).resolves.toHaveLength(1)
    expect(http.requests[0].url).toBe('https://openrouter.ai/api/v1/models')
    expect(http.requests[0].headers).toMatchObject({ Authorization: 'Bearer sk-or-secret' })
  })

  it('parses Anthropic tool-use structured output through the caller Zod schema', async () => {
    const conn = connection('anthropic', { defaultModel: 'claude-test' })
    const schema = z.object({ summary: z.string(), highlights: z.array(z.string()) })
    const http = new FakeHttp([
      {
        status: 200,
        json: {
          content: [
            {
              type: 'tool_use',
              name: 'gitwarden_response',
              input: { summary: 'anthropic ok', highlights: ['tool'] },
            },
          ],
        },
      },
    ])
    const adapter = new AnthropicAdapter(
      {
        connections: new FakeConnections([conn]),
        credentials: new FakeCredentials({ [conn.id]: { apiKey: 'sk-ant-secret' } }),
        http,
      },
      new AiSpendGuard()
    )

    await expect(adapter.generateStructured(structuredRequest(conn.id, schema))).resolves.toEqual({
      summary: 'anthropic ok',
      highlights: ['tool'],
    })
    expect(http.requests[0].json).toMatchObject({
      tools: [{ name: 'gitwarden_response' }],
      tool_choice: { type: 'tool', name: 'gitwarden_response' },
    })
  })

  it('treats Ollama as local from its resolved default host', async () => {
    const conn = connection('ollama')
    const http = new FakeHttp([{ status: 200, json: { models: [{ name: 'llama3.2:latest' }] } }])
    const adapter = new OllamaAdapter(
      { connections: new FakeConnections([conn]), credentials: new FakeCredentials(), http },
      new AiSpendGuard()
    )

    const models = await adapter.listModels(conn.id)

    expect(http.requests[0].url).toBe('http://localhost:11434/api/tags')
    expect(models[0]).toMatchObject({ id: 'llama3.2:latest', localOnly: true })
  })
})

describe('CustomHttpAdapter', () => {
  it('renders supported placeholders, masks secret header surfaces, and maps a safe JSONPath response', async () => {
    const secret = 'sk-custom-secret'
    const conn = connection('custom-http', {
      defaultModel: 'custom-model',
      customHttpMapping: {
        method: 'POST',
        url: 'https://api.example.test/generate',
        headersTemplate: { Authorization: 'Bearer {{apiKey}}' },
        bodyTemplate: {
          model: '{{model}}',
          messages: '{{messagesJson}}',
          schema: '{{responseSchemaJson}}',
          metadata: '{{metadataJson}}',
        },
        responseMapping: { text: '$.result' },
      },
    })
    const schema = z.object({ summary: z.string(), highlights: z.array(z.string()) })
    const http = new FakeHttp([
      { status: 200, json: { result: '{"summary":"ok","highlights":[]}' } },
    ])
    const adapter = new CustomHttpAdapter(
      {
        connections: new FakeConnections([conn]),
        credentials: new FakeCredentials({ [conn.id]: { apiKey: secret } }),
        http,
      },
      new AiSpendGuard()
    )

    const result = await adapter.generateStructured(
      structuredRequest(conn.id, schema, { metadata: { repo: 'gitwarden' } })
    )

    expect(result.summary).toBe('ok')
    expect(http.requests[0].headers).toMatchObject({ Authorization: `Bearer ${secret}` })
    expect(http.requests[0].json).toMatchObject({ model: 'custom-model' })
    expect(
      maskHeaderValues({ Authorization: `Bearer ${secret}` }, secret).Authorization
    ).not.toContain(secret)
  })
})

describe('AiAdapterRegistry', () => {
  it('routes calls by saved connection kind', async () => {
    const conn = connection('openrouter')
    const connections = new FakeConnections([conn])
    const adapter: AiAdapter = {
      testConnection: async (connectionId) => ({
        connectionId,
        ok: true,
        localOnly: false,
        models: [],
      }),
      listModels: async () => [],
      generateStructured: async () => {
        throw new Error('not used')
      },
      estimateUsage: async () => ({ inputTokens: 1 }),
      cancel: async () => {},
    }
    const registry = new AiAdapterRegistry(connections, {
      openrouter: adapter,
      'openai-compatible': adapter,
      anthropic: adapter,
      ollama: adapter,
      'custom-http': adapter,
    })

    await expect(registry.testConnection(conn.id)).resolves.toMatchObject({ ok: true })
  })
})
