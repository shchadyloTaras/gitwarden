import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 91 (W1): historyStore.returnLast/returnAllUnpushed pass appStore.currentBranch
// as expectedHeadBranch so the main-process compound job can refuse on a moved HEAD.
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

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }

describe('historyStore passes expectedHeadBranch on return actions (Phase 91)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHistoryStore.setState({ repoPath: repo.localPath, repository: repo })
    useAppStore.setState({ currentBranch: 'main' })
    getReturnState.mockResolvedValue({
      ok: true,
      data: { eligibility: 'none', unpushedCount: 0 },
    })
    getCommitHistory.mockResolvedValue({ ok: true, data: [] })
  })

  it('returnLast passes appStore.currentBranch as the 2nd argument', async () => {
    returnLastCommit.mockResolvedValue({ ok: true, data: { ok: true } })

    await useHistoryStore.getState().returnLast()

    expect(returnLastCommit).toHaveBeenCalledWith(repo.localPath, 'main')
  })

  it('returnAllUnpushed passes appStore.currentBranch as the 2nd argument', async () => {
    returnUnpushed.mockResolvedValue({ ok: true, data: { ok: true } })

    await useHistoryStore.getState().returnAllUnpushed()

    expect(returnUnpushed).toHaveBeenCalledWith(repo.localPath, 'main')
  })

  it('passes undefined when appStore has no current branch', async () => {
    useAppStore.setState({ currentBranch: null })
    returnLastCommit.mockResolvedValue({ ok: true, data: { ok: true } })

    await useHistoryStore.getState().returnLast()

    expect(returnLastCommit).toHaveBeenCalledWith(repo.localPath, undefined)
  })

  it('surfaces the main-process HEAD-moved refusal as a returnError, without navigating away', async () => {
    returnLastCommit.mockResolvedValue({
      ok: true,
      data: { ok: false, message: 'The branch changed since you opened this.' },
    })
    const navigate = vi.spyOn(useAppStore.getState(), 'navigate')

    await useHistoryStore.getState().returnLast()

    expect(useHistoryStore.getState().returnError).toBe('The branch changed since you opened this.')
    expect(navigate).not.toHaveBeenCalled()
  })
})
