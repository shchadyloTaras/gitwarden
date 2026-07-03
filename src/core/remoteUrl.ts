/** True if `url` is a plausible git remote (https/http, ssh://, git@host:path, file://, or an
 *  absolute local path). Format-only: does NOT touch the network or the filesystem. */
export function isValidGitRemoteUrl(url: string): boolean {
  if (url.length === 0) return false
  if (/\s/.test(url)) return false

  if (/^(https?|ssh|file):\/\/\S+$/i.test(url)) return true

  // scp-like: user@host:path
  if (/^[\w.-]+@[\w.-]+:.+$/.test(url)) return true

  // POSIX absolute path
  if (url.startsWith('/')) return true

  // Windows drive path (best-effort): C:\... or C:/...
  if (/^[A-Za-z]:[\\/].+$/.test(url)) return true

  // UNC path (best-effort): \\host\share
  if (/^\\\\[\w.-]+\\.+$/.test(url)) return true

  return false
}
