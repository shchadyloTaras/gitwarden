// Agentic Actions — closed allowlist (Phase 39). AI may only propose these operations.

export const AGENTIC_ACTION_ALLOWLIST = [
  'write-repo-file',
  'suggest-navigation',
  'copy-command',
] as const

export type AgenticActionKind = (typeof AGENTIC_ACTION_ALLOWLIST)[number]

export const AGENTIC_NAVIGATION_TARGETS = [
  'commit',
  'status',
  'remote',
  'safety-center',
  'profiles',
  'repositories',
  'settings',
  'history',
] as const

export type AgenticNavigationTarget = (typeof AGENTIC_NAVIGATION_TARGETS)[number]

export function isAllowlistedAgenticAction(kind: string): kind is AgenticActionKind {
  return (AGENTIC_ACTION_ALLOWLIST as readonly string[]).includes(kind)
}

export function isAllowlistedNavigationTarget(target: string): target is AgenticNavigationTarget {
  return (AGENTIC_NAVIGATION_TARGETS as readonly string[]).includes(target)
}

/** Reject paths that touch git metadata or escape the repo root. */
export function assertSafeAgenticRepoPath(relativePath: string): void {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error('Agentic file path must be a safe relative path inside the repository.')
  }
  const segments = normalized.split('/')
  if (segments.some((seg) => seg === '.git' || seg.startsWith('.git'))) {
    throw new Error('Agentic actions cannot modify .git metadata.')
  }
}
