// Concrete HttpClient for the GitHub OAuth feature.
//
// The logic phases (23/24) only ever saw the injectable `HttpClient` port so they
// could be unit-tested with a fake. Phase 25 supplies the one real implementation,
// built on the global `fetch` (Electron 31 / Node ≥18). TLS/cert validation is never
// disabled (docs/plans/github-oauth-plan.md Appendix B). Callers validate every
// response body with Zod, so a non-JSON body is surfaced as `json: undefined` rather
// than throwing here — the schema parse downstream produces the typed error.

import type { HttpClient, HttpRequest, HttpResponse } from './HttpClient.js'

export class FetchHttpClient implements HttpClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    const headers = { ...(request.headers ?? {}) }
    let body = request.body
    if (request.json !== undefined) {
      body = JSON.stringify(request.json)
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
    }

    const res = await this.fetchImpl(request.url, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    })
    return readResponse(res)
  }

  async postForm(
    url: string,
    body: Record<string, string>,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse> {
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...headers,
      },
      body: new URLSearchParams(body).toString(),
    })
    return readResponse(res)
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    const res = await this.fetchImpl(url, { method: 'GET', headers })
    return readResponse(res)
  }
}

/**
 * Read a response into the typed shape. The raw text is retained as `bodyText`
 * so error paths can surface a non-JSON/empty body; `json` stays `undefined`
 * when the body is not parseable JSON (callers validate with Zod downstream).
 */
async function readResponse(res: Response): Promise<HttpResponse> {
  const text = await res.text()
  return { status: res.status, json: parseJsonOrUndefined(text), bodyText: text || undefined }
}

function parseJsonOrUndefined(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
