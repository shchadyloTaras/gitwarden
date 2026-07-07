import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 95 (W28): the window-focus re-check must be throttled to ≥24h — the launch
// check and the manual "Check for updates" button in Settings both call check()
// directly and are never throttled; checkIfStale is the ONLY throttled entry point.
const apiUpdates = vi.hoisted(() => ({ check: vi.fn() }))
vi.stubGlobal('window', { api: { updates: apiUpdates } })

import { useUpdatesStore } from '../../src/renderer/store/updatesStore'

const DAY_MS = 24 * 60 * 60 * 1000

describe('updatesStore focus re-check throttle (Phase 95)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUpdatesStore.setState({ result: null, checking: false, lastCheckedAt: null })
    apiUpdates.check.mockResolvedValue({
      ok: true,
      data: { status: 'up-to-date', currentVersion: '1.0.0' },
    })
  })

  it('checkIfStale runs a real check when there is no prior check at all', async () => {
    await useUpdatesStore.getState().checkIfStale(1_000)
    expect(apiUpdates.check).toHaveBeenCalledTimes(1)
    expect(useUpdatesStore.getState().lastCheckedAt).toBe(1_000)
  })

  it('checkIfStale is a no-op when the last check was well under 24h ago', async () => {
    await useUpdatesStore.getState().checkIfStale(1_000)
    apiUpdates.check.mockClear()

    await useUpdatesStore.getState().checkIfStale(1_000 + DAY_MS - 1)

    expect(apiUpdates.check).not.toHaveBeenCalled()
  })

  it('checkIfStale runs again once 24h have elapsed', async () => {
    await useUpdatesStore.getState().checkIfStale(1_000)
    apiUpdates.check.mockClear()

    await useUpdatesStore.getState().checkIfStale(1_000 + DAY_MS)

    expect(apiUpdates.check).toHaveBeenCalledTimes(1)
  })

  it('check() itself is never throttled — a manual re-check always runs', async () => {
    await useUpdatesStore.getState().check()
    await useUpdatesStore.getState().check()
    expect(apiUpdates.check).toHaveBeenCalledTimes(2)
  })

  it('check() stamps lastCheckedAt using the real clock', async () => {
    const before = Date.now()
    await useUpdatesStore.getState().check()
    const after = Date.now()
    const stamped = useUpdatesStore.getState().lastCheckedAt
    expect(stamped).not.toBeNull()
    expect(stamped as number).toBeGreaterThanOrEqual(before)
    expect(stamped as number).toBeLessThanOrEqual(after)
  })
})
