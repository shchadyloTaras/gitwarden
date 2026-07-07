import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// remoteStore reads the live branch via window.api.git.getStatus on load/pull, and
// reconciles appStore.currentBranch THROUGH branchStore (the sole writer, Phase 90) —
// so branchStore's own getBranches call must be mocked too.
const getRemotes = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
const getEffectiveIdentity = vi.hoisted(() => vi.fn())
const pull = vi.hoisted(() => vi.fn())
const getBranches = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getRemotes, getStatus, getEffectiveIdentity, pull, getBranches } },
})

import { useAppStore } from '../../src/renderer/store/appStore'
import { useRemoteStore } from '../../src/renderer/store/remoteStore'
import { useBranchStore } from '../../src/renderer/store/branchStore'

const repo: RepositoryRecord = {
  id: 'r1',
  name: 'repo',
  localPath: '/tmp/repo',
  isFavorite: false,
}

const branch = (name: string) => ({ name, isCurrent: true, isRemote: false })

describe('remoteStore reconciles appStore.currentBranch THROUGH branchStore (no stale-branch desync)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getEffectiveIdentity.mockResolvedValue({ ok: true, data: {} })
    getBranches.mockResolvedValue({ ok: true, data: [] })
    // Header/Context panel start on a stale branch — exactly the screenshot's state.
    useAppStore.setState({ currentBranch: 'main' })
    useBranchStore.setState({ repoPath: null, repository: null, branches: [] })
  })

  it('load() reconciles appStore via branchStore when the live branch disagrees', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'seo-audit-fixes' } })
    getBranches.mockResolvedValue({ ok: true, data: [branch('seo-audit-fixes')] })

    await useRemoteStore.getState().load(repo.localPath, repo)

    // remoteStore itself never writes appStore.currentBranch — it hands off to
    // branchStore, which is the only reason this ends up correct.
    expect(getBranches).toHaveBeenCalledWith(repo.localPath)
    expect(useAppStore.getState().currentBranch).toBe('seo-audit-fixes')
    expect(useBranchStore.getState().branches.map((b) => b.name)).toEqual(['seo-audit-fixes'])
  })

  it('load() does not touch branchStore when the live branch already matches appStore', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })

    await useRemoteStore.getState().load(repo.localPath, repo)

    expect(getBranches).not.toHaveBeenCalled()
    expect(useAppStore.getState().currentBranch).toBe('main')
  })

  it('doPull() re-syncs appStore (via branchStore) from the post-pull live branch', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'seo-audit-fixes' } })
    getBranches.mockResolvedValue({ ok: true, data: [branch('seo-audit-fixes')] })
    pull.mockResolvedValue({ ok: true })
    useRemoteStore.setState({ repoPath: repo.localPath, repository: repo })

    await useRemoteStore.getState().doPull('origin', 'seo-audit-fixes')

    expect(useAppStore.getState().currentBranch).toBe('seo-audit-fixes')
  })

  it('does not overwrite appStore with null when git status is unavailable', async () => {
    getStatus.mockResolvedValue({ ok: false, error: 'boom' })

    await useRemoteStore.getState().load(repo.localPath, repo)

    // appStore keeps its prior value rather than being blanked to null.
    expect(useAppStore.getState().currentBranch).toBe('main')
    expect(getBranches).not.toHaveBeenCalled()
  })
})
