import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// commitAndPushStore.confirm() drives the REAL commitStore/remoteStore (finding 6/8 —
// their existing committedHash/successMessage/lastFailure machinery must keep working
// unchanged), so only window.api.git is stubbed here, matching the other renderer-store
// unit tests' convention (e.g. remote-store-expected-head-branch.test.ts).
const commit = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { git: { commit, push, getStatus } } })

import { useCommitStore } from '../../src/renderer/store/commitStore'
import { useRemoteStore } from '../../src/renderer/store/remoteStore'
import { useCommitAndPushStore } from '../../src/renderer/store/commitAndPushStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }

function resetStores(): void {
  useCommitAndPushStore.setState({ flow: { stage: 'idle' } })
  useCommitStore.setState({
    repoPath: repo.localPath,
    repository: repo,
    committedHash: null,
    error: null,
    commitLoading: false,
  })
  useRemoteStore.setState({
    repoPath: repo.localPath,
    repository: repo,
    error: null,
    lastFailure: null,
    successMessage: null,
  })
}

describe('commitAndPushStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStores()
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main', files: [] } })
  })

  it('open transitions idle → confirming with the given remote', () => {
    useCommitAndPushStore.getState().open('origin')
    expect(useCommitAndPushStore.getState().flow).toEqual({
      stage: 'confirming',
      remoteName: 'origin',
    })
  })

  it('cancel from confirming returns to idle', () => {
    useCommitAndPushStore.setState({ flow: { stage: 'confirming', remoteName: 'origin' } })
    useCommitAndPushStore.getState().cancel()
    expect(useCommitAndPushStore.getState().flow).toEqual({ stage: 'idle' })
  })

  it('confirm is a no-op unless the flow is already confirming', async () => {
    await useCommitAndPushStore.getState().confirm('msg', 'main')
    expect(commit).not.toHaveBeenCalled()
    expect(useCommitAndPushStore.getState().flow).toEqual({ stage: 'idle' })
  })

  it('happy path: commit then push, ending in done with the committed hash and remote', async () => {
    commit.mockResolvedValue({ ok: true, data: { hash: 'abc1234' } })
    push.mockResolvedValue({ ok: true })
    useCommitAndPushStore.setState({ flow: { stage: 'confirming', remoteName: 'origin' } })

    await useCommitAndPushStore.getState().confirm('my message', 'main')

    expect(commit).toHaveBeenCalledWith(repo.localPath, 'my message')
    expect(push).toHaveBeenCalledWith(repo.localPath, 'origin', 'main')
    expect(useCommitAndPushStore.getState().flow).toEqual({
      stage: 'done',
      remoteName: 'origin',
      committedHash: 'abc1234',
    })
    // Both stores' own outcome fields still update exactly as if run standalone.
    expect(useCommitStore.getState().committedHash).toBe('abc1234')
    expect(useRemoteStore.getState().successMessage).toBe('Pushed main to origin.')
  })

  it('commit failure never calls push and lands in commit-failed', async () => {
    commit.mockRejectedValue(new Error('commit rejected'))
    useCommitAndPushStore.setState({ flow: { stage: 'confirming', remoteName: 'origin' } })

    await useCommitAndPushStore.getState().confirm('my message', 'main')

    expect(push).not.toHaveBeenCalled()
    expect(useCommitAndPushStore.getState().flow).toEqual({
      stage: 'commit-failed',
      message: 'commit rejected',
    })
  })

  it('push failure after a successful commit keeps the commit and routes through remoteStore.lastFailure', async () => {
    commit.mockResolvedValue({ ok: true, data: { hash: 'def5678' } })
    push.mockResolvedValue({ ok: false, error: 'rejected', code: 'rejectedNonFastForward' })
    useCommitAndPushStore.setState({ flow: { stage: 'confirming', remoteName: 'origin' } })

    await useCommitAndPushStore.getState().confirm('my message', 'main')

    expect(useCommitAndPushStore.getState().flow).toEqual({
      stage: 'push-failed',
      remoteName: 'origin',
      committedHash: 'def5678',
      message: 'rejected',
    })
    // The commit is never rolled back, and the existing recovery banner gets its data
    // from remoteStore.lastFailure without any extra plumbing.
    expect(useCommitStore.getState().committedHash).toBe('def5678')
    expect(useRemoteStore.getState().lastFailure).toMatchObject({
      message: 'rejected',
      code: 'rejectedNonFastForward',
      remote: 'origin',
      branch: 'main',
    })
  })
})
