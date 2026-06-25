// AI Connections — pure core Zod schemas (Phase 28). No node/electron/DOM imports.
//
// These are the IPC/storage boundary validators (mirrors of ./types). The Custom
// HTTP mapping schema additionally enforces the §6.3 constraints — allowed
// transport, the closed placeholder set, and the safe JSONPath subset — so a
// malformed mapping is rejected at the boundary, not at send time.

import { z } from 'zod'
import { isAllowedAiBaseUrl } from './transport.js'
import { isSafeJsonPath } from './jsonpath.js'
import {
  collectMappingPlaceholders,
  findPlaceholders,
  isSupportedPlaceholder,
} from './customHttp.js'
import type { CustomHttpMapping } from './types.js'

// ── Enums ────────────────────────────────────────────────────────────────────

export const AiConnectionKindSchema = z.enum([
  'openrouter',
  'openai-compatible',
  'anthropic',
  'ollama',
  'custom-http',
])

export const AiPrivacyModeSchema = z.enum(['off', 'preview-each', 'preview-first-run'])

export const AiRetentionStateSchema = z.enum(['zero-retention', 'unknown', 'user-accepted'])

export const AiRequestKindSchema = z.enum([
  'commit-draft',
  'change-summary',
  'change-review',
  'safety-explain',
  'push-brief',
  'history-summary',
  'repo-brief',
  'failure-explain',
])

export const AiDetectionConfidenceSchema = z.enum(['high', 'medium', 'low'])
export const AiFindingSourceSchema = z.enum(['deterministic', 'ai'])
export const AiConfidenceSchema = z.enum(['low', 'medium', 'high'])
export const AiReviewCategorySchema = z.enum([
  'secret-like',
  'risky-file',
  'migration',
  'lockfile',
  'generated',
  'missing-tests',
  'destructive',
])

// ── Connection records ─────────────────────────────────────────────────────────

export const AiConnectionCapabilitiesSchema = z.object({
  structuredOutput: z.boolean(),
  streaming: z.boolean(),
  modelList: z.boolean(),
  usage: z.boolean(),
  localOnly: z.boolean(),
})

export const AiConnectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: AiConnectionKindSchema,
    enabled: z.boolean(),
    baseUrl: z.string().optional(),
    defaultModel: z.string().optional(),
    privacyMode: AiPrivacyModeSchema,
    retention: AiRetentionStateSchema,
    capabilities: AiConnectionCapabilitiesSchema,
    customHttpMapping: z.lazy(() => CustomHttpMappingSchema).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  // A stored base URL must satisfy the shared transport gate (https, or http
  // loopback). The destination is non-secret, so this is checkable here. §3.
  .superRefine((conn, ctx) => {
    if (conn.baseUrl !== undefined && !isAllowedAiBaseUrl(conn.baseUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'baseUrl must be https:// (or http:// to a loopback host)',
      })
    }
    if (conn.kind === 'custom-http' && conn.customHttpMapping === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customHttpMapping'],
        message: 'custom-http connections require a Custom HTTP mapping',
      })
    }
    if (conn.kind !== 'custom-http' && conn.customHttpMapping !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customHttpMapping'],
        message: 'customHttpMapping is only valid for custom-http connections',
      })
    }
  })

export const AiConnectionsDataSchema = z.object({
  connections: z.array(AiConnectionSchema),
  // Which connection is the single active one in the MVP UI. Non-secret pointer;
  // a dangling id (e.g. after a delete) is treated as "no active" by the service.
  activeConnectionId: z.string().optional(),
})

export const AiCredentialMetadataSchema = z.object({
  connectionId: z.string(),
  label: z.string(),
  maskedPreview: z.string(),
  secretFields: z.array(z.string()),
  updatedAt: z.string(),
})

export const AiProviderDetectionSchema = z.object({
  kind: z.union([AiConnectionKindSchema, z.literal('unknown')]),
  confidence: AiDetectionConfidenceSchema,
  reason: z.string(),
  suggestedBaseUrl: z.string().optional(),
})

// ── Custom HTTP mapping (the §6.3 constrained, declarative mapping) ─────────────

export const CustomHttpResponseMappingSchema = z.object({
  text: z.string(),
  inputTokens: z.string().optional(),
  outputTokens: z.string().optional(),
})

const JsonTemplateValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonTemplateValueSchema),
    z.record(JsonTemplateValueSchema),
  ])
)

export const CustomHttpMappingSchema = z
  .object({
    method: z.literal('POST'),
    url: z.string(),
    headersTemplate: z.record(z.string()),
    bodyTemplate: JsonTemplateValueSchema,
    responseMapping: CustomHttpResponseMappingSchema,
  })
  .superRefine((mapping, ctx) => {
    // 1. Transport gate: https only, loopback http excepted.
    if (!isAllowedAiBaseUrl(mapping.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'url must be https:// (or http:// to a loopback host)',
      })
    }

    // 2. Closed placeholder set — reject anything outside SUPPORTED_PLACEHOLDERS.
    const unsupported = [
      ...new Set(
        collectMappingPlaceholders(mapping as CustomHttpMapping).filter(
          (name) => !isSupportedPlaceholder(name)
        )
      ),
    ]
    if (unsupported.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported placeholder(s): ${unsupported.map((n) => `{{${n}}}`).join(', ')}`,
      })
    }

    // 2b. Secret-leaking mapping guard: {{apiKey}} is only allowed in header
    // values, where it can be masked in all renderer/log surfaces. It is never
    // allowed in URLs, header names, or request bodies.
    if (findPlaceholders(mapping.url).includes('apiKey')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: '{{apiKey}} may only be used in header values',
      })
    }
    for (const key of Object.keys(mapping.headersTemplate)) {
      if (findPlaceholders(key).includes('apiKey')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['headersTemplate', key],
          message: '{{apiKey}} may only be used in header values',
        })
      }
    }
    const serializedBody = JSON.stringify(mapping.bodyTemplate) ?? ''
    if (findPlaceholders(serializedBody).includes('apiKey')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bodyTemplate'],
        message: '{{apiKey}} may only be used in header values',
      })
    }

    // 3. Response mapping is the safe JSONPath subset (no filter/script/wildcard).
    const checks: Array<[keyof typeof mapping.responseMapping, string | undefined]> = [
      ['text', mapping.responseMapping.text],
      ['inputTokens', mapping.responseMapping.inputTokens],
      ['outputTokens', mapping.responseMapping.outputTokens],
    ]
    for (const [field, value] of checks) {
      if (value !== undefined && !isSafeJsonPath(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['responseMapping', field],
          message: `responseMapping.${String(field)} must be a safe JSONPath (dotted key / numeric index only)`,
        })
      }
    }
  })

// ── Usage + findings ────────────────────────────────────────────────────────────

export const AiUsageEstimateSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number().optional(),
  estCostUsd: z.number().optional(),
  warnings: z.array(z.string()).optional(),
  requiresExplicitWarning: z.boolean().optional(),
})

export const AiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

export const AiModelInfoSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  structuredOutput: z.boolean(),
  recommended: z.boolean().optional(),
  localOnly: z.boolean(),
})

export const AiConnectionTestResultSchema = z.object({
  connectionId: z.string(),
  ok: z.boolean(),
  localOnly: z.boolean(),
  models: z.array(AiModelInfoSchema),
  message: z.string().optional(),
})

export const AiUsageEstimateRequestSchema = z.object({
  connectionId: z.string().min(1),
  kind: AiRequestKindSchema,
  messages: z.array(AiMessageSchema).optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  estimatedInputTokens: z.number().int().min(0).optional(),
  estimatedOutputTokens: z.number().int().min(0).optional(),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const AiReviewFindingSchema = z.object({
  category: AiReviewCategorySchema,
  source: AiFindingSourceSchema,
  confidence: AiConfidenceSchema,
  file: z.string().optional(),
  why: z.string(),
})

// ── Per-feature structured outputs (parsed from adapter responses, fail-closed) ──

export const AiCommitDraftSchema = z.object({
  conventional: z.string(),
  plain: z.string(),
  summary: z.string(),
  body: z.string().optional(),
})

export const AiChangeSummarySchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()),
})

export const AiChangeReviewSchema = z.object({
  findings: z.array(AiReviewFindingSchema),
  overall: z.string().optional(),
})

// ── Derived types (single source of truth = the schema) ─────────────────────────

export type AiConnectionInput = z.input<typeof AiConnectionSchema>
export type AiCredentialMetadataInput = z.input<typeof AiCredentialMetadataSchema>
export type AiProviderDetectionInput = z.input<typeof AiProviderDetectionSchema>
export type CustomHttpMappingInput = z.input<typeof CustomHttpMappingSchema>
export type AiUsageEstimateRequestInput = z.input<typeof AiUsageEstimateRequestSchema>
export type AiConnectionsData = z.infer<typeof AiConnectionsDataSchema>
