import type { AiConnectionKind, AiConnectionTemplateExport, CustomHttpMapping } from './types.js'

export const CONNECTION_TEMPLATE_EXPORT_VERSION = 1 as const

/** Built-in connection templates — no secrets, no ids (Phase 38). */
export const BUILTIN_CONNECTION_TEMPLATES: AiConnectionTemplateExport[] = [
  {
    version: CONNECTION_TEMPLATE_EXPORT_VERSION,
    name: 'OpenRouter',
    kind: 'openrouter',
    defaultModel: 'openrouter/auto',
    privacyMode: 'preview-each',
    retention: 'unknown',
  },
  {
    version: CONNECTION_TEMPLATE_EXPORT_VERSION,
    name: 'OpenAI-compatible',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    privacyMode: 'preview-each',
    retention: 'unknown',
  },
  {
    version: CONNECTION_TEMPLATE_EXPORT_VERSION,
    name: 'Anthropic',
    kind: 'anthropic',
    defaultModel: 'claude-3-5-sonnet-latest',
    privacyMode: 'preview-each',
    retention: 'unknown',
  },
  {
    version: CONNECTION_TEMPLATE_EXPORT_VERSION,
    name: 'Ollama (local)',
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
    privacyMode: 'preview-each',
    retention: 'zero-retention',
  },
  {
    version: CONNECTION_TEMPLATE_EXPORT_VERSION,
    name: 'Custom HTTP example',
    kind: 'custom-http',
    privacyMode: 'preview-each',
    retention: 'unknown',
    customHttpMapping: customHttpExampleMapping(),
  },
]

export function connectionToTemplateExport(connection: {
  name: string
  kind: AiConnectionKind
  baseUrl?: string
  defaultModel?: string
  privacyMode: AiConnectionTemplateExport['privacyMode']
  retention: AiConnectionTemplateExport['retention']
  customHttpMapping?: CustomHttpMapping
}): AiConnectionTemplateExport {
  return {
    version: CONNECTION_TEMPLATE_EXPORT_VERSION,
    name: connection.name,
    kind: connection.kind,
    baseUrl: connection.baseUrl,
    defaultModel: connection.defaultModel,
    privacyMode: connection.privacyMode,
    retention: connection.retention,
    customHttpMapping: connection.customHttpMapping,
  }
}

/** Strip any secret-shaped fields that must never appear in exports. */
export function assertTemplateHasNoSecrets(template: AiConnectionTemplateExport): void {
  const serialized = JSON.stringify(template)
  const forbidden = [
    'sk-or-',
    'sk-ant-',
    'sk-proj-',
    'gsk_',
    'Bearer sk-',
    '"password":',
    '"secret":',
    '"token":',
  ]
  for (const token of forbidden) {
    if (serialized.includes(token)) {
      throw new Error('Exported template must not contain credential material.')
    }
  }
}

function customHttpExampleMapping(): CustomHttpMapping {
  return {
    method: 'POST',
    url: 'https://example.com/v1/chat',
    headersTemplate: {
      Authorization: 'Bearer {{apiKey}}',
      'Content-Type': 'application/json',
    },
    bodyTemplate: {
      model: '{{model}}',
      messages: '{{messagesJson}}',
    },
    responseMapping: {
      text: '$.choices[0].message.content',
      inputTokens: '$.usage.prompt_tokens',
      outputTokens: '$.usage.completion_tokens',
    },
  }
}
