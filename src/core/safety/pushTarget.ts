// Pure helper: resolve which remote a push will target. No node/browser globals.

import type { GitRemote } from '../types.js'

/**
 * Determine the single remote a push will target, using this precedence:
 *
 * 1. The remote the upstream branch is tracking (derived from `upstream`, which
 *    has the format `remoteName/branchName` from `git status --porcelain=v2`).
 * 2. A remote matching `preferredRemoteName` (default `'origin'`).
 * 3. The sole remote when exactly one exists.
 * 4. `undefined` — ambiguous, cannot determine a target.
 */
export function resolvePushTarget(input: {
  remotes: GitRemote[]
  upstream?: string
  preferredRemoteName?: string
}): GitRemote | undefined {
  const { remotes, upstream, preferredRemoteName = 'origin' } = input

  if (remotes.length === 0) return undefined

  // 1. Upstream's remote wins (format: "remoteName/branchPath")
  if (upstream) {
    const upstreamRemoteName = upstream.split('/')[0]
    const found = remotes.find((r) => r.name === upstreamRemoteName)
    if (found) return found
  }

  // 2. Preferred name fallback
  const preferred = remotes.find((r) => r.name === preferredRemoteName)
  if (preferred) return preferred

  // 3. Sole remote
  if (remotes.length === 1) return remotes[0]

  return undefined
}
