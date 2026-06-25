// AI enablement precedence — pure core (Phase 29). No node/electron/DOM imports.
//
// Three flags decide whether ANY repo context may be sent to a provider, with a
// fixed, one-directional precedence (§3, §4):
//
//     per-repo override → global enable → connection.enabled
//
// This module ships the conservative, consent-respecting FLOOR that Phase 29
// needs to prove "saving a connection with AI still disabled sends nothing".
// The full precedence matrix and its enforcement at context-assembly time are
// finalized in Phase 31 — this helper must never *widen* what that phase allows.

export interface AiEnablementFlags {
  /** Per-repo override: `true` force-on, `false` force-off, `undefined` inherit. */
  repoOverride?: boolean
  /** The global "Enable AI" consent toggle (default-off). */
  globalEnabled: boolean
  /** The connection-level flag — the weakest in the chain. */
  connectionEnabled: boolean
}

/**
 * Is a send permitted under the current flags? Opt-out always wins and global
 * consent is required:
 *
 * - a repo opted OUT (`repoOverride === false`) blocks everything (§4);
 * - the global "Enable AI" consent must be on — a per-repo opt-IN never bypasses
 *   it, because enabling AI is the privacy consent (kept separate on purpose);
 * - the connection itself must be enabled.
 *
 * Default-off falls straight out: with `globalEnabled` false, this is always
 * false no matter how the connection or repo is configured.
 */
export function isAiSendAllowed(flags: AiEnablementFlags): boolean {
  if (flags.repoOverride === false) return false
  if (!flags.globalEnabled) return false
  if (!flags.connectionEnabled) return false
  return true
}
