import { describe, it, expect, vi } from 'vitest'
import { fetchLatestRelease, type FetchLike } from './fetchRelease'
import { RELEASES_API_URL } from './config'
import {
  latestReleaseFixture,
  draftReleaseFixture,
  prereleaseFixture,
} from './__fixtures__/latestRelease'

/** Build a mock fetch returning a JSON body with the given status. No real network. */
function jsonFetch(body: unknown, status = 200): FetchLike {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('fetchLatestRelease — offline, fallback-safe (plan §3, §6)', () => {
  it('returns the parsed Release on a 200 with a valid published payload', async () => {
    const release = await fetchLatestRelease(jsonFetch(latestReleaseFixture))
    expect(release).not.toBeNull()
    expect(release?.tag_name).toBe('v0.1.0')
    expect(release?.assets).toHaveLength(latestReleaseFixture.assets.length)
  })

  it('calls the canonical GitHub releases/latest endpoint', async () => {
    const fetchImpl = jsonFetch(latestReleaseFixture)
    await fetchLatestRelease(fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith(RELEASES_API_URL, expect.any(Object))
  })

  it('excludes a draft release → null', async () => {
    expect(await fetchLatestRelease(jsonFetch(draftReleaseFixture))).toBeNull()
  })

  it('excludes a prerelease → null', async () => {
    expect(await fetchLatestRelease(jsonFetch(prereleaseFixture))).toBeNull()
  })

  it('non-OK response (404 — no release published yet) → null', async () => {
    expect(await fetchLatestRelease(jsonFetch({ message: 'Not Found' }, 404))).toBeNull()
  })

  it('rate-limited (403) → null', async () => {
    expect(await fetchLatestRelease(jsonFetch({ message: 'rate limited' }, 403))).toBeNull()
  })

  it('network error (fetch throws) → null, never throws to the caller', async () => {
    const throwing: FetchLike = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(fetchLatestRelease(throwing)).resolves.toBeNull()
  })

  it('malformed JSON (assets not an array) → null', async () => {
    expect(await fetchLatestRelease(jsonFetch({ tag_name: 'v0.1.0', assets: 'nope' }))).toBeNull()
  })

  it('missing required fields (no tag_name) → null', async () => {
    expect(await fetchLatestRelease(jsonFetch({ assets: [] }))).toBeNull()
  })

  it('invalid JSON body → null (caught, not thrown)', async () => {
    const badJson: FetchLike = vi.fn(async () => new Response('<<not json>>', { status: 200 }))
    await expect(fetchLatestRelease(badJson)).resolves.toBeNull()
  })
})
