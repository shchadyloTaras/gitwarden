import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord, GitCommit } from '../../src/core/types'

// Phase 89 introduced the original stale-request guard; Phase 112 replaced the single
// shared tracker with an explicit target identity (repoPath + branch), visible-limit
// state, and SEPARATE load()/loadMore() guards — the shared-tracker design let a
// same-target refresh silently discard an in-flight Load-more response even though the
// user's click would otherwise have succeeded (see history-commit-details-plan.md
// finding #3). These tests cover both the original cross-target guard and the new
// pagination-depth guarantees.
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

function commits(n: number, prefix = 'c'): GitCommit[] {
  return Array.from({ length: n }, (_, i) => commit(`${prefix}${i}`))
}

describe('historyStore target + pagination guards (Phase 89, reworked Phase 112)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Every test starts from a genuinely empty target so its first load() is always a
    // real target change — without this, Zustand's module-level store state leaks
    // between tests (several reuse repoA + 'main' as their starting point) and an
    // earlier test's leftover visibleLimit/commits corrupt a later test's assumptions.
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
    })
    getReturnState.mockResolvedValue({
      ok: true,
      data: { eligibility: 'none', unpushedCount: 0 },
    })
  })

  it('drops a load() result that resolves after a newer load() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    getCommitHistory.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const pendingA = useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('b1')] })
    const pendingB = useHistoryStore.getState().load(repoB.localPath, repoB, 'main')
    await pendingB
    expect(useHistoryStore.getState().repository?.id).toBe('b')
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['b1'])

    resolveA({ ok: true, data: [commit('a1'), commit('a2')] })
    await pendingA
    expect(useHistoryStore.getState().repository?.id).toBe('b')
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['b1'])
  })

  it('first accepted loadMore click increases the visible depth by PAGE_SIZE', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    expect(useHistoryStore.getState().commits).toHaveLength(50)
    expect(useHistoryStore.getState().hasMore).toBe(true)

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(55) })
    await useHistoryStore.getState().loadMore()

    expect(getCommitHistory).toHaveBeenLastCalledWith(repoA.localPath, 101, 0)
    expect(useHistoryStore.getState().commits).toHaveLength(55)
    expect(useHistoryStore.getState().hasMore).toBe(false)
  })

  it('derives hasMore from the look-ahead row, not an exact-page-size heuristic', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    expect(useHistoryStore.getState().hasMore).toBe(true)

    // Exactly 100 commits exist total: loadMore requests 101, only 100 come back.
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(100) })
    await useHistoryStore.getState().loadMore()
    expect(useHistoryStore.getState().commits).toHaveLength(100)
    expect(useHistoryStore.getState().hasMore).toBe(false)
  })

  it('never renders a duplicate full hash even if a response repeats one', async () => {
    getCommitHistory.mockResolvedValueOnce({
      ok: true,
      data: [commit('a1'), commit('a1'), commit('a2')],
    })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    const hashes = useHistoryStore.getState().commits.map((c) => c.fullHash)
    expect(hashes).toEqual(['a1', 'a2'])
  })

  it('ignores a rapid second loadMore() click while the first is still in flight', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('a1'), commit('a2')] })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    useHistoryStore.setState({ hasMore: true })

    let resolveFirst: (v: unknown) => void = () => {}
    getCommitHistory.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
    const first = useHistoryStore.getState().loadMore()
    expect(useHistoryStore.getState().loadingMore).toBe(true)

    const callsBeforeSecondClick = getCommitHistory.mock.calls.length
    await useHistoryStore.getState().loadMore()
    expect(getCommitHistory.mock.calls.length).toBe(callsBeforeSecondClick)

    resolveFirst({ ok: true, data: commits(60) })
    await first
    expect(useHistoryStore.getState().loadingMore).toBe(false)
  })

  it('a failed loadMore restores the previous visible limit for a genuine retry', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    expect(useHistoryStore.getState().visibleLimit).toBe(50)

    getCommitHistory.mockResolvedValueOnce({ ok: false, error: 'network blip' })
    await useHistoryStore.getState().loadMore()

    expect(useHistoryStore.getState().visibleLimit).toBe(50)
    expect(useHistoryStore.getState().loadingMore).toBe(false)
    expect(useHistoryStore.getState().error).toBeTruthy()
    expect(useHistoryStore.getState().commits).toHaveLength(50)

    // Retry requests the SAME next depth again (50 + 50), not a compounded jump.
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(60) })
    await useHistoryStore.getState().loadMore()
    expect(getCommitHistory).toHaveBeenLastCalledWith(repoA.localPath, 101, 0)
    expect(useHistoryStore.getState().commits).toHaveLength(60)
  })

  it('a same-target refresh does not discard an in-flight loadMore response (finding #3)', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    // The user clicks Load more — the fetch is held open...
    let resolveMore: (v: unknown) => void = () => {}
    getCommitHistory.mockImplementationOnce(() => new Promise((r) => (resolveMore = r)))
    const pendingMore = useHistoryStore.getState().loadMore()

    // ...and an unrelated same-target refresh (e.g. a `.git` watcher event) runs and
    // resolves before the click's own response does.
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(101) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')
    expect(useHistoryStore.getState().commits).toHaveLength(100)

    // The click's own response finally resolves — it must still land, not be dropped.
    resolveMore({ ok: true, data: commits(101) })
    await pendingMore
    expect(useHistoryStore.getState().commits).toHaveLength(100)
    expect(useHistoryStore.getState().hasMore).toBe(true)
  })

  it('does not let a same-target refresh started BEFORE pagination revert the increased depth', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51) })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    // A same-target refresh starts first, at the OLD depth (50), and is held open...
    let resolveRefresh: (v: unknown) => void = () => {}
    getCommitHistory.mockImplementationOnce(() => new Promise((r) => (resolveRefresh = r)))
    const pendingRefresh = useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    // ...then the user clicks Load more, bumping the depth to 100 and fetching 101.
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(101) })
    await useHistoryStore.getState().loadMore()
    expect(useHistoryStore.getState().commits).toHaveLength(100)

    // The stale refresh (still carrying its OLD 51-commit response for depth 50)
    // finally resolves — it must NOT shrink the list back down to 50.
    resolveRefresh({ ok: true, data: commits(51) })
    await pendingRefresh

    expect(useHistoryStore.getState().commits).toHaveLength(100)
    expect(useHistoryStore.getState().visibleLimit).toBe(100)
  })

  it('drops a stale loadMore response after a repository switch and resets the new repo to 50', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51, 'a') })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    let resolveMore: (v: unknown) => void = () => {}
    getCommitHistory.mockImplementationOnce(() => new Promise((r) => (resolveMore = r)))
    const pendingMore = useHistoryStore.getState().loadMore()

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('b1')] })
    await useHistoryStore.getState().load(repoB.localPath, repoB, 'main')
    expect(useHistoryStore.getState().repoPath).toBe(repoB.localPath)
    expect(useHistoryStore.getState().visibleLimit).toBe(50)
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['b1'])

    // Repo A's stale pagination response must not corrupt repo B's state.
    resolveMore({ ok: true, data: commits(101, 'a') })
    await pendingMore
    expect(useHistoryStore.getState().repoPath).toBe(repoB.localPath)
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['b1'])
  })

  it('treats a branch change (same repo) as a target change that resets to 50', async () => {
    getCommitHistory.mockResolvedValueOnce({ ok: true, data: commits(51, 'm') })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'main')

    getCommitHistory.mockResolvedValueOnce({ ok: true, data: [commit('f1')] })
    await useHistoryStore.getState().load(repoA.localPath, repoA, 'feature')

    expect(useHistoryStore.getState().branch).toBe('feature')
    expect(useHistoryStore.getState().visibleLimit).toBe(50)
    expect(useHistoryStore.getState().commits.map((c) => c.fullHash)).toEqual(['f1'])
    expect(getCommitHistory).toHaveBeenLastCalledWith(repoA.localPath, 51, 0)
  })
})
