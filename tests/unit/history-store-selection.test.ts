import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord, GitCommit, GitCommitDetails } from '../../src/core/types'

// Phase 113: selectCommit() gets its own independent guard (detailTracker) — a new
// selection, a repository/branch change, or a same-target refresh/pagination response
// that drops the hash from the visible list must all invalidate a stale detail fetch.
const getCommitHistory = vi.hoisted(() => vi.fn())
const getReturnState = vi.hoisted(() => vi.fn())
const getCommitDetails = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: {
    git: { getCommitHistory, getCommitDetails },
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

function commits(n: number, prefix = 'c'): GitCommit[] {
  return Array.from({ length: n }, (_, i) => commit(`${prefix}${i}`))
}

function detailFor(hash: string): GitCommitDetails {
  return { commit: commit(hash), parentHashes: [], files: [], patch: '' }
}

describe('historyStore commit-detail selection (Phase 113)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHistoryStore.setState({
      repoPath: null,
      branch: null,
      repository: null,
      commits: [],
      visibleLimit: 50,
      loading: false,
      loadingMore: false,
      error: null,
      hasMore: false,
      eligibility: null,
      unpushedCount: 0,
      returning: false,
      returnError: null,
      returnSuccessMessage: null,
      selectedHash: null,
      detail: null,
      detailLoading: false,
      detailError: null,
    })
    getReturnState.mockResolvedValue({
      ok: true,
      data: { eligibility: 'none', unpushedCount: 0 },
    })
  })

  it('selectCommit fetches and applies the commit detail', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(1) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('c0') })
    await useHistoryStore.getState().selectCommit('c0')

    expect(getCommitDetails).toHaveBeenCalledWith(repoA.localPath, 'c0')
    expect(useHistoryStore.getState().selectedHash).toBe('c0')
    expect(useHistoryStore.getState().detail?.commit.fullHash).toBe('c0')
    expect(useHistoryStore.getState().detailLoading).toBe(false)
  })

  it('drops a stale detail response superseded by a newer selectCommit call', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(2) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    let resolveFirst: (v: unknown) => void = () => {}
    getCommitDetails.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
    const pendingFirst = useHistoryStore.getState().selectCommit('c0')

    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('c1') })
    await useHistoryStore.getState().selectCommit('c1')
    expect(useHistoryStore.getState().selectedHash).toBe('c1')
    expect(useHistoryStore.getState().detail?.commit.fullHash).toBe('c1')

    resolveFirst({ ok: true, data: detailFor('c0') })
    await pendingFirst
    // The first (now stale) response must not overwrite the second selection.
    expect(useHistoryStore.getState().selectedHash).toBe('c1')
    expect(useHistoryStore.getState().detail?.commit.fullHash).toBe('c1')
  })

  it('re-clicking the already-selected, already-loaded row is a no-op', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(1) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('c0') })
    await useHistoryStore.getState().selectCommit('c0')
    expect(getCommitDetails).toHaveBeenCalledTimes(1)

    await useHistoryStore.getState().selectCommit('c0')
    expect(getCommitDetails).toHaveBeenCalledTimes(1)
  })

  it('clears the selection on a repository change', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(1, 'a') })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('a0') })
    await useHistoryStore.getState().selectCommit('a0')
    expect(useHistoryStore.getState().selectedHash).toBe('a0')

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('b0')] })
    await useHistoryStore.getState().load(repoB.localPath, repoB, 'main')

    expect(useHistoryStore.getState().selectedHash).toBeNull()
    expect(useHistoryStore.getState().detail).toBeNull()
  })

  it('clears the selection on a branch change (same repository)', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(1, 'm') })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('m0') })
    await useHistoryStore.getState().selectCommit('m0')

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('f0')] })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'feature')

    expect(useHistoryStore.getState().selectedHash).toBeNull()
    expect(useHistoryStore.getState().detail).toBeNull()
  })

  it('preserves the selection across a same-target refresh while the hash stays visible', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(3) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('c1') })
    await useHistoryStore.getState().selectCommit('c1')

    // Same-target refresh (e.g. a `.git` watcher event) — c1 is still in the list.
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(3) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    expect(useHistoryStore.getState().selectedHash).toBe('c1')
    expect(useHistoryStore.getState().detail?.commit.fullHash).toBe('c1')
  })

  it('clears the selection when a same-target refresh drops the hash from the visible list', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(3) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('c1') })
    await useHistoryStore.getState().selectCommit('c1')

    // A same-target refresh where c1 no longer appears (e.g. history was rewritten).
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(3, 'z') })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    expect(useHistoryStore.getState().selectedHash).toBeNull()
    expect(useHistoryStore.getState().detail).toBeNull()
  })

  it('preserves the selection across pagination while the hash stays visible', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    getCommitDetails.mockResolvedValueOnce({ ok: true, data: detailFor('c0') })
    await useHistoryStore.getState().selectCommit('c0')

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(101) })
    await useHistoryStore.getState().loadMore()

    expect(useHistoryStore.getState().selectedHash).toBe('c0')
    expect(useHistoryStore.getState().detail?.commit.fullHash).toBe('c0')
  })

  it('surfaces a detail fetch failure as detailError without touching the commit list', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(1) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    getCommitDetails.mockResolvedValueOnce({ ok: false, error: 'boom' })
    await useHistoryStore.getState().selectCommit('c0')

    expect(useHistoryStore.getState().selectedHash).toBe('c0')
    expect(useHistoryStore.getState().detail).toBeNull()
    expect(useHistoryStore.getState().detailError).toBe('boom')
    expect(useHistoryStore.getState().commits).toHaveLength(1)
  })
})
