import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 95 (W25): doFetch's only observable effect used to be a toast — a fetch can
// move remote-tracking refs (ahead/behind, upstream status) and pull in new incoming
// commits, so a successful fetch must reload remoteStore itself and nudge
// branchStore/historyStore, not just report success.
const fetchMock = vi.hoisted(() => vi.fn())
const getRemotes = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
const getEffectiveIdentity = vi.hoisted(() => vi.fn())
const getBranches = vi.hoisted(() => vi.fn())
const getCommitHistory = vi.hoisted(() => vi.fn())
const getReturnState = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: {
    git: {
      fetch: fetchMock,
      getRemotes,
      getStatus,
      getEffectiveIdentity,
      getBranches,
      getCommitHistory,
    },
    history: { getReturnState },
  },
})

import { useRemoteStore } from '../../src/renderer/store/remoteStore'
import { useBranchStore } from '../../src/renderer/store/branchStore'
import { useHistoryStore } from '../../src/renderer/store/historyStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }
const repo2: RepositoryRecord = {
  id: 'r2',
  name: 'repo2',
  localPath: '/tmp/repo2',
  isFavorite: false,
}

describe('remoteStore doFetch refresh routing (Phase 95, W25)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRemoteStore.setState({
      repoPath: repo.localPath,
      repository: repo,
      remotes: [],
      upstream: null,
      upstreamGone: false,
      identity: null,
      error: null,
      successMessage: null,
      lastFailure: null,
    })
    useBranchStore.setState({ repoPath: repo.localPath, repository: repo, branches: [] })
    useHistoryStore.setState({ repoPath: repo.localPath, repository: repo, commits: [] })
    fetchMock.mockResolvedValue({ ok: true })
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })
    getEffectiveIdentity.mockResolvedValue({ ok: true, data: {} })
    getBranches.mockResolvedValue({ ok: true, data: [{ name: 'main', isCurrent: true }] })
    getCommitHistory.mockResolvedValue({ ok: true, data: [] })
    getReturnState.mockResolvedValue({ ok: true, data: { eligibility: 'none', unpushedCount: 0 } })
  })

  it('a successful fetch reloads remoteStore itself and nudges branch/history stores', async () => {
    await useRemoteStore.getState().doFetch('origin')

    expect(getRemotes).toHaveBeenCalledWith(repo.localPath)
    expect(getBranches).toHaveBeenCalledWith(repo.localPath)
    expect(getCommitHistory).toHaveBeenCalledWith(repo.localPath, expect.any(Number), 0)
    expect(useRemoteStore.getState().successMessage).toBe('Fetched from origin.')
  })

  it('the success message survives the reload (load() resets it, but the fetch message is set after)', async () => {
    await useRemoteStore.getState().doFetch('origin')
    expect(useRemoteStore.getState().successMessage).toBe('Fetched from origin.')
  })

  it('does not reload anything if the fetch itself failed', async () => {
    fetchMock.mockResolvedValue({ ok: false, error: 'network unreachable' })

    await useRemoteStore.getState().doFetch('origin')

    expect(getBranches).not.toHaveBeenCalled()
    expect(getCommitHistory).not.toHaveBeenCalled()
    expect(useRemoteStore.getState().error).toBe('network unreachable')
  })

  it('does not clobber a different repo the user switched to while the fetch was in flight', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((r) => (resolveFetch = r)))
    const pending = useRemoteStore.getState().doFetch('origin')

    // The user switches to repo2 (a fresh load()) while the fetch is still in flight.
    await useRemoteStore.getState().load(repo2.localPath, repo2)
    vi.clearAllMocks()
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })
    getEffectiveIdentity.mockResolvedValue({ ok: true, data: {} })

    resolveFetch({ ok: true })
    await pending

    // The stale fetch's reload must not have fired against repo2's now-active state.
    expect(getBranches).not.toHaveBeenCalled()
    expect(getCommitHistory).not.toHaveBeenCalled()
    expect(useRemoteStore.getState().repository?.id).toBe('r2')
  })
})
