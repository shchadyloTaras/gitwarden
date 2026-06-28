// Minimal SemVer precedence — enough to answer "is the published release newer than the one
// running?" without a dependency. Implements the SemVer 2.0 precedence rules we actually hit:
// numeric major.minor.patch, optional dot-separated pre-release identifiers (numeric compared
// numerically, alphanumeric lexically, numeric < alphanumeric, more identifiers win ties), and
// build metadata (after "+") ignored for precedence. Pure — safe under Vitest.

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  /** Dot-separated pre-release identifiers (empty for a normal release). */
  prerelease: string[]
}

/**
 * Parse "v1.2.3", "1.2.3-beta.1", "1.2" etc. into a {@link ParsedVersion}. A leading "v"/"V"
 * and "+build" metadata are stripped; missing minor/patch default to 0. Returns null when the
 * core is not a dotted run of integers, so callers can treat garbage as "not comparable".
 */
export function parseVersion(raw: string): ParsedVersion | null {
  if (typeof raw !== 'string') return null
  let text = raw.trim()
  if (text.startsWith('v') || text.startsWith('V')) text = text.slice(1)
  if (text === '') return null

  // Drop build metadata, then split off the pre-release tail.
  const [withoutBuild = ''] = text.split('+')
  const dashIndex = withoutBuild.indexOf('-')
  const core = dashIndex === -1 ? withoutBuild : withoutBuild.slice(0, dashIndex)
  const prereleaseRaw = dashIndex === -1 ? '' : withoutBuild.slice(dashIndex + 1)

  const parts = core.split('.')
  if (parts.length > 3) return null
  const nums: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    nums.push(Number(part))
  }

  // A dash with no identifiers (e.g. "1.0.0-") is malformed, distinct from "no pre-release".
  if (dashIndex !== -1 && prereleaseRaw === '') return null
  const prerelease = prereleaseRaw === '' ? [] : prereleaseRaw.split('.')
  // An empty identifier within the list (e.g. "1.0.0-a..b" or "1.0.0-beta.") is malformed.
  if (prerelease.some((id) => id === '')) return null

  return {
    major: nums[0] ?? 0,
    minor: nums[1] ?? 0,
    patch: nums[2] ?? 0,
    prerelease,
  }
}

/** Compare two SemVer strings. Returns 1 if a > b, -1 if a < b, 0 if equal/incomparable. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return 0

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] > pb[key]) return 1
    if (pa[key] < pb[key]) return -1
  }
  return comparePrerelease(pa.prerelease, pb.prerelease)
}

/** True when `candidate` is a strictly newer release than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) === 1
}

/**
 * SemVer pre-release precedence: a version WITH a pre-release ranks below the same core version
 * without one; otherwise compare identifiers left-to-right (numeric < alphanumeric, numbers
 * numerically, strings lexically), and a longer identifier list wins when all shared ones tie.
 */
function comparePrerelease(a: string[], b: string[]): -1 | 0 | 1 {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1 // a is a full release, b is a pre-release → a is greater
  if (b.length === 0) return -1

  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const cmp = compareIdentifier(a[i], b[i])
    if (cmp !== 0) return cmp
  }
  if (a.length > b.length) return 1
  if (a.length < b.length) return -1
  return 0
}

function compareIdentifier(a: string, b: string): -1 | 0 | 1 {
  const aNum = /^\d+$/.test(a)
  const bNum = /^\d+$/.test(b)
  if (aNum && bNum) {
    const na = Number(a)
    const nb = Number(b)
    return na > nb ? 1 : na < nb ? -1 : 0
  }
  if (aNum) return -1 // numeric identifiers have lower precedence than alphanumeric
  if (bNum) return 1
  return a > b ? 1 : a < b ? -1 : 0
}
