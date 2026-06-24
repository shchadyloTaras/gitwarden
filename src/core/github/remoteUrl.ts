// Pure helper shared by the renderer (to decide whether the GitHub push checks apply)
// and main (to decide whether to attach a token). No node/electron/DOM imports.

/**
 * True when `url` is an HTTPS GitHub remote (`https://github.com/...` or a subdomain
 * like `https://www.github.com/...`). SSH (`git@github.com:...`), `git://`, and
 * non-GitHub hosts return false — those never engage the HTTPS-token push path.
 */
export function isHttpsGitHubRemoteUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  return host === 'github.com' || host.endsWith('.github.com')
}
