import { z } from 'zod'
import { CustomHttpMappingSchema } from '../../core/ai/schemas.js'
import { findPlaceholders } from '../../core/ai/customHttp.js'
import { getByJsonPath } from '../../core/ai/jsonpath.js'
import { maskSecret } from '../../core/ai/credentials.js'
import type {
  AiConnectionTestResult,
  AiModelInfo,
  AiUsageEstimate,
  AiUsageEstimateRequest,
  CustomHttpMapping,
} from '../../core/ai/types.js'
import { deriveLocalOnly } from '../../core/ai/transport.js'
import type { HttpClient } from '../services/HttpClient.js'
import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { IAiCredentialStore } from '../storage/AiCredentialStore.js'
import {
  AbortableAiAdapter,
  assertHttpOk,
  getConnection,
  modelInfo,
  parseStructuredValue,
  requestJson,
  usageInputFromStructured,
  validateStructuredRequest,
} from './adapterUtils.js'
import type { AdapterDeps } from './adapterUtils.js'
import { AiSpendGuard } from './spendGuard.js'
import type { AiAdapter, AiStructuredRequest, AiTextStreamRequest } from './types.js'

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g
const EXACT_PLACEHOLDER_RE = /^\{\{\s*([A-Za-z0-9_]+)\s*\}\}$/

interface RenderContext {
  apiKey?: string
  model: string
  messagesJson: unknown
  promptJson: unknown
  responseSchemaJson: unknown
  metadataJson: unknown
}

interface RenderedCustomHttpRequest {
  url: string
  headers: Record<string, string>
  maskedHeaders: Record<string, string>
  body: unknown
}

export class CustomHttpAdapter extends AbortableAiAdapter implements AiAdapter {
  private readonly connections: IAiConnectionService
  private readonly credentials: IAiCredentialStore
  private readonly http: HttpClient

  constructor(
    deps: AdapterDeps,
    private readonly guard: AiSpendGuard
  ) {
    super()
    this.connections = deps.connections
    this.credentials = deps.credentials
    this.http = deps.http
  }

  async testConnection(connectionId: string): Promise<AiConnectionTestResult> {
    const connection = await getConnection(this.connections, connectionId)
    const mapping = mappingFor(connection.customHttpMapping)
    const models = await this.listModels(connectionId)
    return {
      connectionId,
      ok: true,
      localOnly: deriveLocalOnly(mapping.url),
      models,
      message: 'Custom HTTP mapping is valid',
    }
  }

  async listModels(connectionId: string): Promise<AiModelInfo[]> {
    const connection = await getConnection(this.connections, connectionId)
    const mapping = mappingFor(connection.customHttpMapping)
    return connection.defaultModel
      ? [modelInfo(connection.defaultModel, deriveLocalOnly(mapping.url))]
      : []
  }

  estimateUsage(request: AiUsageEstimateRequest): Promise<AiUsageEstimate> {
    return Promise.resolve(this.guard.estimate(request))
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    validateStructuredRequest(request)
    const connection = await getConnection(this.connections, request.connectionId)
    const mapping = mappingFor(connection.customHttpMapping)
    const model = request.model ?? connection.defaultModel
    if (!model) throw new Error('AI model is required')
    const estimate = this.guard.assertAllowed(usageInputFromStructured({ ...request, model }))
    const rendered = await this.renderRequest(mapping, request, model)

    const response = await this.withAbortSignal(request.requestId, (signal) =>
      requestJson(this.http, {
        method: mapping.method,
        url: rendered.url,
        headers: rendered.headers,
        json: rendered.body,
        signal,
      })
    )
    assertHttpOk(response, 'Custom HTTP structured generation')
    const raw = getByJsonPath(response.json, mapping.responseMapping.text)
    if (raw === undefined) throw new Error('Custom HTTP response mapping did not resolve text')
    const result = parseStructuredValue(request.responseSchema, raw, request.kind)
    this.guard.record(estimate)
    return result
  }

  async generateTextStream(
    _request: AiTextStreamRequest,
    _onDelta: (delta: string) => void
  ): Promise<void> {
    throw new Error('Streaming is not supported for Custom HTTP connections.')
  }

  private async renderRequest<T>(
    mapping: CustomHttpMapping,
    request: AiStructuredRequest<T>,
    model: string
  ): Promise<RenderedCustomHttpRequest> {
    const needsApiKey = mappingNeedsApiKey(mapping)
    const apiKey = needsApiKey
      ? await this.credentials.getSecret(request.connectionId, 'apiKey')
      : undefined
    if (needsApiKey && !apiKey) throw new Error('Missing API key for Custom HTTP connection')

    const context: RenderContext = {
      apiKey,
      model,
      messagesJson: request.messages,
      promptJson: {
        kind: request.kind,
        prompt: request.prompt,
        messages: request.messages,
      },
      responseSchemaJson: request.responseSchemaJson,
      metadataJson: request.metadata ?? {},
    }

    const headers = Object.fromEntries(
      Object.entries(mapping.headersTemplate).map(([key, value]) => [
        renderTemplateString(key, context),
        renderTemplateString(value, context),
      ])
    )
    return {
      url: renderTemplateString(mapping.url, context),
      headers,
      maskedHeaders: maskHeaderValues(headers, apiKey),
      body: renderTemplateValue(mapping.bodyTemplate, context),
    }
  }
}

function mappingFor(mapping: CustomHttpMapping | undefined): CustomHttpMapping {
  if (!mapping) throw new Error('Custom HTTP connection requires a mapping')
  return CustomHttpMappingSchema.parse(mapping)
}

function mappingNeedsApiKey(mapping: CustomHttpMapping): boolean {
  return [
    ...findPlaceholders(mapping.url),
    ...Object.entries(mapping.headersTemplate).flatMap(([k, v]) => [
      ...findPlaceholders(k),
      ...findPlaceholders(v),
    ]),
    ...findPlaceholders(JSON.stringify(mapping.bodyTemplate) ?? ''),
  ].includes('apiKey')
}

function renderTemplateValue(value: unknown, context: RenderContext): unknown {
  if (typeof value === 'string') {
    const exact = EXACT_PLACEHOLDER_RE.exec(value)
    if (exact) return placeholderValue(exact[1], context)
    return renderTemplateString(value, context)
  }
  if (Array.isArray(value)) return value.map((item) => renderTemplateValue(item, context))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        renderTemplateString(key, context),
        renderTemplateValue(child, context),
      ])
    )
  }
  return value
}

function renderTemplateString(template: string, context: RenderContext): string {
  return template.replace(PLACEHOLDER_RE, (_whole, name: string) => {
    const value = placeholderValue(name, context)
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}

function placeholderValue(name: string, context: RenderContext): unknown {
  switch (name) {
    case 'apiKey':
      return context.apiKey ?? ''
    case 'model':
      return context.model
    case 'messagesJson':
      return context.messagesJson
    case 'promptJson':
      return context.promptJson
    case 'responseSchemaJson':
      return context.responseSchemaJson
    case 'metadataJson':
      return context.metadataJson
    default:
      throw new Error(`Unsupported Custom HTTP placeholder: {{${name}}}`)
  }
}

export function maskHeaderValues(
  headers: Record<string, string>,
  apiKey: string | undefined
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (!apiKey || !value.includes(apiKey)) return [key, value]
      return [key, value.replaceAll(apiKey, maskSecret(apiKey))]
    })
  )
}

export function readMappedUsage(
  json: unknown,
  mapping: CustomHttpMapping
): { inputTokens?: number; outputTokens?: number } {
  return {
    inputTokens: readOptionalNumber(json, mapping.responseMapping.inputTokens),
    outputTokens: readOptionalNumber(json, mapping.responseMapping.outputTokens),
  }
}

function readOptionalNumber(json: unknown, path: string | undefined): number | undefined {
  if (!path) return undefined
  const value = getByJsonPath(json, path)
  const parsed = z.number().safeParse(value)
  return parsed.success ? parsed.data : undefined
}
