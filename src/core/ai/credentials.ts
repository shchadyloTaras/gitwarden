// Credential masking — pure core (Phase 28). No node/electron/DOM imports.
//
// Builds the `maskedPreview` shown in `AiCredentialMetadata`. The raw secret
// never leaves the main process after save; the renderer only ever sees this
// masked form. Deterministic and lossy by construction — it reveals at most the
// last 4 characters and never the full length precisely.

const REVEAL = 4
const BULLET = '•'

/**
 * Mask a secret for display: a fixed run of bullets followed by the last 4
 * characters. Short secrets (≤ 4 chars) are fully masked so nothing is revealed.
 * e.g. `sk-or-v1-0a1b2c3d` → `••••c3d` … (`••••` + `c3d` style, never the raw key).
 */
export function maskSecret(secret: string): string {
  const trimmed = secret ?? ''
  if (trimmed.length <= REVEAL) return BULLET.repeat(Math.max(trimmed.length, REVEAL))
  return BULLET.repeat(REVEAL) + trimmed.slice(-REVEAL)
}
