import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// remoteStore reads the live branch via window.api.git.getStatus on load/pull.
const getRemotes = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
const getEffectiveIdentity = vi.hoisted(() => vi.fn())
const pull = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getRemotes, getStatus, getEffectiveIdentity, pull } },
})

import { useAppStore } from '../../src/renderer/store/appStore'
import { useRemoteStore } from '../../src/renderer/store/remoteStore'

const repo: RepositoryRecord = {
  id: 'r1',
  name: 'repo',
  localPath: '/tmp/repo',
  isFavorite: false,
}

describe('remoteStore keeps appStore.currentBranch in sync (no stale-branch desync)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getEffectiveIdentity.mockResolvedValue({ ok: true, data: {} })
    // Header/Context panel start on a stale branch — exactly the screenshot's state.
    useAppStore.setState({ currentBranch: 'main' })
  })

  it('load() pushes the live git branch into appStore so all views agree', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'seo-audit-fixes' } })

    await useRemoteStore.getState().load(repo.localPath, repo)

    // RemoteScreen reads currentBranch from appStore, not from remoteStore — this is
    // the only place the live branch needs to land.
    expect(useAppStore.getState().currentBranch).toBe('seo-audit-fixes')
  })

  it('doPull() re-syncs appStore from the post-pull live branch', async () => {
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'seo-audit-fixes' } })
    pull.mockResolvedValue({ ok: true })
    useRemoteStore.setState({ repoPath: repo.localPath })

    await useRemoteStore.getState().doPull('origin', 'seo-audit-fixes')

    expect(useAppStore.getState().currentBranch).toBe('seo-audit-fixes')
  })

  it('does not overwrite appStore with null when git status is unavailable', async () => {
    getStatus.mockResolvedValue({ ok: false, error: 'boom' })

    await useRemoteStore.getState().load(repo.localPath, repo)

    // appStore keeps its prior value rather than being blanked to null.
    expect(useAppStore.getState().currentBranch).toBe('main')
  })
})
