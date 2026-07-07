import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 89: statusStore.loadStatus must drop a superseded response, and must reset the
// stale payload when switching to a different repo (W7) without flickering on an
// in-place refresh of the SAME repo.
const getStatus = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { git: { getStatus } } })

import { useStatusStore } from '../../src/renderer/store/statusStore'

describe('statusStore load hygiene + stale-request guard (Phase 89)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStatusStore.setState({ status: null, loading: false, error: null, repoPath: null })
  })

  it('W7: resets status to null when the target repo differs from the one already loaded', async () => {
    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main', files: ['a'] } })
    await useStatusStore.getState().loadStatus('/repo-a')
    expect(useStatusStore.getState().status?.branch).toBe('main')

    let resolveB: (v: unknown) => void = () => {}
    getStatus.mockImplementationOnce(() => new Promise((r) => (resolveB = r)))
    const pending = useStatusStore.getState().loadStatus('/repo-b')
    // The stale repo-a status must not remain visible/clickable while repo-b loads.
    expect(useStatusStore.getState().status).toBeNull()

    resolveB({ ok: true, data: { branch: 'dev', files: [] } })
    await pending
  })

  it('an in-place refresh of the SAME repo stays flicker-free (status is not nulled mid-reload)', async () => {
    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main', files: ['a'] } })
    await useStatusStore.getState().loadStatus('/repo-a')

    let resolveAgain: (v: unknown) => void = () => {}
    getStatus.mockImplementationOnce(() => new Promise((r) => (resolveAgain = r)))
    const pending = useStatusStore.getState().loadStatus('/repo-a')
    expect(useStatusStore.getState().status?.branch).toBe('main')

    resolveAgain({ ok: true, data: { branch: 'main', files: ['a', 'b'] } })
    await pending
    expect(useStatusStore.getState().status?.files).toEqual(['a', 'b'])
  })

  it('drops a loadStatus() result that resolves after a newer loadStatus() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    getStatus.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const pendingA = useStatusStore.getState().loadStatus('/repo-a')

    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'dev', files: [] } })
    const pendingB = useStatusStore.getState().loadStatus('/repo-b')
    await pendingB
    expect(useStatusStore.getState().repoPath).toBe('/repo-b')
    expect(useStatusStore.getState().status?.branch).toBe('dev')

    resolveA({ ok: true, data: { branch: 'stale', files: ['x'] } })
    await pendingA
    expect(useStatusStore.getState().repoPath).toBe('/repo-b')
    expect(useStatusStore.getState().status?.branch).toBe('dev')
  })

  it('drops a stale error from a superseded loadStatus() call', async () => {
    let rejectA: (err: unknown) => void = () => {}
    getStatus.mockImplementationOnce(() => new Promise((_, rej) => (rejectA = rej)))
    const pendingA = useStatusStore.getState().loadStatus('/repo-a')

    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'dev', files: [] } })
    await useStatusStore.getState().loadStatus('/repo-b')

    rejectA(new Error('boom'))
    await pendingA.catch(() => {})
    expect(useStatusStore.getState().error).toBeNull()
    expect(useStatusStore.getState().status?.branch).toBe('dev')
  })

  it('always clears loading in finally regardless of staleness (own-token race)', async () => {
    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main', files: [] } })
    await useStatusStore.getState().loadStatus('/repo-a')
    expect(useStatusStore.getState().loading).toBe(false)
  })
})
