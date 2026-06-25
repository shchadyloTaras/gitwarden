// Repo Onboarding — allowlisted file paths for AI context (Phase 36).
// Pure core: no fs reads. Main uses these rules before reading disk.

/** Root-level filenames that may be included in a repo brief. */
export const REPO_BRIEF_ROOT_FILENAME_PATTERNS: RegExp[] = [
  /^README(\.(md|txt|rst))?$/i,
  /^package\.json$/,
  /^pyproject\.toml$/,
  /^Cargo\.toml$/,
  /^go\.mod$/,
  /^Makefile$/,
  /^docker-compose(\.ya?ml)?$/,
  /^tsconfig(\.\w+)?\.json$/,
  /^vite\.config\.(ts|js|mts|mjs|cjs)$/,
  /^\.env\.example$/,
  /^CONTRIBUTING(\.md)?$/i,
  /^justfile$/i,
  /^Gemfile$/,
]

/** Relative paths (from repo root) that may be included. */
export const REPO_BRIEF_RELATIVE_PATHS = ['.github/workflows/ci.yml', '.github/workflows/test.yml']

const MAX_REPO_BRIEF_PATH_DEPTH = 3

/** Reject traversal, absolute paths, and anything outside the allowlist. */
export function isAllowlistedRepoBriefPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) return false
  if (normalized.split('/').some((seg) => seg.startsWith('.git'))) return false
  if (REPO_BRIEF_RELATIVE_PATHS.includes(normalized)) return true
  const depth = normalized.split('/').length
  if (depth > MAX_REPO_BRIEF_PATH_DEPTH) return false
  const basename = normalized.split('/').pop() ?? normalized
  if (depth === 1) {
    return REPO_BRIEF_ROOT_FILENAME_PATTERNS.some((pattern) => pattern.test(basename))
  }
  return false
}

/** Extract npm/yarn/pnpm scripts from package.json text (best-effort). */
export function extractPackageScripts(content: string): Record<string, string> | undefined {
  try {
    const parsed = JSON.parse(content) as { scripts?: unknown }
    if (!parsed.scripts || typeof parsed.scripts !== 'object' || parsed.scripts === null) {
      return undefined
    }
    const scripts: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed.scripts)) {
      if (typeof value === 'string' && value.trim()) scripts[key] = value.trim()
    }
    return Object.keys(scripts).length > 0 ? scripts : undefined
  } catch {
    return undefined
  }
}

/** Heuristic: likely test commands from package scripts (never executed). */
export function inferLikelyTestCommands(scripts?: Record<string, string>): string[] {
  if (!scripts) return []
  const keys = ['test', 'test:unit', 'test:e2e', 'lint', 'check', 'verify']
  const commands: string[] = []
  for (const key of keys) {
    const cmd = scripts[key]
    if (cmd) commands.push(`npm run ${key}`)
  }
  return commands.slice(0, 5)
}

/** Heuristic: likely build commands from package scripts (never executed). */
export function inferLikelyBuildCommands(scripts?: Record<string, string>): string[] {
  if (!scripts) return []
  const keys = ['build', 'dev', 'start', 'compile']
  const commands: string[] = []
  for (const key of keys) {
    const cmd = scripts[key]
    if (cmd) commands.push(`npm run ${key}`)
  }
  return commands.slice(0, 5)
}
