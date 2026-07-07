import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 93 (fix B, W3, #13): doSwitch/doSwitchBringChanges are non-reentrant while
// `switching` is true, failures land in `switchError` (tagged with the branch they're
// FOR) instead of the generic `error` field, and the stash quick-fix never
// auto-resolves a pop conflict — it routes the user to Status instead.
const getBranches = vi.hoisted(() => vi.fn())
const switchBranch = vi.hoisted(() => vi.fn())
const stashSwitchPop = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getBranches, switchBranch, stashSwitchPop } },
})

import { useAppStore } from '../../src/renderer/store/appStore'
import { useBranchStore } from '../../src/renderer/store/branchStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }
const branch = (name: string, isCurrent = false) => ({ name, isCurrent, isRemote: false })

function resetStore(): void {
  useBranchStore.setState({
    repoPath: repo.localPath,
    repository: repo,
    branches: [branch('main', true), branch('dev')],
    loading: false,
    error: null,
    successMessage: null,
    deleteConfirmBranch: null,
    forceDeleteConfirmBranch: null,
    mergeConfirmBranch: null,
    mergeConflict: null,
    switching: false,
    switchError: null,
  })
  useAppStore.setState({ currentBranch: 'main' })
}

describe('branchStore switch UX (Phase 93)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
    getBranches.mockResolvedValue({ ok: true, data: [branch('dev', true), branch('main')] })
  })

  it('ignores a second doSwitch call while one is already in flight (fix B)', async () => {
    let resolveSwitch: (v: unknown) => void = () => {}
    switchBranch.mockImplementationOnce(() => new Promise((r) => (resolveSwitch = r)))

    const first = useBranchStore.getState().doSwitch('dev')
    expect(useBranchStore.getState().switching).toBe(true)

    // A rapid second pick while the first is in flight must be a no-op.
    await useBranchStore.getState().doSwitch('main')
    expect(switchBranch).toHaveBeenCalledTimes(1)

    resolveSwitch({ ok: true })
    await first
    expect(useBranchStore.getState().switching).toBe(false)
  })

  it('a switch failure lands in switchError tagged with the branch, not error', async () => {
    switchBranch.mockResolvedValue({ ok: false, error: 'You have uncommitted changes.' })

    await useBranchStore.getState().doSwitch('dev')

    expect(useBranchStore.getState().switchError).toEqual({
      branch: 'dev',
      message: 'You have uncommitted changes.',
    })
    expect(useBranchStore.getState().error).toBeNull()
    expect(useBranchStore.getState().switching).toBe(false)
  })

  it('clears switching in finally even when switchBranch rejects', async () => {
    switchBranch.mockRejectedValue(new Error('boom'))

    await useBranchStore.getState().doSwitch('dev')

    expect(useBranchStore.getState().switching).toBe(false)
    expect(useBranchStore.getState().switchError).toEqual({ branch: 'dev', message: 'boom' })
  })

  it('a successful switch clears any previous switchError and updates currentBranch', async () => {
    useBranchStore.setState({ switchError: { branch: 'other', message: 'stale' } })
    switchBranch.mockResolvedValue({ ok: true })

    await useBranchStore.getState().doSwitch('dev')

    expect(useAppStore.getState().currentBranch).toBe('dev')
    expect(useBranchStore.getState().switchError).toBeNull()
    expect(useBranchStore.getState().successMessage).toContain('dev')
  })

  it('clearSwitchError clears the field', () => {
    useBranchStore.setState({ switchError: { branch: 'dev', message: 'nope' } })
    useBranchStore.getState().clearSwitchError()
    expect(useBranchStore.getState().switchError).toBeNull()
  })

  it('doSwitchBringChanges calls stashSwitchPop and succeeds like a normal switch', async () => {
    stashSwitchPop.mockResolvedValue({ ok: true, data: { ok: true } })

    await useBranchStore.getState().doSwitchBringChanges('dev')

    expect(stashSwitchPop).toHaveBeenCalledWith(repo.localPath, 'dev')
    expect(useAppStore.getState().currentBranch).toBe('dev')
    expect(useBranchStore.getState().switchError).toBeNull()
    expect(useBranchStore.getState().successMessage).toContain('dev')
    expect(useBranchStore.getState().switching).toBe(false)
  })

  it('never auto-resolves a stash-pop conflict — routes to Status, keeps switchError', async () => {
    stashSwitchPop.mockResolvedValue({
      ok: true,
      data: { ok: false, message: 'Bringing your changes back caused a conflict.' },
    })
    const navigate = vi.spyOn(useAppStore.getState(), 'navigate')

    await useBranchStore.getState().doSwitchBringChanges('dev')

    expect(useBranchStore.getState().switchError).toEqual({
      branch: 'dev',
      message: 'Bringing your changes back caused a conflict.',
    })
    // The switch itself succeeded (git already moved HEAD) — currentBranch reflects that.
    expect(useAppStore.getState().currentBranch).toBe('dev')
    expect(navigate).toHaveBeenCalledWith('status')
    expect(useBranchStore.getState().switching).toBe(false)
  })

  it('doSwitchBringChanges ignores a second call while one is already in flight', async () => {
    let resolvePop: (v: unknown) => void = () => {}
    stashSwitchPop.mockImplementationOnce(() => new Promise((r) => (resolvePop = r)))

    const first = useBranchStore.getState().doSwitchBringChanges('dev')
    expect(useBranchStore.getState().switching).toBe(true)

    await useBranchStore.getState().doSwitchBringChanges('main')
    expect(stashSwitchPop).toHaveBeenCalledTimes(1)

    resolvePop({ ok: true, data: { ok: true } })
    await first
  })
})
