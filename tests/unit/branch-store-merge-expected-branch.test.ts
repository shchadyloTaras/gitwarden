import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 91 (W8): branchStore.doMerge must pass the genuinely-observed current branch
// as expectedTargetBranch — never the `?? branch` fallback used for the success
// message, which would ask the main process to verify HEAD equals the branch being
// merged IN (never true).
const getBranches = vi.hoisted(() => vi.fn())
const merge = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { git: { getBranches, merge } } })

import { useBranchStore } from '../../src/renderer/store/branchStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }

const branch = (name: string, isCurrent = false) => ({ name, isCurrent, isRemote: false })

describe('branchStore.doMerge passes expectedTargetBranch (Phase 91, W8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBranchStore.setState({
      repoPath: null,
      repository: null,
      branches: [],
      loading: false,
      error: null,
      successMessage: null,
      deleteConfirmBranch: null,
      mergeConfirmBranch: null,
      mergeConflict: null,
    })
    merge.mockResolvedValue({ ok: true })
    getBranches.mockResolvedValue({ ok: true, data: [] })
  })

  it('passes the real current branch name as the third argument', async () => {
    getBranches.mockResolvedValueOnce({
      ok: true,
      data: [branch('main', true), branch('feature')],
    })
    await useBranchStore.getState().load(repo.localPath, repo)

    await useBranchStore.getState().doMerge('feature')

    expect(merge).toHaveBeenCalledWith(repo.localPath, 'feature', 'main')
  })

  it('passes undefined (not the merged-in branch) when no isCurrent branch is found', async () => {
    // e.g. a stale/empty branches list — the store must never fall back to the
    // branch being merged in as the "expected current" branch.
    getBranches.mockResolvedValueOnce({ ok: true, data: [branch('feature')] })
    await useBranchStore.getState().load(repo.localPath, repo)

    await useBranchStore.getState().doMerge('feature')

    expect(merge).toHaveBeenCalledWith(repo.localPath, 'feature', undefined)
  })

  it('still shows the success message with a sensible branch name even when expectedTargetBranch was undefined', async () => {
    getBranches.mockResolvedValueOnce({ ok: true, data: [] })
    await useBranchStore.getState().load(repo.localPath, repo)

    await useBranchStore.getState().doMerge('feature')

    expect(useBranchStore.getState().successMessage).toContain('feature')
  })
})
