import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_PLACEHOLDERS,
  findPlaceholders,
  collectMappingPlaceholders,
  unsupportedPlaceholders,
} from '../../src/core/ai/customHttp'
import { CustomHttpMappingSchema } from '../../src/core/ai/schemas'
import type { CustomHttpMapping } from '../../src/core/ai/types'

const baseMapping: CustomHttpMapping = {
  method: 'POST',
  url: 'https://api.example.com/v1/chat/completions',
  headersTemplate: { Authorization: 'Bearer {{apiKey}}', 'Content-Type': 'application/json' },
  bodyTemplate: { model: '{{model}}', messages: '{{messagesJson}}', temperature: 0.2 },
  responseMapping: {
    text: '$.choices[0].message.content',
    inputTokens: '$.usage.prompt_tokens',
    outputTokens: '$.usage.completion_tokens',
  },
}

describe('placeholder helpers', () => {
  it('exposes the closed supported set (§6.3)', () => {
    expect([...SUPPORTED_PLACEHOLDERS].sort()).toEqual(
      ['apiKey', 'messagesJson', 'metadataJson', 'model', 'promptJson', 'responseSchemaJson'].sort()
    )
  })

  it('finds placeholders in a template string (tolerates inner spaces)', () => {
    expect(findPlaceholders('Bearer {{apiKey}} and {{ model }}')).toEqual(['apiKey', 'model'])
  })

  it('collects placeholders across url, headers, and body', () => {
    const names = new Set(collectMappingPlaceholders(baseMapping))
    expect(names.has('apiKey')).toBe(true)
    expect(names.has('model')).toBe(true)
    expect(names.has('messagesJson')).toBe(true)
  })

  it('flags unsupported placeholders only', () => {
    const evil: CustomHttpMapping = {
      ...baseMapping,
      bodyTemplate: { model: '{{model}}', danger: '{{shell}}', read: '{{readFile}}' },
    }
    expect(unsupportedPlaceholders(baseMapping)).toEqual([])
    expect(unsupportedPlaceholders(evil).sort()).toEqual(['readFile', 'shell'])
  })
})

describe('CustomHttpMappingSchema — boundary validation', () => {
  it('accepts a well-formed mapping', () => {
    expect(CustomHttpMappingSchema.safeParse(baseMapping).success).toBe(true)
  })

  it('accepts a loopback http URL (local server)', () => {
    const local = { ...baseMapping, url: 'http://localhost:1234/v1/chat/completions' }
    expect(CustomHttpMappingSchema.safeParse(local).success).toBe(true)
  })

  it('rejects a non-HTTPS non-loopback URL', () => {
    const bad = { ...baseMapping, url: 'http://api.example.com/v1/chat' }
    const res = CustomHttpMappingSchema.safeParse(bad)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues.some((i) => i.path.includes('url'))).toBe(true)
  })

  it('rejects an unsupported placeholder', () => {
    const bad = { ...baseMapping, bodyTemplate: { model: '{{model}}', x: '{{shell}}' } }
    const res = CustomHttpMappingSchema.safeParse(bad)
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues.some((i) => /shell/.test(i.message))).toBe(true)
  })

  it('rejects mappings that leak the API key outside header values', () => {
    const inUrl = { ...baseMapping, url: 'https://api.example.com/{{apiKey}}/chat' }
    const inBody = { ...baseMapping, bodyTemplate: { apiKey: '{{apiKey}}' } }
    const inHeaderName = {
      ...baseMapping,
      headersTemplate: { '{{apiKey}}': 'not allowed' },
    }

    for (const bad of [inUrl, inBody, inHeaderName]) {
      const res = CustomHttpMappingSchema.safeParse(bad)
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.issues.some((i) => /apiKey/.test(i.message))).toBe(true)
      }
    }
  })

  it('rejects a filter/script/wildcard JSONPath in responseMapping (not silently ignored)', () => {
    for (const text of ['$.choices[*].message.content', '$..content', '$.choices[?(@.x)]']) {
      const bad = { ...baseMapping, responseMapping: { ...baseMapping.responseMapping, text } }
      const res = CustomHttpMappingSchema.safeParse(bad)
      expect(res.success, text).toBe(false)
    }
  })

  it('rejects an unsafe JSONPath in an optional token field', () => {
    const bad = {
      ...baseMapping,
      responseMapping: { text: '$.choices[0].message.content', inputTokens: '$..prompt_tokens' },
    }
    const res = CustomHttpMappingSchema.safeParse(bad)
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'responseMapping.inputTokens')).toBe(
        true
      )
    }
  })

  it('rejects a non-POST method', () => {
    expect(CustomHttpMappingSchema.safeParse({ ...baseMapping, method: 'GET' }).success).toBe(false)
  })
})
