/**
 * The single impure part of release resolution (plan §3): a thin wrapper around GitHub's
 * `GET /repos/{owner}/{repo}/releases/latest`.
 *
 * Contract: returns a parsed `Release` on success, or `null` on ANY failure — network error,
 * non-2xx (incl. 404 when no release is published yet), malformed JSON, or a draft/prerelease.
 * It NEVER throws to the UI, so callers degrade gracefully to the Releases-page fallback.
 *
 * `fetchImpl` is injectable so every test runs offline with a mock — no real network call.
 */
import { RELEASES_API_URL } from './config'
import type { Release, ReleaseAsset } from './types'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function isReleaseAsset(value: unknown): value is ReleaseAsset {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  return (
    typeof a.name === 'string' &&
    typeof a.size === 'number' &&
    typeof a.browser_download_url === 'string'
  )
}

function parseRelease(data: unknown): Release | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  // Exclude drafts and prereleases — the site only ever surfaces stable releases.
  if (d.draft === true || d.prerelease === true) return null
  if (!Array.isArray(d.assets) || !d.assets.every(isReleaseAsset)) return null
  if (typeof d.tag_name !== 'string' || typeof d.html_url !== 'string') return null
  return {
    tag_name: d.tag_name,
    name: typeof d.name === 'string' ? d.name : d.tag_name,
    draft: false,
    prerelease: false,
    html_url: d.html_url,
    assets: d.assets,
  }
}

/**
 * Fetch the latest published release, or `null` on any failure.
 *
 * @param fetchImpl Defaults to the global `fetch`; inject a mock in tests.
 */
export async function fetchLatestRelease(fetchImpl: FetchLike = fetch): Promise<Release | null> {
  try {
    const res = await fetchImpl(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return parseRelease(data)
  } catch {
    return null
  }
}
