// Concrete HttpClient for the GitHub OAuth feature.
//
// The logic phases (23/24) only ever saw the injectable `HttpClient` port so they
// could be unit-tested with a fake. Phase 25 supplies the one real implementation,
// built on the global `fetch` (Electron 31 / Node ≥18). TLS/cert validation is never
// disabled (docs/plans/github-oauth-plan.md Appendix B). Callers validate every
// response body with Zod, so a non-JSON body is surfaced as `json: undefined` rather
// than throwing here — the schema parse downstream produces the typed error.

import type { HttpClient, HttpResponse } from './HttpClient.js'

export class FetchHttpClient implements HttpClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

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
    return { status: res.status, json: await readJson(res) }
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    const res = await this.fetchImpl(url, { method: 'GET', headers })
    return { status: res.status, json: await readJson(res) }
  }
}

/** Parse a JSON body defensively; a non-JSON/empty body becomes `undefined`. */
async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
