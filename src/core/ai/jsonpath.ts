// Safe JSONPath subset — pure core (Phase 28). No node/electron/DOM imports.
//
// Custom HTTP response mapping (§6.3) must NOT be able to evaluate code. This is
// a deliberately tiny navigator that supports ONLY:
//
//   - a leading `$` root
//   - dotted keys:        `.choices`, `.message`, `.content`
//   - numeric indices:    `[0]`, `[12]`
//   - bracket-quoted keys: `['prompt_tokens']`, `["completion_tokens"]`
//
// Anything else — recursive descent (`..`), wildcards (`*`, `[*]`), filter
// expressions (`?(…)`), script expressions (`[(…)]`), unions, slices — is
// REJECTED, not silently ignored. The parser cannot evaluate arbitrary code.

export type JsonPathSegment = { type: 'key'; key: string } | { type: 'index'; index: number }

// Each alternative consumes exactly one safe segment from the front of the path.
// Identifiers (dotted and bracket-quoted) are restricted to [A-Za-z0-9_].
const SEGMENT_RE =
  /^(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]|\['([A-Za-z_][A-Za-z0-9_]*)'\]|\["([A-Za-z_][A-Za-z0-9_]*)"\])/

export class UnsafeJsonPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeJsonPathError'
  }
}

/**
 * Parse a path in the safe subset into segments, or throw `UnsafeJsonPathError`.
 * Throwing (not ignoring) is the contract: an unsafe expression must be a hard
 * validation failure.
 */
export function parseJsonPath(path: string): JsonPathSegment[] {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new UnsafeJsonPathError('JSONPath must be a non-empty string')
  }
  let rest = path.trim()
  if (!rest.startsWith('$')) {
    throw new UnsafeJsonPathError('JSONPath must start with `$`')
  }
  rest = rest.slice(1)

  const segments: JsonPathSegment[] = []
  while (rest.length > 0) {
    const m = SEGMENT_RE.exec(rest)
    if (!m) {
      throw new UnsafeJsonPathError(`Unsafe or invalid JSONPath segment near: "${rest}"`)
    }
    if (m[1] !== undefined) segments.push({ type: 'key', key: m[1] })
    else if (m[2] !== undefined) segments.push({ type: 'index', index: Number(m[2]) })
    else if (m[3] !== undefined) segments.push({ type: 'key', key: m[3] })
    else segments.push({ type: 'key', key: m[4] })
    rest = rest.slice(m[0].length)
  }

  if (segments.length === 0) {
    throw new UnsafeJsonPathError('JSONPath has no navigable segments')
  }
  return segments
}

/** True when `path` is in the safe subset (parses without throwing). */
export function isSafeJsonPath(path: string): boolean {
  try {
    parseJsonPath(path)
    return true
  } catch {
    return false
  }
}

/**
 * Navigate `root` by a safe-subset path, returning the value or `undefined` if
 * any segment is missing / type-mismatched. Throws `UnsafeJsonPathError` only if
 * the path itself is unsafe/invalid. Performs pure property access — no eval.
 */
export function getByJsonPath(root: unknown, path: string): unknown {
  const segments = parseJsonPath(path)
  let cur: unknown = root
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined
    if (seg.type === 'key') {
      if (typeof cur !== 'object' || Array.isArray(cur)) return undefined
      cur = (cur as Record<string, unknown>)[seg.key]
    } else {
      if (!Array.isArray(cur)) return undefined
      cur = (cur as unknown[])[seg.index]
    }
  }
  return cur
}
