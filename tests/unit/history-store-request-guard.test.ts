import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord, GitCommit } from '../../src/core/types'

// Phase 89: historyStore.load must drop a superseded response, and loadMore must drop
// an append that resolves after a newer load()/loadMore() started (#6 — no cross-branch
// mixed history).
const getCommitHistory = vi.hoisted(() => vi.fn())
const getReturnState = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: {
    git: { getCommitHistory },
    history: { getReturnState, returnLastCommit: vi.fn(), returnUnpushed: vi.fn() },
  },
})

import { useHistoryStore } from '../../src/renderer/store/historyStore'

const repoA: RepositoryRecord = { id: 'a', name: 'a', localPath: '/a', isFavorite: false }
const repoB: RepositoryRecord = { id: 'b', name: 'b', localPath: '/b', isFavorite: false }

const commit = (hash: string): GitCommit => ({
  fullHash: hash,
  shortHash: hash,
  message: hash,
  authorName: 'x',
  authorEmail: 'x@y.z',
  date: '2026-01-01',
})

describe('historyStore stale-request guard (Phase 89)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getReturnState.mockResolvedValue({
      ok: true,
      data: { eligibility: 'none', unpushedCount: 0 },
    })
  })

  it('drops a load() result that resolves after a newer load() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    getCommitHistory.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const pendingA = useHistoryStore.getState().load(repoA.localPath, repoA)

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('b1')] })
    const pendingB = useHistoryStore.getState().load(repoB.localPath, repoB)
    await pendingB
    expect(useHistoryStore.getState().repository?.id).toBe('b')
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['b1'])

    resolveA({ ok: true, data: [commit('a1'), commit('a2')] })
    await pendingA
    expect(useHistoryStore.getState().repository?.id).toBe('b')
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['b1'])
  })

  it('#6: drops a loadMore() append that resolves after a load() reset the list', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('a1')] })
    await useHistoryStore.getState().load(repoA.localPath, repoA)

    let resolveMore: (v: unknown) => void = () => {}
    getCommitHistory.mockImplementationOnce(() => new Promise((r) => (resolveMore = r)))
    const pendingMore = useHistoryStore.getState().loadMore()

    // A branch/repo switch reloads before the page finishes loading.
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('b1')] })
    await useHistoryStore.getState().load(repoB.localPath, repoB)

    // The stale page for repo A finally resolves — must not get appended onto B's list.
    resolveMore({ ok: true, data: [commit('a2'), commit('a3')] })
    await pendingMore
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['b1'])
  })
})
