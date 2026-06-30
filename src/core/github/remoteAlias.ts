// Pure helper: rewrite ONLY the host of an scp-like SSH git remote, to bind a repo's
// transport to a profile's declared ssh `Host` alias (ADR 0009), e.g.
//   git@github.com:owner/repo.git  ↔  git@<alias>:owner/repo.git
// The user + owner/repo path are preserved; only the host changes. HTTPS, ssh:// and any
// non-scp-like URL are returned unchanged. Pure module — no platform/runtime imports.

/**
 * scp-like SSH remote: `user@host:owner/repo[.git]`. Captures `user`, `host`, and the
 * `path` tail (`owner/repo[.git]`). Deliberately excludes `ssh://`/`https://` URL forms —
 * those carry a `:` after the scheme (not after the user), so they never match here and
 * are left untouched, which is exactly what binding/restoring wants.
 */
const SCP_LIKE = /^([A-Za-z0-9._+-]+)@([^:/]+):(.+)$/

/** Swap the host of an scp-like SSH remote; a blank/absent host or non-scp URL is a no-op. */
function swapHost(url: string, newHost: string | undefined): string {
  const host = newHost?.trim()
  if (!host) return url
  const m = SCP_LIKE.exec(url)
  if (!m) return url
  return `${m[1]}@${host}:${m[3]}`
}

/**
 * The host of an scp-like SSH remote (`git@github.com:o/r.git` → `github.com`), or
 * `undefined` for HTTPS/`ssh://`/unparseable URLs. Used to capture the canonical host
 * before binding and to detect whether a remote is an scp-like SSH remote at all.
 */
export function scpRemoteHost(url: string): string | undefined {
  const m = SCP_LIKE.exec(url)
  return m ? m[2] : undefined
}

/**
 * Bind the host of an scp-like SSH remote to `alias`, preserving user + owner/repo path:
 * `git@github.com:owner/repo.git` → `git@<alias>:owner/repo.git`. HTTPS (and any non-scp)
 * URL is returned unchanged; a blank alias is a no-op.
 */
export function bindHostToAlias(url: string, alias: string): string {
  return swapHost(url, alias)
}

/**
 * Restore the host of an scp-like SSH remote back to `host` — the inverse of
 * {@link bindHostToAlias}. HTTPS (and any non-scp) URL is returned unchanged; a blank host
 * is a no-op.
 */
export function restoreHost(url: string, host: string): string {
  return swapHost(url, host)
}
