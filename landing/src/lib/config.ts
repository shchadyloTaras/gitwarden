/**
 * Repository coordinates and canonical GitHub URLs — the ONLY place these constants live.
 *
 * Plan §2 (Site Rules): "Single source of truth for downloads. GitHub Releases. The site
 * derives links; it never duplicates version numbers or filenames by hand."
 *
 * The Phase 47 resolver + fetch wrapper consume RELEASES_API_URL; every UI fallback links
 * RELEASES_URL so the download is never a dead end (plan §1).
 */
export const OWNER = 'shchadyloTaras'
export const REPO = 'gitwarden'

/** Repository home on GitHub. */
export const REPO_URL = `https://github.com/${OWNER}/${REPO}`

/**
 * Human-facing Releases page — the ultimate "never a dead end" fallback (plan §1):
 * API failure / rate-limit / missing asset all degrade to this page.
 */
export const RELEASES_URL = `${REPO_URL}/releases`

/** Redirects to the newest published release; the "find your version on GitHub" target. */
export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`

/**
 * GitHub REST endpoint the Phase 47 fetch wrapper calls for the latest published,
 * non-draft, non-prerelease release. Unauthenticated (plan §2: no secrets in the client).
 */
export const RELEASES_API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`

/** Security policy + license, linked from the footer (Phase 49). */
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`

/** Public user-support mailbox, linked from the landing footer and docs. */
export const SUPPORT_EMAIL = 'gitwarden.support@gmail.com'
export const SUPPORT_MAILTO_URL = `mailto:${SUPPORT_EMAIL}`
