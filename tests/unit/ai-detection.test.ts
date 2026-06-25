import { describe, it, expect } from 'vitest'
import {
  detectProvider,
  requiresBaseUrlEntry,
  PROVIDER_BASE_URLS,
} from '../../src/core/ai/detection.js'
import { isAiSendAllowed } from '../../src/core/ai/precedence.js'

describe('detectProvider — key-prefix progressive disclosure (§6.2)', () => {
  it('sk-or- → OpenRouter, high, zero extra fields', () => {
    const d = detectProvider('sk-or-v1-0a1b2c3d4e5f')
    expect(d.kind).toBe('openrouter')
    expect(d.confidence).toBe('high')
    expect(requiresBaseUrlEntry(d)).toBe(false)
  })

  it('sk-ant- → Anthropic, high, zero extra fields (no base URL)', () => {
    const d = detectProvider('sk-ant-api03-XXXX')
    expect(d.kind).toBe('anthropic')
    expect(d.confidence).toBe('high')
    expect(d.suggestedBaseUrl).toBeUndefined()
    expect(requiresBaseUrlEntry(d)).toBe(false)
  })

  it('gsk_ → Groq via openai-compatible, high, zero extra fields (known endpoint)', () => {
    const d = detectProvider('gsk_abcDEF123456')
    expect(d.kind).toBe('openai-compatible')
    expect(d.confidence).toBe('high')
    expect(d.suggestedBaseUrl).toBe(PROVIDER_BASE_URLS.groq)
    // Remote https endpoint we know → no field shown.
    expect(requiresBaseUrlEntry(d)).toBe(false)
  })

  it('sk-lm- → LM Studio via openai-compatible, base URL pre-filled with the local port', () => {
    const d = detectProvider('sk-lm-localmodelkey')
    expect(d.kind).toBe('openai-compatible')
    expect(d.confidence).toBe('high')
    expect(d.suggestedBaseUrl).toBe('http://localhost:1234/v1')
    // Loopback → user confirms the port → field shown.
    expect(requiresBaseUrlEntry(d)).toBe(true)
  })

  it('bare sk- → ambiguous openai-compatible, medium, prompts for base URL (OpenAI default)', () => {
    const d = detectProvider('sk-0123456789abcdef')
    expect(d.kind).toBe('openai-compatible')
    expect(d.confidence).toBe('medium')
    expect(d.suggestedBaseUrl).toBe(PROVIDER_BASE_URLS.openai)
    expect(requiresBaseUrlEntry(d)).toBe(true)
  })

  it('sk-proj- → ambiguous openai-compatible, medium, prompts for base URL', () => {
    const d = detectProvider('sk-proj-abcDEF123')
    expect(d.kind).toBe('openai-compatible')
    expect(d.confidence).toBe('medium')
    expect(requiresBaseUrlEntry(d)).toBe(true)
  })

  it('unknown prefix → unknown, low, routed to Advanced (no base URL field)', () => {
    const d = detectProvider('totally-made-up-key')
    expect(d.kind).toBe('unknown')
    expect(d.confidence).toBe('low')
    expect(requiresBaseUrlEntry(d)).toBe(false)
  })

  it('trims surrounding whitespace before detecting', () => {
    expect(detectProvider('   sk-or-trimmed  ').kind).toBe('openrouter')
  })

  it('checks specific prefixes before the bare sk- fallback', () => {
    // sk-ant-/sk-lm- must not be misread as the ambiguous bare-sk case.
    expect(detectProvider('sk-ant-x').kind).toBe('anthropic')
    expect(detectProvider('sk-ant-x').confidence).toBe('high')
    expect(detectProvider('sk-lm-x').suggestedBaseUrl).toBe('http://localhost:1234/v1')
  })
})

describe('isAiSendAllowed — precedence floor (repo → global → connection)', () => {
  it('blocks everything when global AI is disabled (default-off)', () => {
    expect(
      isAiSendAllowed({ repoOverride: undefined, globalEnabled: false, connectionEnabled: true })
    ).toBe(false)
  })

  it('a repo opt-out wins even with global on and connection enabled', () => {
    expect(
      isAiSendAllowed({ repoOverride: false, globalEnabled: true, connectionEnabled: true })
    ).toBe(false)
  })

  it('a per-repo opt-in never bypasses the global consent', () => {
    expect(
      isAiSendAllowed({ repoOverride: true, globalEnabled: false, connectionEnabled: true })
    ).toBe(false)
  })

  it('allows a send only when global + connection are on (and repo not opted out)', () => {
    expect(
      isAiSendAllowed({ repoOverride: undefined, globalEnabled: true, connectionEnabled: true })
    ).toBe(true)
    expect(
      isAiSendAllowed({ repoOverride: true, globalEnabled: true, connectionEnabled: true })
    ).toBe(true)
  })

  it('a disabled connection blocks the send', () => {
    expect(
      isAiSendAllowed({ repoOverride: undefined, globalEnabled: true, connectionEnabled: false })
    ).toBe(false)
  })
})
