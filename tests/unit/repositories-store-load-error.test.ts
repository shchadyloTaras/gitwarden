import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 90 (#11, W32): a failed repositories.list() must become an error state, not a
// false empty list — App.tsx's auto-select reads `error` to avoid clearing the active
// repo just because a transient fetch failed.
const list = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { repositories: { list } } })

import { useRepositoriesStore } from '../../src/renderer/store/repositoriesStore'

const repo = (id: string): RepositoryRecord => ({
  id,
  name: id,
  localPath: `/${id}`,
  isFavorite: false,
})

describe('repositoriesStore.load error hygiene (Phase 90)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRepositoriesStore.setState({ repos: [], loading: false, error: null })
  })

  it('keeps the last-known repos list intact when list() fails, and records the error', async () => {
    list.mockResolvedValueOnce({ ok: true, data: [repo('a'), repo('b')] })
    await useRepositoriesStore.getState().load()
    expect(useRepositoriesStore.getState().repos).toHaveLength(2)

    list.mockResolvedValueOnce({ ok: false, error: 'network down' })
    await useRepositoriesStore.getState().load()

    expect(useRepositoriesStore.getState().repos).toHaveLength(2) // not wiped to []
    expect(useRepositoriesStore.getState().error).toBe('network down')
  })

  it('clears a stale error on the next successful load', async () => {
    list.mockResolvedValueOnce({ ok: false, error: 'boom' })
    await useRepositoriesStore.getState().load()
    expect(useRepositoriesStore.getState().error).toBe('boom')

    list.mockResolvedValueOnce({ ok: true, data: [repo('a')] })
    await useRepositoriesStore.getState().load()
    expect(useRepositoriesStore.getState().error).toBeNull()
    expect(useRepositoriesStore.getState().repos).toHaveLength(1)
  })

  it('records a thrown error without wiping the list', async () => {
    list.mockResolvedValueOnce({ ok: true, data: [repo('a')] })
    await useRepositoriesStore.getState().load()

    list.mockRejectedValueOnce(new Error('IPC gone'))
    await useRepositoriesStore.getState().load()

    expect(useRepositoriesStore.getState().error).toBe('IPC gone')
    expect(useRepositoriesStore.getState().repos).toHaveLength(1)
  })
})
