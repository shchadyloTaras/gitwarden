// Injectable HTTP seam for all GitHub network calls.
//
// Every network request in the GitHub OAuth feature goes through this interface
// so the device-flow state machine (Phase 23) and the REST client (Phase 24) are
// unit-tested under plain Vitest with a mocked client — no real network in CI
// (docs/plans/github-oauth-plan.md §0 verifiability principle, §3).
//
// The concrete implementation is created in the IPC/main glue (Phase 25); this
// module defines only the contract so the logic phases stay network-free.

export interface HttpResponse {
  /** HTTP status code, e.g. 200. */
  status: number
  /** Parsed JSON body. `unknown` — callers validate with Zod before use. */
  json: unknown
  /**
   * Raw response body text. Retained so error paths can surface a provider's
   * reason even when the body is non-JSON or empty (some local OpenAI-compatible
   * servers return plain-text 400s). Undefined when the body was empty.
   */
  bodyText?: string
}

export interface HttpRequest {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  /** JSON request body; the concrete client serializes it as application/json. */
  json?: unknown
  /** Raw request body for protocol-specific calls. */
  body?: string
  signal?: AbortSignal
}

export interface HttpClient {
  /** Generic JSON/raw request seam used by AI adapters. */
  request(request: HttpRequest): Promise<HttpResponse>
  /** POST an `application/x-www-form-urlencoded` body and parse the JSON response. */
  postForm(
    url: string,
    body: Record<string, string>,
    headers?: Record<string, string>
  ): Promise<HttpResponse>
  /** GET a URL and parse the JSON response. */
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>
}
