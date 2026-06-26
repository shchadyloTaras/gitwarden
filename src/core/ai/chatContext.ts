// Pure helpers for @-mention file context in the advisory chat. No DOM/Electron imports.

/** Filter repo-relative paths for the @-mention picker (case-insensitive substring match). */
export function filterContextFiles(query: string, paths: readonly string[]): string[] {
  const q = query.trim().toLowerCase()
  const sorted = [...paths].sort((a, b) => a.localeCompare(b))
  if (q.length === 0) return sorted.slice(0, 40)
  return sorted.filter((p) => p.toLowerCase().includes(q)).slice(0, 40)
}

/** Return the partial path after a trailing `@` token, or null when not mentioning. */
export function atMentionQuery(input: string): string | null {
  const match = input.match(/(?:^|\s)@([^\s@]*)$/)
  return match?.[1] ?? null
}

/** Dedupe and drop empty path entries before sending to the context builder. */
export function normalizeContextPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of paths) {
    const path = raw.trim()
    if (path.length === 0 || seen.has(path)) continue
    seen.add(path)
    out.push(path)
  }
  return out
}
