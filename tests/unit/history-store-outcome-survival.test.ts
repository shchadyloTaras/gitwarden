import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 102: returnSuccessMessage is an operation OUTCOME, not loaded data — load()
// must not wipe it on a same-repo refresh (a watcher event, focus revalidation), only
// on an actual repo change. Also proves returnLast/returnAllUnpushed actually SET it on
// success, naming the unpushed count for the "all" path.
const returnLastCommit = vi.hoisted(() => vi.fn())
const returnUnpushed = vi.hoisted(() => vi.fn())
const getCommitHistory = vi.hoisted(() => vi.fn())
const getReturnState = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: {
    git: { getCommitHistory },
    history: { returnLastCommit, returnUnpushed, getReturnState },
  },
})

import { useAppStore } from '../../src/renderer/store/appStore'
import { useHistoryStore } from '../../src/renderer/store/historyStore'

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

describe('historyStore operation-outcome survival (Phase 102)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHistoryStore.setState({
      repoPath: null,
      repository: null,
      returnSuccessMessage: null,
      unpushedCount: 0,
    })
    useAppStore.setState({ currentBranch: 'main' })
    getReturnState.mockResolvedValue({ ok: true, data: { eligibility: 'none', unpushedCount: 0 } })
    getCommitHistory.mockResolvedValue({ ok: true, data: [] })
  })

  it('returnSuccessMessage survives a same-repo load() a watcher event would trigger', async () => {
    await useHistoryStore.getState().load(repoA.localPath, repoA)
    useHistoryStore.setState({
      returnSuccessMessage: 'Returned the last commit to your working changes.',
    })

    await useHistoryStore.getState().load(repoA.localPath, repoA)

    expect(useHistoryStore.getState().returnSuccessMessage).toBe(
      'Returned the last commit to your working changes.'
    )
  })

  it('returnSuccessMessage clears on an actual repo change', async () => {
    await useHistoryStore.getState().load(repoA.localPath, repoA)
    useHistoryStore.setState({
      returnSuccessMessage: 'Returned the last commit to your working changes.',
    })

    await useHistoryStore.getState().load(repoB.localPath, repoB)

    expect(useHistoryStore.getState().returnSuccessMessage).toBeNull()
  })

  it('returnLast sets returnSuccessMessage on success', async () => {
    useHistoryStore.setState({ repoPath: repoA.localPath, repository: repoA })
    returnLastCommit.mockResolvedValue({ ok: true, data: { ok: true } })

    await useHistoryStore.getState().returnLast()

    expect(useHistoryStore.getState().returnSuccessMessage).toBe(
      'Returned the last commit to your working changes.'
    )
  })

  it('returnAllUnpushed sets returnSuccessMessage naming the unpushed count', async () => {
    useHistoryStore.setState({ repoPath: repoA.localPath, repository: repoA, unpushedCount: 3 })
    returnUnpushed.mockResolvedValue({ ok: true, data: { ok: true } })

    await useHistoryStore.getState().returnAllUnpushed()

    expect(useHistoryStore.getState().returnSuccessMessage).toBe(
      'Returned 3 unpushed commits to your working changes.'
    )
  })

  it('does not set returnSuccessMessage on a refusal', async () => {
    useHistoryStore.setState({ repoPath: repoA.localPath, repository: repoA })
    returnLastCommit.mockResolvedValue({ ok: true, data: { ok: false, message: 'refused' } })

    await useHistoryStore.getState().returnLast()

    expect(useHistoryStore.getState().returnSuccessMessage).toBeNull()
    expect(useHistoryStore.getState().returnError).toBe('refused')
  })
})
