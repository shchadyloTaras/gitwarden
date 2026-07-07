import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 92 (W6/W27): branchStore.doDelete calls the SAFE git:deleteBranch channel; a
// branchNotMerged refusal escalates to forceDeleteConfirmBranch instead of a plain
// error — the second, visibly stronger confirm is reachable ONLY through that state.
// doForceDelete is the separate escalated action, calling git:forceDeleteBranch.
const getBranches = vi.hoisted(() => vi.fn())
const deleteBranch = vi.hoisted(() => vi.fn())
const forceDeleteBranch = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getBranches, deleteBranch, forceDeleteBranch } },
})

import { useBranchStore } from '../../src/renderer/store/branchStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }
const branch = (name: string, isCurrent = false) => ({ name, isCurrent, isRemote: false })

function resetStore(): void {
  useBranchStore.setState({
    repoPath: repo.localPath,
    repository: repo,
    branches: [branch('main', true), branch('unmerged-work')],
    loading: false,
    error: null,
    successMessage: null,
    deleteConfirmBranch: null,
    forceDeleteConfirmBranch: null,
    mergeConfirmBranch: null,
    mergeConflict: null,
  })
}

describe('branchStore safe delete + escalated force delete (Phase 92)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    getBranches.mockResolvedValue({ ok: true, data: [branch('main', true)] })
  })

  it('doDelete calls the safe deleteBranch channel, not forceDeleteBranch', async () => {
    deleteBranch.mockResolvedValue({ ok: true })

    await useBranchStore.getState().doDelete('merged-branch')

    expect(deleteBranch).toHaveBeenCalledWith(repo.localPath, 'merged-branch')
    expect(forceDeleteBranch).not.toHaveBeenCalled()
    expect(useBranchStore.getState().successMessage).toContain('merged-branch')
  })

  it('escalates to forceDeleteConfirmBranch on a branchNotMerged refusal (no plain error)', async () => {
    deleteBranch.mockResolvedValue({
      ok: false,
      error: 'This branch has commits that exist nowhere else.',
      code: 'branchNotMerged',
    })

    await useBranchStore.getState().doDelete('unmerged-work')

    expect(useBranchStore.getState().forceDeleteConfirmBranch).toBe('unmerged-work')
    expect(useBranchStore.getState().error).toBeNull()
  })

  it('a non-branchNotMerged failure surfaces as a plain error, not an escalation', async () => {
    deleteBranch.mockResolvedValue({
      ok: false,
      error: 'branch not found',
      code: 'branchNotFound',
    })

    await useBranchStore.getState().doDelete('already-gone')

    expect(useBranchStore.getState().forceDeleteConfirmBranch).toBeNull()
    expect(useBranchStore.getState().error).toBe('branch not found')
  })

  it('doForceDelete calls the escalated channel and clears the confirm on success', async () => {
    useBranchStore.setState({ forceDeleteConfirmBranch: 'unmerged-work' })
    forceDeleteBranch.mockResolvedValue({ ok: true })

    await useBranchStore.getState().doForceDelete('unmerged-work')

    expect(forceDeleteBranch).toHaveBeenCalledWith(repo.localPath, 'unmerged-work')
    expect(useBranchStore.getState().forceDeleteConfirmBranch).toBeNull()
    expect(useBranchStore.getState().successMessage).toContain('unmerged-work')
  })

  it('load() resets an armed forceDeleteConfirmBranch (W5/W16-style hygiene)', async () => {
    useBranchStore.setState({ forceDeleteConfirmBranch: 'unmerged-work' })
    getBranches.mockResolvedValue({ ok: true, data: [branch('main', true)] })

    await useBranchStore.getState().load(repo.localPath, repo)

    expect(useBranchStore.getState().forceDeleteConfirmBranch).toBeNull()
  })

  it('clear() resets forceDeleteConfirmBranch', () => {
    useBranchStore.setState({ forceDeleteConfirmBranch: 'unmerged-work' })
    useBranchStore.getState().clear()
    expect(useBranchStore.getState().forceDeleteConfirmBranch).toBeNull()
  })
})
