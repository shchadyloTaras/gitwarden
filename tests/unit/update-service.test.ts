import { describe, it, expect } from 'vitest'
import { GitHubUpdateService } from '../../src/main/services/UpdateService'
import { evaluateUpdate } from '../../src/core/updates/evaluate'
import type { ReleaseInfo } from '../../src/core/updates/types'
import type { HttpClient, HttpRequest, HttpResponse } from '../../src/main/services/HttpClient'

/** A fake HttpClient that records the last GET and returns a scripted response or throws. */
class FakeHttpClient implements HttpClient {
  lastGetUrl?: string
  lastGetHeaders?: Record<string, string>
  constructor(private readonly responder: () => HttpResponse) {}

  get(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    this.lastGetUrl = url
    this.lastGetHeaders = headers
    return Promise.resolve(this.responder())
  }
  request(_req: HttpRequest): Promise<HttpResponse> {
    return Promise.reject(new Error('not used'))
  }
  postForm(): Promise<HttpResponse> {
    return Promise.reject(new Error('not used'))
  }
}

function service(client: HttpClient, currentVersion = '0.1.1'): GitHubUpdateService {
  return new GitHubUpdateService({
    http: client,
    currentVersion,
    owner: 'shchadyloTaras',
    repo: 'gitwarden',
  })
}

const RELEASE_JSON = {
  tag_name: 'v0.2.0',
  name: 'GitWarden 0.2.0',
  html_url: 'https://github.com/shchadyloTaras/gitwarden/releases/tag/v0.2.0',
  published_at: '2026-07-01T00:00:00Z',
  draft: false,
  prerelease: false,
}

describe('evaluateUpdate', () => {
  const release: ReleaseInfo = {
    tag: 'v0.2.0',
    version: '0.2.0',
    name: 'GitWarden 0.2.0',
    url: 'https://example.com/r',
  }

  it('reports no-releases when none is published', () => {
    expect(evaluateUpdate('0.1.1', null)).toEqual({
      status: 'no-releases',
      currentVersion: '0.1.1',
    })
  })

  it('reports update-available for a newer release', () => {
    expect(evaluateUpdate('0.1.1', release)).toEqual({
      status: 'update-available',
      currentVersion: '0.1.1',
      release,
    })
  })

  it('reports up-to-date when the release is not newer', () => {
    expect(evaluateUpdate('0.2.0', release)).toEqual({
      status: 'up-to-date',
      currentVersion: '0.2.0',
    })
    expect(evaluateUpdate('1.0.0', release)).toEqual({
      status: 'up-to-date',
      currentVersion: '1.0.0',
    })
  })
})

describe('GitHubUpdateService.checkForUpdates', () => {
  it('queries the latest-release endpoint with GitHub headers', async () => {
    const client = new FakeHttpClient(() => ({ status: 200, json: RELEASE_JSON }))
    await service(client).checkForUpdates()

    expect(client.lastGetUrl).toBe(
      'https://api.github.com/repos/shchadyloTaras/gitwarden/releases/latest'
    )
    expect(client.lastGetHeaders?.['User-Agent']).toBe('GitWarden')
    expect(client.lastGetHeaders?.Accept).toBe('application/vnd.github+json')
  })

  it('maps a newer published release to update-available with mapped fields', async () => {
    const client = new FakeHttpClient(() => ({ status: 200, json: RELEASE_JSON }))
    const result = await service(client, '0.1.1').checkForUpdates()

    expect(result.status).toBe('update-available')
    if (result.status !== 'update-available') throw new Error('expected update-available')
    expect(result.release).toEqual({
      tag: 'v0.2.0',
      version: '0.2.0', // leading "v" stripped
      name: 'GitWarden 0.2.0',
      url: 'https://github.com/shchadyloTaras/gitwarden/releases/tag/v0.2.0',
      publishedAt: '2026-07-01T00:00:00Z',
    })
  })

  it('falls back to the tag when the release name is null', async () => {
    const client = new FakeHttpClient(() => ({
      status: 200,
      json: { ...RELEASE_JSON, name: null },
    }))
    const result = await service(client, '0.1.1').checkForUpdates()
    if (result.status !== 'update-available') throw new Error('expected update-available')
    expect(result.release.name).toBe('v0.2.0')
  })

  it('reports up-to-date when the published release is not newer', async () => {
    const client = new FakeHttpClient(() => ({ status: 200, json: RELEASE_JSON }))
    const result = await service(client, '0.2.0').checkForUpdates()
    expect(result.status).toBe('up-to-date')
  })

  it('treats a 404 (no published release) as no-releases', async () => {
    const client = new FakeHttpClient(() => ({ status: 404, json: undefined }))
    const result = await service(client).checkForUpdates()
    expect(result.status).toBe('no-releases')
  })

  it('returns a soft error (never throws) on a non-2xx status', async () => {
    const client = new FakeHttpClient(() => ({ status: 500, json: undefined }))
    const result = await service(client).checkForUpdates()
    expect(result.status).toBe('error')
  })

  it('returns a soft error on a network failure', async () => {
    const client = new FakeHttpClient(() => {
      throw new Error('ENOTFOUND api.github.com')
    })
    const result = await service(client).checkForUpdates()
    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('expected error')
    expect(result.error).toContain('ENOTFOUND')
  })

  it('returns a soft error on a malformed body', async () => {
    const client = new FakeHttpClient(() => ({ status: 200, json: { unexpected: true } }))
    const result = await service(client).checkForUpdates()
    expect(result.status).toBe('error')
  })
})
