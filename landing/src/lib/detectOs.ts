/**
 * Pure OS detection (plan §1 / Appendix C). Detection is **progressive enhancement** — the
 * page is correct without it (the all-downloads panel is always present). Arch is deliberately
 * NOT detected (browsers don't expose it reliably); macOS defaults to arm64 with an Intel link.
 */
import type { OS } from './types'

export interface DetectOsInput {
  /** `navigator.userAgentData?.platform` — most reliable when present. */
  uaDataPlatform?: string | null
  /** `navigator.platform` — legacy fallback. */
  platform?: string | null
  /** `navigator.userAgent` — last-resort parse. */
  userAgent?: string | null
}

/**
 * Map browser platform signals to an OS. Order matters: mobile is rejected before Linux
 * (Android UAs contain "Linux"), and macOS/Darwin is matched before Windows ("Darwin"
 * contains the substring "win").
 */
export function detectOs(input: DetectOsInput): OS {
  const probe = `${input.uaDataPlatform ?? ''} ${input.platform ?? ''} ${input.userAgent ?? ''}`
    .toLowerCase()
    .trim()
  if (!probe) return 'unknown'
  // No desktop build for mobile — fall back to the GitHub Releases page.
  if (/android|iphone|ipad|ipod/.test(probe)) return 'unknown'
  if (/mac|darwin/.test(probe)) return 'macOS'
  if (/win/.test(probe)) return 'Windows'
  if (/linux|x11|ubuntu|debian|fedora/.test(probe)) return 'Linux'
  return 'unknown'
}

/** Browser helper — reads `navigator`; returns `'unknown'` outside a browser (SSR/build). */
export function detectOsFromNavigator(): OS {
  if (typeof navigator === 'undefined') return 'unknown'
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  return detectOs({
    uaDataPlatform: uaData?.platform ?? null,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  })
}
