import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 90 (W19): setActiveProfile must drop a superseded resolution — two rapid
// profile switches must always settle on the LAST one requested, not whichever
// settings.update() IPC round-trip happens to resolve last.
const settingsUpdate = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { settings: { update: settingsUpdate } } })

import { useProfilesStore } from '../../src/renderer/store/profilesStore'

describe('profilesStore.setActiveProfile stale-request guard (Phase 90)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProfilesStore.setState({ profiles: [], activeProfileId: null, loading: false })
  })

  it('drops a resolution that resolves after a newer setActiveProfile() was issued', async () => {
    let resolveA: (v: unknown) => void = () => {}
    settingsUpdate.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const pendingA = useProfilesStore.getState().setActiveProfile('profile-a')

    settingsUpdate.mockResolvedValueOnce({ ok: true })
    const pendingB = useProfilesStore.getState().setActiveProfile('profile-b')
    await pendingB
    expect(useProfilesStore.getState().activeProfileId).toBe('profile-b')

    resolveA({ ok: true })
    await pendingA
    // profile-a's late resolution must not yank the active profile backwards.
    expect(useProfilesStore.getState().activeProfileId).toBe('profile-b')
  })

  it('a single call still applies normally', async () => {
    settingsUpdate.mockResolvedValue({ ok: true })
    await useProfilesStore.getState().setActiveProfile('profile-a')
    expect(useProfilesStore.getState().activeProfileId).toBe('profile-a')
  })
})
