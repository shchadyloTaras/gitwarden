import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// refreshActiveRepo is a pure dispatcher over the other stores' own load()/refresh()
// methods — spy on those directly rather than mocking the whole IPC surface each of
// them would otherwise need.
vi.stubGlobal('window', { api: {} })

import { useAppStore } from '../../src/renderer/store/appStore'
import { useProfilesStore } from '../../src/renderer/store/profilesStore'
import { useBranchStore } from '../../src/renderer/store/branchStore'
import { useHeaderGuardStore } from '../../src/renderer/store/headerGuardStore'
import { useStatusStore } from '../../src/renderer/store/statusStore'
import { useCommitStore } from '../../src/renderer/store/commitStore'
import { useRemoteStore } from '../../src/renderer/store/remoteStore'
import { useHistoryStore } from '../../src/renderer/store/historyStore'
import { useSafetyCenterStore } from '../../src/renderer/store/safetyCenterStore'
import { refreshActiveRepo } from '../../src/renderer/store/refreshActiveRepo'

const repo: RepositoryRecord = { id: 'r1', name: 'r1', localPath: '/r1', isFavorite: false }

function spyResolved<T extends object>(
  store: { getState: () => T },
  key: keyof T
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(store.getState(), key as never).mockResolvedValue(undefined as never)
}

describe('refreshActiveRepo (Phase 90)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAppStore.setState({ activeRepo: repo, activeScreen: 'status' })
    useProfilesStore.setState({ profiles: [], activeProfileId: null })
  })

  it('does nothing when there is no active repo', async () => {
    useAppStore.setState({ activeRepo: null })
    const loadBranches = spyResolved(useBranchStore, 'load')

    await refreshActiveRepo()

    expect(loadBranches).not.toHaveBeenCalled()
  })

  it('always refreshes branches and the header guard, regardless of screen', async () => {
    const loadBranches = spyResolved(useBranchStore, 'load')
    const refreshGuard = spyResolved(useHeaderGuardStore, 'refresh')
    useAppStore.setState({ activeScreen: 'repositories' })

    await refreshActiveRepo()

    expect(loadBranches).toHaveBeenCalledWith('/r1', repo)
    expect(refreshGuard).toHaveBeenCalledWith('/r1', repo, null, [])
  })

  it('refreshes statusStore when on the Status screen', async () => {
    spyResolved(useBranchStore, 'load')
    spyResolved(useHeaderGuardStore, 'refresh')
    const loadStatus = spyResolved(useStatusStore, 'loadStatus')
    useAppStore.setState({ activeScreen: 'status' })

    await refreshActiveRepo()
    expect(loadStatus).toHaveBeenCalledWith('/r1')
  })

  it('refreshes commitStore when on the Commit screen', async () => {
    spyResolved(useBranchStore, 'load')
    spyResolved(useHeaderGuardStore, 'refresh')
    const loadCommit = spyResolved(useCommitStore, 'load')
    useAppStore.setState({ activeScreen: 'commit' })

    await refreshActiveRepo()
    expect(loadCommit).toHaveBeenCalledWith('/r1', repo)
  })

  it('refreshes remoteStore when on the Remote screen', async () => {
    spyResolved(useBranchStore, 'load')
    spyResolved(useHeaderGuardStore, 'refresh')
    const loadRemote = spyResolved(useRemoteStore, 'load')
    useAppStore.setState({ activeScreen: 'remote' })

    await refreshActiveRepo()
    expect(loadRemote).toHaveBeenCalledWith('/r1', repo)
  })

  it('refreshes historyStore when on the History screen', async () => {
    spyResolved(useBranchStore, 'load')
    spyResolved(useHeaderGuardStore, 'refresh')
    const loadHistory = spyResolved(useHistoryStore, 'load')
    useAppStore.setState({ activeScreen: 'history' })

    await refreshActiveRepo()
    expect(loadHistory).toHaveBeenCalledWith('/r1', repo)
  })

  it('refreshes safetyCenterStore when on the Safety Center screen', async () => {
    spyResolved(useBranchStore, 'load')
    spyResolved(useHeaderGuardStore, 'refresh')
    const loadSafety = spyResolved(useSafetyCenterStore, 'load')
    useAppStore.setState({ activeScreen: 'safety-center' })

    await refreshActiveRepo()
    expect(loadSafety).toHaveBeenCalledWith('/r1', repo, null, [])
  })

  it('does not double-refresh branches on the Branches screen (already covered above)', async () => {
    const loadBranches = spyResolved(useBranchStore, 'load')
    spyResolved(useHeaderGuardStore, 'refresh')
    useAppStore.setState({ activeScreen: 'branches' })

    await refreshActiveRepo()
    expect(loadBranches).toHaveBeenCalledTimes(1)
  })
})
