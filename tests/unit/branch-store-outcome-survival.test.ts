import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 102: successMessage/mergeConflict/switchError/stashPopConflict are operation
// OUTCOMES, not loaded data — load() must not wipe them on a same-repo refresh (a
// watcher event, focus revalidation), only on an actual repo change. An armed
// destructive confirm (deleteConfirmBranch etc.) is NOT an outcome and keeps resetting
// unconditionally on every load(), matching its pre-existing W5/W16 behavior.
const getBranches = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { git: { getBranches } } })

import { useAppStore } from '../../src/renderer/store/appStore'
import { useBranchStore } from '../../src/renderer/store/branchStore'

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
const branch = (name: string, isCurrent = false) => ({ name, isCurrent, isRemote: false })

describe('branchStore operation-outcome survival (Phase 102)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBranches.mockResolvedValue({ ok: true, data: [branch('main', true)] })
    useBranchStore.setState({
      repoPath: null,
      repository: null,
      branches: [],
      successMessage: null,
      mergeConflict: null,
      switchError: null,
      stashPopConflict: null,
      deleteConfirmBranch: null,
    })
    useAppStore.setState({ currentBranch: null })
  })

  it('successMessage survives a same-repo load() a watcher event would trigger', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({ successMessage: 'Switched to dev.' })

    await useBranchStore.getState().load(repoA.localPath, repoA)

    expect(useBranchStore.getState().successMessage).toBe('Switched to dev.')
  })

  it('successMessage clears on an actual repo change', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({ successMessage: 'Switched to dev.' })

    await useBranchStore.getState().load(repoB.localPath, repoB)

    expect(useBranchStore.getState().successMessage).toBeNull()
  })

  it('mergeConflict survives a same-repo load()', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({ mergeConflict: { message: 'conflict' } })

    await useBranchStore.getState().load(repoA.localPath, repoA)

    expect(useBranchStore.getState().mergeConflict).toEqual({ message: 'conflict' })
  })

  it('mergeConflict clears on an actual repo change', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({ mergeConflict: { message: 'conflict' } })

    await useBranchStore.getState().load(repoB.localPath, repoB)

    expect(useBranchStore.getState().mergeConflict).toBeNull()
  })

  it('switchError survives a same-repo load()', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({ switchError: { branch: 'dev', message: 'boom' } })

    await useBranchStore.getState().load(repoA.localPath, repoA)

    expect(useBranchStore.getState().switchError).toEqual({ branch: 'dev', message: 'boom' })
  })

  it('switchError clears on an actual repo change', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({ switchError: { branch: 'dev', message: 'boom' } })

    await useBranchStore.getState().load(repoB.localPath, repoB)

    expect(useBranchStore.getState().switchError).toBeNull()
  })

  it('stashPopConflict survives a same-repo load()', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({
      stashPopConflict: { branch: 'dev', message: 'conflict', stashRef: 'stash@{0}' },
    })

    await useBranchStore.getState().load(repoA.localPath, repoA)

    expect(useBranchStore.getState().stashPopConflict).toEqual({
      branch: 'dev',
      message: 'conflict',
      stashRef: 'stash@{0}',
    })
  })

  it('stashPopConflict clears on an actual repo change', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({
      stashPopConflict: { branch: 'dev', message: 'conflict', stashRef: 'stash@{0}' },
    })

    await useBranchStore.getState().load(repoB.localPath, repoB)

    expect(useBranchStore.getState().stashPopConflict).toBeNull()
  })

  it('an armed destructive confirm still resets even on a same-repo refresh (unchanged behavior)', async () => {
    await useBranchStore.getState().load(repoA.localPath, repoA)
    useBranchStore.setState({ deleteConfirmBranch: 'dev' })

    await useBranchStore.getState().load(repoA.localPath, repoA)

    expect(useBranchStore.getState().deleteConfirmBranch).toBeNull()
  })
})
