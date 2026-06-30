import { describe, it, expect } from 'vitest'
import { bindHostToAlias, restoreHost, scpRemoteHost } from '../../src/core/github/remoteAlias.js'

const SCP = 'git@github.com:owner/repo.git'
const SCP_NO_GIT = 'git@github.com:owner/repo'
const HTTPS = 'https://github.com/owner/repo.git'
const HTTPS_CREDS = 'https://user@github.com/owner/repo.git'
const SSH_PROTO = 'ssh://git@github.com/owner/repo.git'

describe('scpRemoteHost', () => {
  it('extracts the host from an scp-like SSH remote', () => {
    expect(scpRemoteHost(SCP)).toBe('github.com')
    expect(scpRemoteHost('git@github.com-work:owner/repo.git')).toBe('github.com-work')
  })

  it('returns undefined for HTTPS, ssh:// and unparseable URLs', () => {
    expect(scpRemoteHost(HTTPS)).toBeUndefined()
    expect(scpRemoteHost(HTTPS_CREDS)).toBeUndefined()
    expect(scpRemoteHost(SSH_PROTO)).toBeUndefined()
    expect(scpRemoteHost('not a url')).toBeUndefined()
  })
})

describe('bindHostToAlias', () => {
  it('swaps only the host of an scp-like SSH remote, preserving user + owner/repo path', () => {
    expect(bindHostToAlias(SCP, 'github.com-work')).toBe('git@github.com-work:owner/repo.git')
    expect(bindHostToAlias(SCP_NO_GIT, 'gh-personal')).toBe('git@gh-personal:owner/repo')
  })

  it('re-points an already-aliased remote to a new alias', () => {
    expect(bindHostToAlias('git@gh-a:owner/repo.git', 'gh-b')).toBe('git@gh-b:owner/repo.git')
  })

  it('leaves HTTPS and ssh:// URLs unchanged', () => {
    expect(bindHostToAlias(HTTPS, 'gh-work')).toBe(HTTPS)
    expect(bindHostToAlias(HTTPS_CREDS, 'gh-work')).toBe(HTTPS_CREDS)
    expect(bindHostToAlias(SSH_PROTO, 'gh-work')).toBe(SSH_PROTO)
  })

  it('is a no-op for a blank alias', () => {
    expect(bindHostToAlias(SCP, '')).toBe(SCP)
    expect(bindHostToAlias(SCP, '   ')).toBe(SCP)
  })

  it('trims surrounding whitespace from the alias', () => {
    expect(bindHostToAlias(SCP, '  gh-work  ')).toBe('git@gh-work:owner/repo.git')
  })
})

describe('restoreHost', () => {
  it('restores the canonical host (inverse of bindHostToAlias)', () => {
    const bound = bindHostToAlias(SCP, 'github.com-work')
    expect(restoreHost(bound, 'github.com')).toBe(SCP)
  })

  it('leaves HTTPS URLs unchanged and is a no-op for a blank host', () => {
    expect(restoreHost(HTTPS, 'github.com')).toBe(HTTPS)
    expect(restoreHost(SCP, '')).toBe(SCP)
  })
})
