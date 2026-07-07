import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 89: branchStore.load must drop a superseded response, reset an armed
// destructive confirm / stale merge conflict on repo switch (W5, W16), and doSwitch /
// doCreate / doDelete / doMerge's refreshBranches() results must be dropped when a
// newer request (a load() or another branch action) has since superseded them.
const getBranches = vi.hoisted(() => vi.fn())
const switchBranch = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { git: { getBranches, switchBranch } } })

import { useBranchStore } from '../../src/renderer/store/branchStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }
const repo2: RepositoryRecord = {
  id: 'r2',
  name: 'repo2',
  localPath: '/tmp/repo2',
  isFavorite: false,
}

const branch = (name: string, isCurrent = false) => ({ name, isCurrent, worktreePath: undefined })

describe('branchStore load hygiene (W5, W16)', () => {
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
  })

  it('clears an armed delete/merge confirm and a stale merge conflict on load()', async () => {
    useBranchStore.setState({
      deleteConfirmBranch: 'old-branch',
      mergeConfirmBranch: 'other-branch',
      mergeConflict: { message: 'conflict' },
    })
    getBranches.mockResolvedValue({ ok: true, data: [branch('main', true)] })

    await useBranchStore.getState().load(repo.localPath, repo)

    expect(useBranchStore.getState().deleteConfirmBranch).toBeNull()
    expect(useBranchStore.getState().mergeConfirmBranch).toBeNull()
    expect(useBranchStore.getState().mergeConflict).toBeNull()
  })
})

describe('branchStore stale-request guard (Phase 89)', () => {
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
  })

  it('drops a load() result that resolves after a newer load() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    getBranches.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const pendingA = useBranchStore.getState().load(repo.localPath, repo)

    getBranches.mockResolvedValueOnce({ ok: true, data: [branch('dev', true)] })
    const pendingB = useBranchStore.getState().load(repo2.localPath, repo2)
    await pendingB
    expect(useBranchStore.getState().repository?.id).toBe('r2')
    expect(useBranchStore.getState().branches.map((b) => b.name)).toEqual(['dev'])

    resolveA({ ok: true, data: [branch('stale', true)] })
    await pendingA
    expect(useBranchStore.getState().repository?.id).toBe('r2')
    expect(useBranchStore.getState().branches.map((b) => b.name)).toEqual(['dev'])
  })

  it('drops a doSwitch() refreshBranches() result superseded by a newer load()', async () => {
    getBranches.mockResolvedValue({ ok: true, data: [branch('main', true), branch('dev')] })
    await useBranchStore.getState().load(repo.localPath, repo)

    switchBranch.mockResolvedValueOnce({ ok: true })
    // Key the mock by which repo it was called for (not call order) — doSwitch's
    // refreshBranches() and the new load() both call getBranches, and their relative
    // timing depends on microtask interleaving, not source order.
    let resolveSwitchRefresh: (v: unknown) => void = () => {}
    getBranches.mockImplementation((path: string) =>
      path === repo.localPath
        ? new Promise((r) => (resolveSwitchRefresh = r))
        : Promise.resolve({ ok: true, data: [branch('feature', true)] })
    )
    const pendingSwitch = useBranchStore.getState().doSwitch('dev')

    // A fresh load() (e.g. the user switched repos) supersedes the in-flight switch.
    await useBranchStore.getState().load(repo2.localPath, repo2)

    resolveSwitchRefresh({ ok: true, data: [branch('dev', true), branch('main')] })
    await pendingSwitch
    // repo2's freshly loaded branches must not be clobbered by the stale switch result.
    expect(useBranchStore.getState().branches.map((b) => b.name)).toEqual(['feature'])
    expect(useBranchStore.getState().successMessage).toBeNull()
  })
})
