import { describe, it, expect } from 'vitest'
import {
  AiConnectionSchema,
  AiConnectionsDataSchema,
  AiConnectionKindSchema,
  AiPrivacyModeSchema,
  AiRetentionStateSchema,
  AiRequestKindSchema,
  AiCredentialMetadataSchema,
  AiProviderDetectionSchema,
  AiUsageEstimateSchema,
  AiReviewFindingSchema,
  AiCommitDraftSchema,
  AiChangeSummarySchema,
  AiChangeReviewSchema,
} from '../../src/core/ai/schemas'

const fullConnection = {
  id: 'ai-1',
  name: 'OpenRouter',
  kind: 'openrouter' as const,
  enabled: true,
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'anthropic/claude-3.5-sonnet',
  privacyMode: 'preview-each' as const,
  retention: 'zero-retention' as const,
  capabilities: {
    structuredOutput: true,
    streaming: true,
    modelList: true,
    usage: true,
    localOnly: false,
  },
  createdAt: '2026-06-25T10:00:00.000Z',
  updatedAt: '2026-06-25T10:00:00.000Z',
}

describe('AiConnection round-trip', () => {
  it('parses a full connection and round-trips through JSON', () => {
    const parsed = AiConnectionSchema.parse(fullConnection)
    expect(parsed).toEqual(fullConnection)
    const reparsed = AiConnectionSchema.parse(JSON.parse(JSON.stringify(parsed)))
    expect(reparsed).toEqual(fullConnection)
  })

  it('parses a minimal local connection (no baseUrl secret, optionals absent)', () => {
    const minimal = {
      id: 'ai-2',
      name: 'Local',
      kind: 'ollama' as const,
      enabled: false,
      privacyMode: 'off' as const,
      retention: 'unknown' as const,
      capabilities: {
        structuredOutput: true,
        streaming: false,
        modelList: true,
        usage: false,
        localOnly: true,
      },
      createdAt: '2026-06-25T10:00:00.000Z',
      updatedAt: '2026-06-25T10:00:00.000Z',
    }
    const parsed = AiConnectionSchema.parse(minimal)
    expect(parsed.baseUrl).toBeUndefined()
    expect(parsed.defaultModel).toBeUndefined()
  })

  it('has NO secret field — adding an apiKey is stripped, never persisted', () => {
    const withSecret = { ...fullConnection, apiKey: 'sk-or-v1-should-not-persist' }
    const parsed = AiConnectionSchema.parse(withSecret)
    expect('apiKey' in parsed).toBe(false)
  })

  it('accepts a loopback http baseUrl', () => {
    const local = { ...fullConnection, baseUrl: 'http://localhost:1234/v1' }
    expect(AiConnectionSchema.safeParse(local).success).toBe(true)
  })

  it('rejects a non-HTTPS non-loopback baseUrl (transport gate, §3)', () => {
    const bad = { ...fullConnection, baseUrl: 'http://api.openrouter.ai/api/v1' }
    const res = AiConnectionSchema.safeParse(bad)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues.some((i) => i.path.includes('baseUrl'))).toBe(true)
  })

  it('rejects an unknown kind / privacyMode / retention', () => {
    expect(AiConnectionSchema.safeParse({ ...fullConnection, kind: 'gemini' }).success).toBe(false)
    expect(AiConnectionSchema.safeParse({ ...fullConnection, privacyMode: 'always' }).success).toBe(
      false
    )
    expect(AiConnectionSchema.safeParse({ ...fullConnection, retention: 'maybe' }).success).toBe(
      false
    )
  })

  it('validates a connections list wrapper', () => {
    const data = { connections: [fullConnection] }
    expect(AiConnectionsDataSchema.parse(data).connections).toHaveLength(1)
  })
})

describe('enums', () => {
  it('AiConnectionKind covers all kinds and rejects unknown', () => {
    for (const k of ['openrouter', 'openai-compatible', 'anthropic', 'ollama', 'custom-http']) {
      expect(AiConnectionKindSchema.parse(k)).toBe(k)
    }
    expect(() => AiConnectionKindSchema.parse('gemini')).toThrow()
  })

  it('AiPrivacyMode default semantics: preview-each is valid; off and downgrade too', () => {
    for (const m of ['off', 'preview-each', 'preview-first-run']) {
      expect(AiPrivacyModeSchema.parse(m)).toBe(m)
    }
  })

  it('AiRetentionState + AiRequestKind enums', () => {
    for (const r of ['zero-retention', 'unknown', 'user-accepted']) {
      expect(AiRetentionStateSchema.parse(r)).toBe(r)
    }
    for (const k of [
      'commit-draft',
      'change-summary',
      'change-review',
      'safety-explain',
      'push-brief',
      'history-summary',
      'repo-brief',
      'failure-explain',
    ]) {
      expect(AiRequestKindSchema.parse(k)).toBe(k)
    }
  })
})

describe('AiCredentialMetadata — renderer-facing, no raw secret', () => {
  it('round-trips metadata (masked preview, not the secret)', () => {
    const meta = {
      connectionId: 'ai-1',
      label: 'OpenRouter key',
      maskedPreview: '••••0123',
      secretFields: ['apiKey'],
      updatedAt: '2026-06-25T10:00:00.000Z',
    }
    expect(AiCredentialMetadataSchema.parse(meta)).toEqual(meta)
  })
})

describe('AiProviderDetection', () => {
  it('accepts a detected kind and the unknown fallback', () => {
    expect(
      AiProviderDetectionSchema.parse({
        kind: 'openrouter',
        confidence: 'high',
        reason: 'sk-or- prefix',
      }).kind
    ).toBe('openrouter')
    expect(
      AiProviderDetectionSchema.parse({
        kind: 'unknown',
        confidence: 'low',
        reason: 'unrecognized prefix',
        suggestedBaseUrl: 'https://api.openai.com/v1',
      }).kind
    ).toBe('unknown')
  })

  it('rejects an invalid confidence', () => {
    expect(
      AiProviderDetectionSchema.safeParse({ kind: 'anthropic', confidence: 'certain', reason: 'x' })
        .success
    ).toBe(false)
  })
})

describe('AiUsageEstimate + AiReviewFinding', () => {
  it('parses a usage estimate (optionals absent)', () => {
    expect(AiUsageEstimateSchema.parse({ inputTokens: 1200 }).inputTokens).toBe(1200)
  })

  it('parses a review finding with source + confidence', () => {
    const finding = {
      category: 'secret-like' as const,
      source: 'deterministic' as const,
      confidence: 'high' as const,
      file: '.env',
      why: 'Looks like an API key',
    }
    expect(AiReviewFindingSchema.parse(finding)).toEqual(finding)
  })

  it('rejects an unknown finding category/source', () => {
    expect(
      AiReviewFindingSchema.safeParse({
        category: 'typo',
        source: 'ai',
        confidence: 'low',
        why: 'x',
      }).success
    ).toBe(false)
    expect(
      AiReviewFindingSchema.safeParse({
        category: 'lockfile',
        source: 'guess',
        confidence: 'low',
        why: 'x',
      }).success
    ).toBe(false)
  })
})

describe('per-feature structured outputs (fail-closed parsing)', () => {
  it('AiCommitDraft requires conventional/plain/summary, body optional', () => {
    const draft = {
      conventional: 'feat(core): add AI contracts',
      plain: 'Add AI connection contracts',
      summary: 'Introduces pure-core AI types and schemas.',
    }
    expect(AiCommitDraftSchema.parse(draft).body).toBeUndefined()
    expect(AiCommitDraftSchema.safeParse({ conventional: 'x', plain: 'y' }).success).toBe(false)
  })

  it('AiChangeSummary requires summary + highlights array', () => {
    expect(
      AiChangeSummarySchema.parse({ summary: 's', highlights: ['a', 'b'] }).highlights
    ).toHaveLength(2)
    expect(AiChangeSummarySchema.safeParse({ summary: 's' }).success).toBe(false)
  })

  it('AiChangeReview wraps findings and rejects a malformed finding', () => {
    const review = {
      findings: [
        { category: 'migration', source: 'ai', confidence: 'medium', why: 'schema change' },
      ],
      overall: 'Looks mostly safe.',
    }
    expect(AiChangeReviewSchema.parse(review).findings).toHaveLength(1)
    expect(AiChangeReviewSchema.safeParse({ findings: [{ category: 'migration' }] }).success).toBe(
      false
    )
  })
})
