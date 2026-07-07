import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 97: doCreate reports success (W31 — BranchesScreen only clears the typed
// name then, never on a rejected name), and doPruneWorktrees clears a stale
// worktree registration (W22).
const getBranches = vi.hoisted(() => vi.fn())
const createBranch = vi.hoisted(() => vi.fn())
const pruneWorktrees = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getBranches, createBranch, pruneWorktrees } },
})

import { useBranchStore } from '../../src/renderer/store/branchStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }
const branch = (name: string, isCurrent = false) => ({ name, isCurrent, isRemote: false })

function resetStore(): void {
  useBranchStore.setState({
    repoPath: repo.localPath,
    repository: repo,
    branches: [branch('main', true)],
    loading: false,
    error: null,
    successMessage: null,
  })
}

describe('branchStore doCreate return value (Phase 97, W31)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it('returns true on a successful create', async () => {
    createBranch.mockResolvedValue({ ok: true })
    getBranches.mockResolvedValue({ ok: true, data: [branch('feature', true), branch('main')] })

    const result = await useBranchStore.getState().doCreate('feature')

    expect(result).toBe(true)
    expect(useBranchStore.getState().successMessage).toContain('feature')
  })

  it('returns false when the name is rejected — error is set, not a success', async () => {
    createBranch.mockResolvedValue({ ok: false, error: 'A branch named "main" already exists.' })

    const result = await useBranchStore.getState().doCreate('main')

    expect(result).toBe(false)
    expect(useBranchStore.getState().error).toBe('A branch named "main" already exists.')
    expect(useBranchStore.getState().successMessage).toBeNull()
  })

  it('returns false when there is no active repo', async () => {
    useBranchStore.setState({ repoPath: null, repository: null })

    const result = await useBranchStore.getState().doCreate('feature')

    expect(result).toBe(false)
    expect(createBranch).not.toHaveBeenCalled()
  })
})

describe('branchStore doPruneWorktrees (Phase 97, W22)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it('prunes and reloads branches on success', async () => {
    pruneWorktrees.mockResolvedValue({ ok: true })
    getBranches.mockResolvedValue({ ok: true, data: [branch('main', true)] })

    await useBranchStore.getState().doPruneWorktrees()

    expect(pruneWorktrees).toHaveBeenCalledWith(repo.localPath)
    expect(getBranches).toHaveBeenCalledWith(repo.localPath)
    expect(useBranchStore.getState().successMessage).toContain('stale worktree')
  })

  it('surfaces a failure as a plain error', async () => {
    pruneWorktrees.mockResolvedValue({ ok: false, error: 'prune failed' })

    await useBranchStore.getState().doPruneWorktrees()

    expect(useBranchStore.getState().error).toBe('prune failed')
  })

  it('is a no-op with no active repo', async () => {
    useBranchStore.setState({ repoPath: null, repository: null })

    await useBranchStore.getState().doPruneWorktrees()

    expect(pruneWorktrees).not.toHaveBeenCalled()
  })
})
