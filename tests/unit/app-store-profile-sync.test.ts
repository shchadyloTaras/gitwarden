import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, RepositoryRecord } from '../../src/core/types'

// profilesStore.setActiveProfile persists via this IPC call before updating local state.
const settingsUpdate = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { settings: { update: settingsUpdate } } })

import { useAppStore } from '../../src/renderer/store/appStore'
import { useProfilesStore } from '../../src/renderer/store/profilesStore'

function makeProfile(id: string): Profile {
  return {
    id,
    displayName: id,
    gitAuthorName: id,
    gitAuthorEmail: `${id}@example.com`,
    githubUsername: id,
    authenticationMethod: 'ssh',
    expectedRemoteHosts: [],
  }
}

function makeRepo(id: string, assignedProfileId?: string): RepositoryRecord {
  return { id, name: id, localPath: `/tmp/${id}`, isFavorite: false, assignedProfileId }
}

// Drain the microtask chain from the fire-and-forget setActiveProfile call.
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('appStore — active profile follows the active repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsUpdate.mockResolvedValue({ ok: true })
    useProfilesStore.setState({
      profiles: [makeProfile('p-personal'), makeProfile('p-work')],
      activeProfileId: 'p-personal',
      loading: false,
    })
    useAppStore.setState({ activeRepo: null, currentBranch: null })
  })

  it('switches the active profile to the repo’s assigned profile on repo change', async () => {
    useAppStore.getState().setActiveRepo(makeRepo('r1', 'p-work'))
    await flush()

    expect(settingsUpdate).toHaveBeenCalledWith({ activeProfileId: 'p-work' })
    expect(useProfilesStore.getState().activeProfileId).toBe('p-work')
    expect(useAppStore.getState().activeRepo?.id).toBe('r1')
  })

  it('leaves the active profile intact when the repo is unassigned', async () => {
    useAppStore.getState().setActiveRepo(makeRepo('r1'))
    await flush()

    expect(settingsUpdate).not.toHaveBeenCalled()
    expect(useProfilesStore.getState().activeProfileId).toBe('p-personal')
  })

  it('no-ops when the assignment already matches the active profile', async () => {
    useProfilesStore.setState({ activeProfileId: 'p-work' })
    useAppStore.getState().setActiveRepo(makeRepo('r1', 'p-work'))
    await flush()

    expect(settingsUpdate).not.toHaveBeenCalled()
  })

  it('ignores an assigned profile that is not loaded (pruned/dangling id)', async () => {
    useAppStore.getState().setActiveRepo(makeRepo('r1', 'p-ghost'))
    await flush()

    expect(settingsUpdate).not.toHaveBeenCalled()
    expect(useProfilesStore.getState().activeProfileId).toBe('p-personal')
  })

  it('does not pull a manual profile override back to the repo’s profile', async () => {
    useAppStore.getState().setActiveRepo(makeRepo('r1', 'p-work'))
    await flush()
    expect(useProfilesStore.getState().activeProfileId).toBe('p-work')

    // A deliberate override (no repo change) must stick — the sync is scoped to repo changes.
    await useProfilesStore.getState().setActiveProfile('p-personal')
    await flush()
    expect(useProfilesStore.getState().activeProfileId).toBe('p-personal')
  })

  it('clearing the active repo (repo removed) leaves the active profile intact', async () => {
    useAppStore.getState().setActiveRepo(null)
    await flush()

    expect(settingsUpdate).not.toHaveBeenCalled()
    expect(useProfilesStore.getState().activeProfileId).toBe('p-personal')
  })

  it('re-assigning the active repo switches the profile and keeps the current branch', async () => {
    useAppStore.setState({ activeRepo: makeRepo('r1', 'p-personal'), currentBranch: 'feature/x' })

    // Editing r1's assignment to p-work re-sets the same repo with the updated record.
    useAppStore.getState().setActiveRepo(makeRepo('r1', 'p-work'))
    await flush()

    expect(useProfilesStore.getState().activeProfileId).toBe('p-work')
    expect(useAppStore.getState().activeRepo?.assignedProfileId).toBe('p-work')
    expect(useAppStore.getState().currentBranch).toBe('feature/x')
  })

  it('switching to a different repo resets the current branch', () => {
    useAppStore.setState({ activeRepo: makeRepo('r1', 'p-work'), currentBranch: 'main' })

    useAppStore.getState().setActiveRepo(makeRepo('r2', 'p-personal'))

    expect(useAppStore.getState().currentBranch).toBeNull()
  })
})
