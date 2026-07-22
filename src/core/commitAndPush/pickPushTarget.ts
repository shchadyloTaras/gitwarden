// Pure helper: where Commit & Push will push, decided deterministically. No node/browser globals.

import type { GitRemote } from '../types.js'

export type PushTarget =
  | { kind: 'remote'; remoteName: string; reason: 'upstream' | 'origin' | 'only-remote' }
  | { kind: 'choice-required'; candidates: string[] }
  | { kind: 'none' }

/**
 * Precedence: the upstream branch's remote → `origin` → the sole remote →
 * `choice-required` (multiple remotes, none of the above match) → `none` (no remotes).
 * An upstream naming a remote absent from `remotes` (e.g. a deleted remote) falls
 * through to the next rule rather than failing.
 */
export function pickPushTarget(remotes: GitRemote[], upstream: string | undefined): PushTarget {
  if (remotes.length === 0) return { kind: 'none' }

  if (upstream) {
    const upstreamRemoteName = upstream.split('/')[0]
    const found = remotes.find((r) => r.name === upstreamRemoteName)
    if (found) return { kind: 'remote', remoteName: found.name, reason: 'upstream' }
  }

  const origin = remotes.find((r) => r.name === 'origin')
  if (origin) return { kind: 'remote', remoteName: origin.name, reason: 'origin' }

  if (remotes.length === 1) {
    return { kind: 'remote', remoteName: remotes[0].name, reason: 'only-remote' }
  }

  return { kind: 'choice-required', candidates: remotes.map((r) => r.name) }
}
