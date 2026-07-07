import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 91: doPull passes appStore.currentBranch as expectedHeadBranch (wave-1 #2), and
// doRemotePush pins remote/branch into lastFailure on every failure path (W21) —
// matching doPull's existing behavior.
const pull = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { git: { pull, push, getStatus } } })

import { useAppStore } from '../../src/renderer/store/appStore'
import { useRemoteStore } from '../../src/renderer/store/remoteStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }

describe('remoteStore.doPull passes expectedHeadBranch (Phase 91)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRemoteStore.setState({ repoPath: repo.localPath, repository: repo })
    useAppStore.setState({ currentBranch: 'main' })
  })

  it('passes appStore.currentBranch as the 4th argument', async () => {
    pull.mockResolvedValue({ ok: true })
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })

    await useRemoteStore.getState().doPull('origin', 'main')

    expect(pull).toHaveBeenCalledWith(repo.localPath, 'origin', 'main', 'main')
  })

  it('passes undefined when appStore has no current branch', async () => {
    useAppStore.setState({ currentBranch: null })
    pull.mockResolvedValue({ ok: true })
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })

    await useRemoteStore.getState().doPull('origin', 'main')

    expect(pull).toHaveBeenCalledWith(repo.localPath, 'origin', 'main', undefined)
  })

  it('surfaces the main-process HEAD-moved refusal like any other pull failure', async () => {
    pull.mockResolvedValue({ ok: false, error: 'The branch changed since you started this.' })

    await useRemoteStore.getState().doPull('origin', 'main')

    expect(useRemoteStore.getState().error).toBe('The branch changed since you started this.')
  })
})

describe('remoteStore.doRemotePush pins remote/branch into lastFailure (Phase 91, W21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRemoteStore.setState({ repoPath: repo.localPath, repository: repo })
  })

  it('pins remote/branch on a structured push failure', async () => {
    push.mockResolvedValue({ ok: false, error: 'rejected', code: 'rejectedNonFastForward' })

    await useRemoteStore.getState().doRemotePush('origin', 'feature')

    expect(useRemoteStore.getState().lastFailure).toMatchObject({
      message: 'rejected',
      code: 'rejectedNonFastForward',
      remote: 'origin',
      branch: 'feature',
    })
  })

  it('pins remote/branch on a thrown/unexpected push failure', async () => {
    push.mockRejectedValue(new Error('network down'))

    await useRemoteStore.getState().doRemotePush('origin', 'feature')

    expect(useRemoteStore.getState().lastFailure).toMatchObject({
      message: 'network down',
      remote: 'origin',
      branch: 'feature',
    })
  })
})
