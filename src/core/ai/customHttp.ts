// Custom HTTP placeholders — pure core (Phase 28). No node/electron/DOM imports.
//
// The Custom HTTP mapping (§6.3) is declarative: the only dynamic values that may
// appear in the URL, header values, or body template are the fixed placeholders
// below. Anything else (e.g. `{{shell}}`, `{{readFile}}`, `{{env}}`) is an
// unsupported placeholder and must be REJECTED — there is no JS evaluation, file
// read, or shell. Validation of a whole mapping lives in `./schemas`
// (`CustomHttpMappingSchema`); these helpers are the shared primitives.

import type { CustomHttpMapping } from './types.js'

/** The complete, closed set of placeholders Custom HTTP may interpolate (§6.3). */
export const SUPPORTED_PLACEHOLDERS = [
  'apiKey',
  'model',
  'messagesJson',
  'promptJson',
  'responseSchemaJson',
  'metadataJson',
] as const

export type SupportedPlaceholder = (typeof SUPPORTED_PLACEHOLDERS)[number]

const SUPPORTED_SET = new Set<string>(SUPPORTED_PLACEHOLDERS)

// `{{ name }}` — tolerant of inner whitespace; name is a simple identifier.
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

export function isSupportedPlaceholder(name: string): boolean {
  return SUPPORTED_SET.has(name)
}

/** Every placeholder name referenced in a single template string, in order. */
export function findPlaceholders(template: string): string[] {
  const names: string[] = []
  for (const m of template.matchAll(PLACEHOLDER_RE)) names.push(m[1])
  return names
}

/**
 * Collect every placeholder name referenced anywhere in a mapping — the URL,
 * each header key and value, and the JSON-serialized body template.
 */
export function collectMappingPlaceholders(mapping: CustomHttpMapping): string[] {
  const names: string[] = []
  names.push(...findPlaceholders(mapping.url))
  for (const [key, value] of Object.entries(mapping.headersTemplate)) {
    names.push(...findPlaceholders(key))
    names.push(...findPlaceholders(value))
  }
  // Body may be any JSON value; scan its serialized form so nested placeholders count.
  if (mapping.bodyTemplate !== undefined) {
    names.push(...findPlaceholders(JSON.stringify(mapping.bodyTemplate) ?? ''))
  }
  return names
}

/** The unsupported placeholder names a mapping references (empty ⇒ all supported). */
export function unsupportedPlaceholders(mapping: CustomHttpMapping): string[] {
  return [...new Set(collectMappingPlaceholders(mapping).filter((n) => !isSupportedPlaceholder(n)))]
}
