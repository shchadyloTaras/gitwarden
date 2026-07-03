import { describe, it, expect } from 'vitest'
import { isValidGitRemoteUrl } from '../../src/core/remoteUrl.js'

describe('isValidGitRemoteUrl', () => {
  describe('accepted forms', () => {
    it('accepts an https URL', () => {
      expect(isValidGitRemoteUrl('https://github.com/owner/repo.git')).toBe(true)
    })
    it('accepts an https URL without .git suffix', () => {
      expect(isValidGitRemoteUrl('https://github.com/owner/repo')).toBe(true)
    })
    it('accepts an http URL', () => {
      expect(isValidGitRemoteUrl('http://internal.example.com/owner/repo.git')).toBe(true)
    })
    it('accepts an ssh:// URL', () => {
      expect(isValidGitRemoteUrl('ssh://git@github.com/owner/repo.git')).toBe(true)
    })
    it('accepts a scp-like git@host:path', () => {
      expect(isValidGitRemoteUrl('git@github.com:owner/repo.git')).toBe(true)
    })
    it('accepts a scp-like user@host:path', () => {
      expect(isValidGitRemoteUrl('deploy@example.com:repos/app.git')).toBe(true)
    })
    it('accepts a file:// URL', () => {
      expect(isValidGitRemoteUrl('file:///Users/taras/repos/bare.git')).toBe(true)
    })
    it('accepts a POSIX absolute path', () => {
      expect(isValidGitRemoteUrl('/Users/taras/repos/bare.git')).toBe(true)
    })
    it('accepts a Windows drive path (best-effort)', () => {
      expect(isValidGitRemoteUrl('C:\\repos\\bare.git')).toBe(true)
    })
    it('accepts a Windows UNC path (best-effort)', () => {
      expect(isValidGitRemoteUrl('\\\\server\\share\\bare.git')).toBe(true)
    })
  })

  describe('rejected forms', () => {
    it('rejects an empty string', () => {
      expect(isValidGitRemoteUrl('')).toBe(false)
    })
    it('rejects a whitespace-only string', () => {
      expect(isValidGitRemoteUrl('   ')).toBe(false)
    })
    it('rejects a bare host/owner/repo with no scheme', () => {
      expect(isValidGitRemoteUrl('github.com/owner/repo')).toBe(false)
    })
    it('rejects a string containing spaces', () => {
      expect(isValidGitRemoteUrl('https://github.com/owner/repo with space')).toBe(false)
    })
    it('rejects a string containing newlines', () => {
      expect(isValidGitRemoteUrl('https://github.com/owner/repo\n')).toBe(false)
    })
    it('rejects a URL padded with leading/trailing whitespace', () => {
      expect(isValidGitRemoteUrl('  https://github.com/owner/repo.git  ')).toBe(false)
    })
  })
})
