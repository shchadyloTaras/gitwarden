/**
 * Storefront coordinates and canonical GitHub URLs — the ONLY place these constants live.
 *
 * Plan §2 (Site Rules): "Single source of truth for downloads. GitHub Releases. The site
 * derives links; it never duplicates version numbers or filenames by hand."
 *
 * The source repo (`gitwarden`) is private (Private-Source Distribution plan, Phase 74);
 * downloads, releases, security policy, and license all resolve against the public
 * storefront (`gitwarden-releases`) instead — there is no "view source" link or constant.
 *
 * The Phase 47 resolver + fetch wrapper consume RELEASES_API_URL; every UI fallback links
 * RELEASES_URL so the download is never a dead end (plan §1).
 */
export const RELEASES_OWNER = 'shchadyloTaras'
export const RELEASES_REPO = 'gitwarden-releases'

const RELEASES_REPO_URL = `https://github.com/${RELEASES_OWNER}/${RELEASES_REPO}`

/**
 * Human-facing Releases page — the ultimate "never a dead end" fallback (plan §1):
 * API failure / rate-limit / missing asset all degrade to this page.
 */
export const RELEASES_URL = `${RELEASES_REPO_URL}/releases`

/** Redirects to the newest published release; the "find your version on GitHub" target. */
export const LATEST_RELEASE_URL = `${RELEASES_REPO_URL}/releases/latest`

/**
 * GitHub REST endpoint the Phase 47 fetch wrapper calls for the latest published,
 * non-draft, non-prerelease release. Unauthenticated (plan §2: no secrets in the client).
 */
export const RELEASES_API_URL = `https://api.github.com/repos/${RELEASES_OWNER}/${RELEASES_REPO}/releases/latest`

/** Security policy + license, linked from the footer (Phase 49) — both live on the storefront. */
export const SECURITY_URL = `${RELEASES_REPO_URL}/blob/main/SECURITY.md`
export const LICENSE_URL = `${RELEASES_REPO_URL}/blob/main/LICENSE`

/** Public user-support mailbox, linked from the landing footer and docs. */
export const SUPPORT_EMAIL = 'gitwarden.support@gmail.com'
export const SUPPORT_MAILTO_URL = `mailto:${SUPPORT_EMAIL}`
