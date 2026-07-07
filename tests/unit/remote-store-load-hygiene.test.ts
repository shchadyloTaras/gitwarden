import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 89: remoteStore.load must reset `upstream` on repo change (#9), and must never
// paint a superseded load()'s result over a newer one's (the stale-request guard).
const getRemotes = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
const getEffectiveIdentity = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getRemotes, getStatus, getEffectiveIdentity } },
})

import { useRemoteStore } from '../../src/renderer/store/remoteStore'

const repoA: RepositoryRecord = {
  id: 'a',
  name: 'repo-a',
  localPath: '/tmp/repo-a',
  isFavorite: false,
}
const repoB: RepositoryRecord = {
  id: 'b',
  name: 'repo-b',
  localPath: '/tmp/repo-b',
  isFavorite: false,
}

describe('remoteStore load hygiene (Phase 89)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getEffectiveIdentity.mockResolvedValue({ ok: true, data: {} })
  })

  it('#9: resets upstream to null when switching to a different repo', async () => {
    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main', upstream: 'origin/main' } })
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    expect(useRemoteStore.getState().upstream).toBe('origin/main')

    // repo B has no upstream at all — a stale 'origin/main' must not survive the switch.
    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main' } })
    await useRemoteStore.getState().load(repoB.localPath, repoB)
    expect(useRemoteStore.getState().upstream).toBeNull()
  })

  it('drops a load() result that resolves after a newer load() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    getStatus.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const pendingA = useRemoteStore.getState().load(repoA.localPath, repoA)

    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main', upstream: 'origin/main' } })
    const pendingB = useRemoteStore.getState().load(repoB.localPath, repoB)
    await pendingB
    expect(useRemoteStore.getState().repository?.id).toBe('b')
    expect(useRemoteStore.getState().upstream).toBe('origin/main')

    resolveA({ ok: true, data: { branch: 'stale', upstream: 'origin/stale' } })
    await pendingA
    expect(useRemoteStore.getState().repository?.id).toBe('b')
    expect(useRemoteStore.getState().upstream).toBe('origin/main')
  })
})

describe('remoteStore upstreamGone (Phase 92, W20)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getEffectiveIdentity.mockResolvedValue({ ok: true, data: {} })
  })

  it('surfaces upstreamGone: true from GitStatus', async () => {
    getStatus.mockResolvedValueOnce({
      ok: true,
      data: { branch: 'main', upstream: 'origin/main', upstreamGone: true },
    })
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    expect(useRemoteStore.getState().upstreamGone).toBe(true)
  })

  it('resets upstreamGone to false when switching to a repo without the issue', async () => {
    getStatus.mockResolvedValueOnce({
      ok: true,
      data: { branch: 'main', upstream: 'origin/main', upstreamGone: true },
    })
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    expect(useRemoteStore.getState().upstreamGone).toBe(true)

    getStatus.mockResolvedValueOnce({
      ok: true,
      data: { branch: 'main', upstream: 'origin/main', upstreamGone: false },
    })
    await useRemoteStore.getState().load(repoB.localPath, repoB)
    expect(useRemoteStore.getState().upstreamGone).toBe(false)
  })

  it('defaults upstreamGone to false when the field is absent', async () => {
    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main' } })
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    expect(useRemoteStore.getState().upstreamGone).toBe(false)
  })
})
