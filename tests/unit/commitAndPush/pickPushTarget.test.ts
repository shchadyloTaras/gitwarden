import { describe, it, expect } from 'vitest'
import { pickPushTarget } from '../../../src/core/commitAndPush/pickPushTarget.js'
import type { GitRemote } from '../../../src/core/types.js'

const ORIGIN: GitRemote = { name: 'origin', url: 'https://github.com/org/repo.git' }
const UPSTREAM: GitRemote = { name: 'upstream', url: 'https://github.com/upstream-org/repo.git' }
const BACKUP: GitRemote = { name: 'backup', url: 'https://github.com/backup-org/repo.git' }

describe('pickPushTarget', () => {
  it('no remotes → none', () => {
    expect(pickPushTarget([], undefined)).toEqual({ kind: 'none' })
  })

  it('upstream remote wins over origin', () => {
    expect(pickPushTarget([ORIGIN, UPSTREAM], 'upstream/main')).toEqual({
      kind: 'remote',
      remoteName: 'upstream',
      reason: 'upstream',
    })
  })

  it('upstream with a slashed branch name still extracts the remote name', () => {
    expect(pickPushTarget([ORIGIN, UPSTREAM], 'upstream/client-x/taras/feature')).toEqual({
      kind: 'remote',
      remoteName: 'upstream',
      reason: 'upstream',
    })
  })

  it('an upstream naming a remote absent from remotes falls through to origin', () => {
    expect(pickPushTarget([ORIGIN, BACKUP], 'gone/main')).toEqual({
      kind: 'remote',
      remoteName: 'origin',
      reason: 'origin',
    })
  })

  it('an upstream naming a remote absent from remotes falls through to the sole remote', () => {
    expect(pickPushTarget([BACKUP], 'gone/main')).toEqual({
      kind: 'remote',
      remoteName: 'backup',
      reason: 'only-remote',
    })
  })

  it('no upstream, no origin, multiple remotes → falls through to origin when present', () => {
    expect(pickPushTarget([UPSTREAM, ORIGIN], undefined)).toEqual({
      kind: 'remote',
      remoteName: 'origin',
      reason: 'origin',
    })
  })

  it('no upstream, single remote → only-remote', () => {
    expect(pickPushTarget([UPSTREAM], undefined)).toEqual({
      kind: 'remote',
      remoteName: 'upstream',
      reason: 'only-remote',
    })
  })

  it('no upstream, no origin, multiple remotes → choice-required listing every candidate', () => {
    expect(pickPushTarget([UPSTREAM, BACKUP], undefined)).toEqual({
      kind: 'choice-required',
      candidates: ['upstream', 'backup'],
    })
  })

  it('upstream ambiguous (remote gone) and no origin, multiple remotes → choice-required', () => {
    expect(pickPushTarget([UPSTREAM, BACKUP], 'gone/main')).toEqual({
      kind: 'choice-required',
      candidates: ['upstream', 'backup'],
    })
  })

  it('origin wins over the "only remote" rule when both origin and others exist', () => {
    expect(pickPushTarget([BACKUP, ORIGIN, UPSTREAM], undefined)).toEqual({
      kind: 'remote',
      remoteName: 'origin',
      reason: 'origin',
    })
  })
})
