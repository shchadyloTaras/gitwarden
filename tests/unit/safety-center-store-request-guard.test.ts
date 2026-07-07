import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 89: safetyCenterStore.load must drop a superseded response — the badge and
// the Safety Center screen must never render a stale repo's identity/push verdict.
const getEffectiveIdentity = vi.hoisted(() => vi.fn())
const getRemotes = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getEffectiveIdentity, getRemotes, getStatus } },
})

import { useSafetyCenterStore } from '../../src/renderer/store/safetyCenterStore'

const repoA: RepositoryRecord = { id: 'a', name: 'a', localPath: '/a', isFavorite: false }
const repoB: RepositoryRecord = { id: 'b', name: 'b', localPath: '/b', isFavorite: false }

describe('safetyCenterStore stale-request guard (Phase 89)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEffectiveIdentity.mockResolvedValue({ ok: false, error: 'no identity' })
    getRemotes.mockResolvedValue({ ok: true, data: [] })
  })

  it('drops a load() result that resolves after a newer load() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    getStatus.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const pendingA = useSafetyCenterStore.getState().load(repoA.localPath, repoA, null, [])

    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'dev' } })
    const pendingB = useSafetyCenterStore.getState().load(repoB.localPath, repoB, null, [])
    await pendingB
    expect(useSafetyCenterStore.getState().repository?.id).toBe('b')
    expect(useSafetyCenterStore.getState().currentBranch).toBe('dev')

    resolveA({ ok: true, data: { branch: 'stale' } })
    await pendingA
    expect(useSafetyCenterStore.getState().repository?.id).toBe('b')
    expect(useSafetyCenterStore.getState().currentBranch).toBe('dev')
  })

  it('resets currentBranch/identity/remotes at the start of every load (no stale carryover)', async () => {
    getStatus.mockResolvedValueOnce({ ok: true, data: { branch: 'main' } })
    await useSafetyCenterStore.getState().load(repoA.localPath, repoA, null, [])
    expect(useSafetyCenterStore.getState().currentBranch).toBe('main')

    let resolveB: (v: unknown) => void = () => {}
    getStatus.mockImplementationOnce(() => new Promise((r) => (resolveB = r)))
    const pending = useSafetyCenterStore.getState().load(repoB.localPath, repoB, null, [])
    // The stale repo-a branch must not remain visible while repo-b loads.
    expect(useSafetyCenterStore.getState().currentBranch).toBeNull()

    resolveB({ ok: true, data: { branch: 'dev' } })
    await pending
  })
})
