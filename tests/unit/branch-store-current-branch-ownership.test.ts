import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 90: branchStore is the SOLE writer of appStore.currentBranch. Every load() must
// assert the truth — a real name, or null when no isCurrent branch is found (the
// previously-current branch was deleted/renamed away elsewhere, or HEAD is detached) —
// audit #4. A stale name must never survive.
const getBranches = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { git: { getBranches } } })

import { useAppStore } from '../../src/renderer/store/appStore'
import { useBranchStore } from '../../src/renderer/store/branchStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }

describe('branchStore is the sole writer of appStore.currentBranch (Phase 90, #4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({ currentBranch: 'stale-branch' })
    useBranchStore.setState({ repoPath: null, repository: null, branches: [] })
  })

  it('sets currentBranch to the real isCurrent branch name on a successful load', async () => {
    getBranches.mockResolvedValue({
      ok: true,
      data: [{ name: 'main', isCurrent: true, isRemote: false }],
    })

    await useBranchStore.getState().load(repo.localPath, repo)

    expect(useAppStore.getState().currentBranch).toBe('main')
  })

  it('clears currentBranch to null when no isCurrent branch is found (deleted/renamed/detached)', async () => {
    getBranches.mockResolvedValue({
      ok: true,
      data: [{ name: 'other', isCurrent: false, isRemote: false }],
    })

    await useBranchStore.getState().load(repo.localPath, repo)

    // The previously-shown 'stale-branch' must not survive just because nothing came
    // back matching it — a fresh load found NO current branch, and that's the truth.
    expect(useAppStore.getState().currentBranch).toBeNull()
  })

  it('clears currentBranch to null when the branch list is empty', async () => {
    getBranches.mockResolvedValue({ ok: true, data: [] })

    await useBranchStore.getState().load(repo.localPath, repo)

    expect(useAppStore.getState().currentBranch).toBeNull()
  })
})
