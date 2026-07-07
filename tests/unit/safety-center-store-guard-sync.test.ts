import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// Phase 95 (W12): safetyCenterStore.load's success also refreshes headerGuardStore —
// the always-mounted header badge and the Safety Center screen must never disagree,
// even when this screen reloads independently of GlobalHeader's own effect (e.g. the
// focus-revalidation path).
const getEffectiveIdentity = vi.hoisted(() => vi.fn())
const getRemotes = vi.hoisted(() => vi.fn())
const getStatus = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', {
  api: { git: { getEffectiveIdentity, getRemotes, getStatus } },
})

import { useSafetyCenterStore } from '../../src/renderer/store/safetyCenterStore'
import { useHeaderGuardStore } from '../../src/renderer/store/headerGuardStore'

const repo: RepositoryRecord = { id: 'r1', name: 'repo', localPath: '/tmp/repo', isFavorite: false }

describe('safetyCenterStore refreshes headerGuardStore on load success (Phase 95, W12)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useHeaderGuardStore.setState({
      loading: false,
      state: 'not-checked',
      issueCount: 0,
      error: null,
    })
    getRemotes.mockResolvedValue({ ok: true, data: [] })
    getStatus.mockResolvedValue({ ok: true, data: { branch: 'main' } })
  })

  it('a successful load also recomputes the header guard for the same repo', async () => {
    getEffectiveIdentity.mockResolvedValue({
      ok: true,
      data: { userName: 'Alice', userEmail: 'alice@example.com', emailSource: 'local' },
    })

    await useSafetyCenterStore.getState().load(repo.localPath, repo, null, [])

    // getEffectiveIdentity was called twice: once by safetyCenterStore's own load,
    // once by headerGuardStore.refresh — proving the guard actually recomputed.
    expect(getEffectiveIdentity).toHaveBeenCalledTimes(2)
    expect(useHeaderGuardStore.getState().state).not.toBe('not-checked')
  })

  it('a dangling assignedProfileId is normalized the same way for both the screen and the badge', async () => {
    const repoWithGhostProfile: RepositoryRecord = { ...repo, assignedProfileId: 'ghost' }
    getEffectiveIdentity.mockResolvedValue({
      ok: true,
      data: { userName: 'Alice', userEmail: 'alice@example.com', emailSource: 'local' },
    })

    await useSafetyCenterStore
      .getState()
      .load(repoWithGhostProfile.localPath, repoWithGhostProfile, null, [])

    // No profiles resolve 'ghost' — both the screen's own effectiveRepository AND the
    // guard's refresh call must have seen assignedProfileId cleared, not the dangling id
    // — an unassigned repo is a BLOCKER (REPO_UNASSIGNED), same verdict on both surfaces.
    expect(useSafetyCenterStore.getState().repository?.assignedProfileId).toBeUndefined()
    expect(useHeaderGuardStore.getState().state).toBe('blocked')
  })
})
