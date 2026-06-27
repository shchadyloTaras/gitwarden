/**
 * Shared types for release resolution (plan §3, Appendix A/D).
 *
 * `Release` / `ReleaseAsset` model the trimmed shape of GitHub's
 * `GET /repos/{owner}/{repo}/releases/latest` response that the resolver consumes.
 */

/** Visitor operating system, as detected from the browser (Phase 48) or chosen explicitly. */
export type OS = 'macOS' | 'Windows' | 'Linux' | 'unknown'

/** CPU architecture a download targets, where it matters (macOS dmg, Linux deb). */
export type Arch = 'arm64' | 'x64' | 'amd64'

/** A single downloadable installer resolved for a platform. */
export interface DownloadTarget {
  os: OS
  /** Present only where arch is meaningful (macOS arm64/x64, Linux amd64). */
  arch?: Arch
  /** Human-readable descriptor for the all-downloads panel, e.g. "macOS · Apple Silicon (arm64)". */
  label: string
  /** File extension, e.g. ".dmg", ".exe", ".AppImage", ".deb". */
  ext: string
  /** Direct `browser_download_url` from the release asset. */
  url: string
  /** Asset size in bytes (for the all-downloads panel). */
  sizeBytes: number
  /** Exact asset filename, e.g. "GitWarden-0.1.0-arm64.dmg". */
  filename: string
}

/** A single asset attached to a GitHub release (trimmed). */
export interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

/** The trimmed GitHub release shape the resolver + fetch wrapper consume (plan Appendix D). */
export interface Release {
  tag_name: string
  name: string
  draft: boolean
  prerelease: boolean
  html_url: string
  assets: ReleaseAsset[]
}

/** Result of resolving a release for a given visitor OS (plan §3). */
export interface ResolvedTargets {
  /** Main download for the detected OS (undefined for `unknown` OS or when missing). */
  primary?: DownloadTarget
  /** Alternative for the detected OS (Intel dmg / .deb); undefined where none applies. */
  secondary?: DownloadTarget
  /** Every matched target grouped by OS (primary first), for the all-downloads panel. */
  all: Record<OS, DownloadTarget[]>
  /** Release page URL — the ultimate "never a dead end" fallback (plan §1). */
  releaseUrl: string
  /** Release version (tag_name, e.g. "v0.1.0"); empty string when no release is available. */
  version: string
}
