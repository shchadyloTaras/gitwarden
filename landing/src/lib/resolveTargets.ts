/**
 * Pure latest-binary resolver (plan §3). No `fetch`, no framework imports — just data in,
 * data out — so it runs deterministically under plain Vitest and is the logic-first backbone.
 *
 * Turns a GitHub Release payload (or `null`) + a visitor OS into per-OS download targets,
 * matching the canonical asset-name templates from distribution-release-plan.md §3
 * (mirrored in landing-page-plan.md Appendix A) and excluding auto-update sidecars.
 */
import { RELEASES_URL } from './config'
import type { Arch, DownloadTarget, OS, Release, ReleaseAsset, ResolvedTargets } from './types'

interface AssetMatcher {
  os: OS
  role: 'primary' | 'secondary'
  arch?: Arch
  ext: string
  label: string
  /** Anchored pattern from Appendix A — pinned by the contract test. */
  pattern: RegExp
}

/**
 * Asset matchers, primary-before-secondary per OS (the order `all[os]` preserves).
 * Patterns are the contract with Distribution §3 — change them only in lockstep with the
 * `artifactName` templates, and the contract test will hold the line.
 */
const MATCHERS: readonly AssetMatcher[] = [
  {
    os: 'macOS',
    role: 'primary',
    arch: 'arm64',
    ext: '.dmg',
    label: 'macOS · Apple Silicon (arm64)',
    pattern: /^GitWarden-.+-arm64\.dmg$/,
  },
  {
    os: 'macOS',
    role: 'secondary',
    arch: 'x64',
    ext: '.dmg',
    label: 'macOS · Intel (x64)',
    pattern: /^GitWarden-.+-x64\.dmg$/,
  },
  {
    os: 'Windows',
    role: 'primary',
    ext: '.exe',
    label: 'Windows · Installer (.exe)',
    pattern: /^GitWarden-Setup-.+\.exe$/,
  },
  {
    os: 'Linux',
    role: 'primary',
    ext: '.AppImage',
    label: 'Linux · AppImage',
    pattern: /^GitWarden-.+\.AppImage$/,
  },
  {
    os: 'Linux',
    role: 'secondary',
    arch: 'amd64',
    ext: '.deb',
    label: 'Linux · Debian / Ubuntu (.deb)',
    pattern: /^gitwarden_.+_amd64\.deb$/,
  },
]

/** Auto-update sidecars to ignore: `latest*.yml` and `*.blockmap` (plan Appendix A). */
export function isSidecar(filename: string): boolean {
  return /^latest.*\.yml$/i.test(filename) || /\.blockmap$/i.test(filename)
}

function toTarget(matcher: AssetMatcher, asset: ReleaseAsset): DownloadTarget {
  return {
    os: matcher.os,
    ...(matcher.arch ? { arch: matcher.arch } : {}),
    label: matcher.label,
    ext: matcher.ext,
    url: asset.browser_download_url,
    sizeBytes: asset.size,
    filename: asset.name,
  }
}

function matchOne(assets: ReleaseAsset[], matcher: AssetMatcher): DownloadTarget | undefined {
  const asset = assets.find((a) => !isSidecar(a.name) && matcher.pattern.test(a.name))
  return asset ? toTarget(matcher, asset) : undefined
}

const EMPTY_ALL = (): Record<OS, DownloadTarget[]> => ({
  macOS: [],
  Windows: [],
  Linux: [],
  unknown: [],
})

/**
 * Resolve per-OS download targets for a release.
 *
 * Every code path yields either a valid versioned `browser_download_url` or the
 * Releases-page fallback (`releaseUrl`) — never `undefined`/throw to the UI (plan §3).
 *
 * @param release The latest published release, or `null` when the fetch failed / 404 /
 *   no release exists yet. `null` → empty targets + Releases-page fallback.
 * @param os The visitor's detected OS. `unknown` → no primary/secondary (caller shows fallback).
 */
export function resolveTargets(release: Release | null, os: OS): ResolvedTargets {
  const releaseUrl = release?.html_url ?? RELEASES_URL
  const version = release?.tag_name ?? ''
  const assets = release?.assets ?? []

  const all = EMPTY_ALL()
  for (const matcher of MATCHERS) {
    const target = matchOne(assets, matcher)
    if (target) all[matcher.os].push(target)
  }

  let primary: DownloadTarget | undefined
  let secondary: DownloadTarget | undefined
  if (os !== 'unknown') {
    const primaryMatcher = MATCHERS.find((m) => m.os === os && m.role === 'primary')
    const secondaryMatcher = MATCHERS.find((m) => m.os === os && m.role === 'secondary')
    primary = primaryMatcher ? matchOne(assets, primaryMatcher) : undefined
    secondary = secondaryMatcher ? matchOne(assets, secondaryMatcher) : undefined
  }

  return { primary, secondary, all, releaseUrl, version }
}
