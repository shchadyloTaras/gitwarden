import { describe, it, expect } from 'vitest'
import {
  AiConnectionCreatePayload,
  AiConnectionUpdatePayload,
  AiSetActiveConnectionPayload,
  AiSaveCredentialPayload,
  AiCredentialConnectionPayload,
  AiDetectProviderPayload,
  AiTestConnectionPayload,
  AiListModelsPayload,
  AiEstimateUsagePayload,
  AiCancelPayload,
} from '../../src/main/ipc/ipc-schemas.js'

describe('AI IPC payload validation (Zod boundary)', () => {
  describe('AiConnectionCreatePayload', () => {
    it('accepts a valid connection', () => {
      expect(
        AiConnectionCreatePayload.safeParse({
          name: 'OpenRouter',
          kind: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
        }).success
      ).toBe(true)
    })

    it('accepts a loopback http base URL', () => {
      expect(
        AiConnectionCreatePayload.safeParse({
          name: 'LM Studio',
          kind: 'openai-compatible',
          baseUrl: 'http://localhost:1234/v1',
        }).success
      ).toBe(true)
    })

    it('rejects a missing name', () => {
      expect(AiConnectionCreatePayload.safeParse({ kind: 'openrouter' }).success).toBe(false)
    })

    it('rejects an unknown kind', () => {
      expect(AiConnectionCreatePayload.safeParse({ name: 'x', kind: 'gemini' }).success).toBe(false)
    })

    it('rejects a non-https non-loopback base URL (transport gate)', () => {
      const res = AiConnectionCreatePayload.safeParse({
        name: 'x',
        kind: 'openai-compatible',
        baseUrl: 'http://api.example.com/v1',
      })
      expect(res.success).toBe(false)
      if (!res.success) expect(res.error.issues.some((i) => i.path.includes('baseUrl'))).toBe(true)
    })

    it('rejects an invalid privacyMode / retention', () => {
      expect(
        AiConnectionCreatePayload.safeParse({
          name: 'x',
          kind: 'openrouter',
          privacyMode: 'always',
        }).success
      ).toBe(false)
      expect(
        AiConnectionCreatePayload.safeParse({ name: 'x', kind: 'openrouter', retention: 'maybe' })
          .success
      ).toBe(false)
    })
  })

  describe('AiConnectionUpdatePayload', () => {
    it('accepts an id + partial patch', () => {
      expect(
        AiConnectionUpdatePayload.safeParse({ id: 'ai-1', patch: { enabled: false } }).success
      ).toBe(true)
    })

    it('rejects a missing id', () => {
      expect(AiConnectionUpdatePayload.safeParse({ patch: { enabled: false } }).success).toBe(false)
    })

    it('rejects a patch with a bad base URL', () => {
      expect(
        AiConnectionUpdatePayload.safeParse({
          id: 'ai-1',
          patch: { baseUrl: 'http://evil.example.com' },
        }).success
      ).toBe(false)
    })
  })

  describe('AiSetActiveConnectionPayload', () => {
    it('accepts an id or null', () => {
      expect(AiSetActiveConnectionPayload.safeParse({ id: 'ai-1' }).success).toBe(true)
      expect(AiSetActiveConnectionPayload.safeParse({ id: null }).success).toBe(true)
    })

    it('rejects an empty-string id', () => {
      expect(AiSetActiveConnectionPayload.safeParse({ id: '' }).success).toBe(false)
    })
  })

  describe('AiSaveCredentialPayload', () => {
    it('accepts a connectionId + label + non-empty secrets', () => {
      expect(
        AiSaveCredentialPayload.safeParse({
          connectionId: 'ai-1',
          label: 'OpenRouter key',
          secrets: { apiKey: 'sk-or-x' },
        }).success
      ).toBe(true)
    })

    it('rejects an empty secrets map', () => {
      expect(
        AiSaveCredentialPayload.safeParse({ connectionId: 'ai-1', label: 'x', secrets: {} }).success
      ).toBe(false)
    })

    it('rejects an empty secret value', () => {
      expect(
        AiSaveCredentialPayload.safeParse({
          connectionId: 'ai-1',
          label: 'x',
          secrets: { apiKey: '' },
        }).success
      ).toBe(false)
    })

    it('rejects a missing connectionId / label', () => {
      expect(
        AiSaveCredentialPayload.safeParse({ label: 'x', secrets: { apiKey: 'k' } }).success
      ).toBe(false)
      expect(
        AiSaveCredentialPayload.safeParse({ connectionId: 'ai-1', secrets: { apiKey: 'k' } })
          .success
      ).toBe(false)
    })
  })

  describe('AiCredentialConnectionPayload / AiDetectProviderPayload', () => {
    it('require their non-empty fields', () => {
      expect(AiCredentialConnectionPayload.safeParse({ connectionId: 'ai-1' }).success).toBe(true)
      expect(AiCredentialConnectionPayload.safeParse({ connectionId: '' }).success).toBe(false)
      expect(AiDetectProviderPayload.safeParse({ apiKey: 'sk-or-x' }).success).toBe(true)
      expect(AiDetectProviderPayload.safeParse({ apiKey: '' }).success).toBe(false)
      expect(AiDetectProviderPayload.safeParse({}).success).toBe(false)
    })
  })

  describe('Phase 30 adapter payloads', () => {
    it('validates testConnection/listModels/cancel payloads', () => {
      expect(AiTestConnectionPayload.safeParse({ connectionId: 'ai-1' }).success).toBe(true)
      expect(AiListModelsPayload.safeParse({ connectionId: 'ai-1' }).success).toBe(true)
      expect(AiCancelPayload.safeParse({ requestId: 'req-1' }).success).toBe(true)
      expect(AiTestConnectionPayload.safeParse({ connectionId: '' }).success).toBe(false)
      expect(AiCancelPayload.safeParse({ requestId: '' }).success).toBe(false)
    })

    it('validates estimateUsage payloads with messages and caps', () => {
      expect(
        AiEstimateUsagePayload.safeParse({
          connectionId: 'ai-1',
          kind: 'change-summary',
          messages: [{ role: 'user', content: 'hello' }],
          maxOutputTokens: 500,
        }).success
      ).toBe(true)
      expect(
        AiEstimateUsagePayload.safeParse({
          connectionId: 'ai-1',
          kind: 'not-a-kind',
          messages: [{ role: 'developer', content: 'hello' }],
        }).success
      ).toBe(false)
    })
  })
})
