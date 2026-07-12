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

describe('remoteStore operation-outcome survival (Phase 102)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getEffectiveIdentity.mockResolvedValue({ ok: true, data: {} })
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })
  })

  it('successMessage survives a same-repo load() — the watcher-refresh case, not just data reset', async () => {
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    useRemoteStore.setState({ successMessage: 'Fetched from origin.' })

    // A .git watcher event fires a load() for the SAME repo ~400ms later.
    await useRemoteStore.getState().load(repoA.localPath, repoA)

    expect(useRemoteStore.getState().successMessage).toBe('Fetched from origin.')
  })

  it('successMessage clears on an actual repo change', async () => {
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    useRemoteStore.setState({ successMessage: 'Fetched from origin.' })

    await useRemoteStore.getState().load(repoB.localPath, repoB)

    expect(useRemoteStore.getState().successMessage).toBeNull()
  })

  it('lastFailure (the deterministic QA scenario) survives a same-repo load() a watcher event would trigger', async () => {
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    useRemoteStore.setState({
      lastFailure: { message: 'branches have diverged', remote: 'origin', branch: 'main' },
    })

    // A failed pull's own fetch phase moves refs — the watcher fires a load() for the
    // SAME repo ~400ms later. The banner must survive THIS, not just a manual retry.
    await useRemoteStore.getState().load(repoA.localPath, repoA)

    expect(useRemoteStore.getState().lastFailure).toEqual({
      message: 'branches have diverged',
      remote: 'origin',
      branch: 'main',
    })
  })

  it('lastFailure clears on an actual repo change', async () => {
    await useRemoteStore.getState().load(repoA.localPath, repoA)
    useRemoteStore.setState({
      lastFailure: { message: 'branches have diverged', remote: 'origin', branch: 'main' },
    })

    await useRemoteStore.getState().load(repoB.localPath, repoB)

    expect(useRemoteStore.getState().lastFailure).toBeNull()
  })
})
