import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RepositoryRecord } from '../../src/core/types'

// setActiveRepo's profile-sync side effect fires IPC; stub it so these tests stay
// focused on the value-equality bail (Phase 90, W30) without needing to await it.
const settingsUpdate = vi.hoisted(() => vi.fn())
vi.stubGlobal('window', { api: { settings: { update: settingsUpdate } } })

import { useAppStore } from '../../src/renderer/store/appStore'

const repo = (overrides: Partial<RepositoryRecord> = {}): RepositoryRecord => ({
  id: 'r1',
  name: 'repo',
  localPath: '/tmp/r1',
  isFavorite: false,
  ...overrides,
})

describe('appStore.setActiveRepo value-equality bail (W30)', () => {
  beforeEach(() => {
    settingsUpdate.mockResolvedValue({ ok: true })
    useAppStore.setState({ activeRepo: null, currentBranch: null })
  })

  it('does not change the activeRepo reference for a value-equal record (fresh object, same fields)', () => {
    useAppStore.setState({ activeRepo: repo(), currentBranch: 'main' })
    const before = useAppStore.getState().activeRepo

    useAppStore.getState().setActiveRepo(repo()) // a brand-new object, identical fields

    expect(useAppStore.getState().activeRepo).toBe(before) // same reference — true no-op
    expect(useAppStore.getState().currentBranch).toBe('main') // untouched
  })

  it('never notifies subscribers for a value-equal record', () => {
    useAppStore.setState({ activeRepo: repo() })
    const listener = vi.fn()
    const unsubscribe = useAppStore.subscribe(listener)

    useAppStore.getState().setActiveRepo(repo())

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('still applies a real change: a same-id record with a different field goes through', () => {
    useAppStore.setState({ activeRepo: repo({ notes: 'old' }), currentBranch: 'main' })

    useAppStore.getState().setActiveRepo(repo({ notes: 'new' }))

    expect(useAppStore.getState().activeRepo?.notes).toBe('new')
    expect(useAppStore.getState().currentBranch).toBe('main') // same id → branch preserved
  })

  it('still resets currentBranch when the id genuinely changes', () => {
    useAppStore.setState({ activeRepo: repo({ id: 'r1' }), currentBranch: 'main' })

    useAppStore.getState().setActiveRepo(repo({ id: 'r2' }))

    expect(useAppStore.getState().currentBranch).toBeNull()
  })

  it('clearing to null from null is a value-equal no-op too', () => {
    useAppStore.setState({ activeRepo: null })
    const listener = vi.fn()
    const unsubscribe = useAppStore.subscribe(listener)

    useAppStore.getState().setActiveRepo(null)

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})
