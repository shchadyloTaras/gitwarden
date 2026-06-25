// AI transport rules — pure core (Phase 28). No node/electron/DOM imports.
//
// Shared by EVERY adapter (built-in and Custom HTTP) and by the connection
// contracts. Two related concerns:
//
//   1. Transport gate: `https://` only, except loopback over plain `http://`
//      (`localhost` / `127.0.0.1` / `[::1]`), so local servers (LM Studio,
//      Ollama, vLLM, llama.cpp) work while LAN/remote stays TLS-only. (§3)
//   2. `localOnly` derivation: privacy status follows the resolved HOST, not the
//      connection `kind`. Any base URL resolving to loopback is the most private
//      choice. (§4)
//
// "Resolved host" here means the literal host in the URL: pure core cannot do
// DNS resolution, so this is the deterministic, offline-checkable part. A runtime
// adapter (Phase 30) may additionally resolve DNS; it must never *widen* this.

/** Loopback host literals, as `URL.hostname` reports them (IPv6 keeps brackets). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** True when `host` is a loopback literal (case-insensitive). */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase())
}

function tryParseUrl(url: string): URL | undefined {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/** True when the URL's host is a loopback literal. Malformed URLs → false. */
export function isLoopbackUrl(url: string): boolean {
  const parsed = tryParseUrl(url)
  return parsed ? isLoopbackHost(parsed.hostname) : false
}

/**
 * The shared transport gate for any user-supplied AI base/endpoint URL:
 * `https://` is always allowed; plain `http://` is allowed ONLY for loopback.
 * Everything else (other schemes, `http://` to a LAN/remote host, malformed
 * input) is rejected.
 */
export function isAllowedAiBaseUrl(url: string): boolean {
  const parsed = tryParseUrl(url)
  if (!parsed) return false
  if (parsed.protocol === 'https:') return true
  if (parsed.protocol === 'http:') return isLoopbackHost(parsed.hostname)
  return false
}

/**
 * Derive `AiConnectionCapabilities.localOnly` from the connection's base URL —
 * the host, never the kind (§4). A connection with no base URL (e.g. a fixed
 * remote adapter) is not local.
 */
export function deriveLocalOnly(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false
  return isLoopbackUrl(baseUrl)
}
