// Pure helper: parse owner/repo from a remote URL. No node/browser globals.

/**
 * Parse the owner and repository name from a git remote URL.
 *
 * Supports:
 *   - scp-like SSH:  `git@github.com:owner/repo.git`
 *   - HTTPS:         `https://github.com/owner/repo.git`
 *
 * Strips a `.git` suffix and any trailing slash.
 * Returns `undefined` for non-parseable or incomplete URLs.
 */
export function parseRemoteOwnerRepo(url: string): { owner: string; repo: string } | undefined {
  if (!url || typeof url !== 'string') return undefined

  // scp-like SSH: git@host:owner/repo[.git]
  const scpMatch = /^[^@]+@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url)
  if (scpMatch) {
    const owner = scpMatch[1]
    const repo = scpMatch[2]
    if (owner && repo) return { owner, repo }
  }

  // HTTPS (or http): https://host/owner/repo[.git][/]
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\.git$/, '').replace(/\/$/, '')
    const parts = path.replace(/^\//, '').split('/')
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] }
    }
  } catch {
    // Not a valid URL — fall through
  }

  return undefined
}
