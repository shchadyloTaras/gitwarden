// Provider auto-detection from an API-key prefix — pure core (Phase 29).
// No node/electron/DOM imports.
//
// This drives the token-first progressive disclosure of §1/§6.2: paste a key,
// GitWarden guesses the provider, and asks for AT MOST one more thing (a base
// URL) only when the prefix is ambiguous or the endpoint is user-configurable.
//
// Detection is UX, NOT a security boundary: a forged prefix only changes which
// adapter we *try* — it grants nothing (§6.2). The renderer receives only the
// resulting `AiProviderDetection` (plus a masked key label computed in main),
// never the raw key.

import type { AiProviderDetection } from './types.js'
import { isLoopbackUrl } from './transport.js'

/** Known endpoints used for pre-fill / suggestion. Non-secret; safe to surface. */
export const PROVIDER_BASE_URLS = {
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  lmStudio: 'http://localhost:1234/v1',
  openai: 'https://api.openai.com/v1',
} as const

/**
 * Detect the provider from an API key's prefix. The most specific prefixes are
 * checked before the bare `sk-` fallback so `sk-or-` / `sk-ant-` / `sk-lm-` are
 * never misread as ambiguous OpenAI. See §6.2 for the full table.
 *
 * - `sk-or-`  → OpenRouter (high)            — zero extra fields
 * - `sk-ant-` → Anthropic (high)             — zero extra fields
 * - `gsk_`    → Groq via openai-compatible (high) — zero extra fields (known endpoint)
 * - `sk-lm-`  → LM Studio via openai-compatible (high) — one base URL field, pre-filled
 * - `sk-` / `sk-proj-` → ambiguous openai-compatible (medium) — one base URL field, OpenAI default
 * - anything else → unknown (low) — fall through to Advanced / Custom HTTP
 */
export function detectProvider(apiKey: string): AiProviderDetection {
  const key = apiKey.trim()

  if (key.startsWith('sk-or-')) {
    return {
      kind: 'openrouter',
      confidence: 'high',
      reason: 'The "sk-or-" prefix identifies an OpenRouter key.',
      suggestedBaseUrl: PROVIDER_BASE_URLS.openrouter,
    }
  }

  if (key.startsWith('sk-ant-')) {
    return {
      kind: 'anthropic',
      confidence: 'high',
      reason: 'The "sk-ant-" prefix identifies an Anthropic key.',
    }
  }

  if (key.startsWith('gsk_')) {
    return {
      kind: 'openai-compatible',
      confidence: 'high',
      reason: 'The "gsk_" prefix identifies a Groq key (OpenAI-compatible API).',
      suggestedBaseUrl: PROVIDER_BASE_URLS.groq,
    }
  }

  if (key.startsWith('sk-lm-')) {
    return {
      kind: 'openai-compatible',
      confidence: 'high',
      reason: 'The "sk-lm-" prefix identifies LM Studio (local OpenAI-compatible server).',
      suggestedBaseUrl: PROVIDER_BASE_URLS.lmStudio,
    }
  }

  if (key.startsWith('sk-proj-') || key.startsWith('sk-')) {
    return {
      kind: 'openai-compatible',
      confidence: 'medium',
      reason:
        'A bare "sk-"/"sk-proj-" key is OpenAI-compatible but shared by several providers — confirm the base URL.',
      suggestedBaseUrl: PROVIDER_BASE_URLS.openai,
    }
  }

  return {
    kind: 'unknown',
    confidence: 'low',
    reason: 'Unrecognized key prefix — set this up under Advanced / Custom HTTP.',
  }
}

/**
 * Progressive-disclosure rule: should the UI show ONE base-URL field for this
 * detection? (§1) — true only when the user must enter or confirm the endpoint:
 *
 * - ambiguous keys (medium confidence) → prompt for the base URL;
 * - a local server whose suggested URL is loopback (LM Studio) → confirm the
 *   port, which is user-configurable;
 * - everything else (high-confidence remote provider, or unknown → Advanced) →
 *   no field.
 *
 * Derived purely from the detection object, so the renderer (which only receives
 * `AiProviderDetection`) can call it without any extra data.
 */
export function requiresBaseUrlEntry(detection: AiProviderDetection): boolean {
  if (detection.kind === 'unknown') return false
  if (detection.confidence === 'medium') return true
  if (detection.suggestedBaseUrl !== undefined && isLoopbackUrl(detection.suggestedBaseUrl)) {
    return true
  }
  return false
}
