import { describe, it, expect } from 'vitest'
import { ErrorMapper, GitError } from '../../src/main/git/ErrorMapper'
import { toIpcFailure } from '../../src/main/ipc/ipcFailure'

describe('ErrorMapper', () => {
  it('returns a GitError instance', () => {
    const err = ErrorMapper.map('some error', 1)
    expect(err).toBeInstanceOf(GitError)
    expect(err).toBeInstanceOf(Error)
  })

  it('maps "not a git repository"', () => {
    const err = ErrorMapper.map(
      'fatal: not a git repository (or any of the parent directories)',
      128
    )
    expect(err.code).toBe('notARepository')
    expect(err.exitCode).toBe(128)
  })

  it('maps "authentication failed"', () => {
    const err = ErrorMapper.map('remote: Authentication failed for https://github.com/...', 128)
    expect(err.code).toBe('authenticationFailed')
  })

  it('maps "permission denied (publickey)"', () => {
    const err = ErrorMapper.map('Permission denied (publickey).', 128)
    expect(err.code).toBe('authenticationFailed')
  })

  it('maps remote not found', () => {
    const err = ErrorMapper.map("fatal: repository 'https://github.com/x/y.git/' not found", 128)
    expect(err.code).toBe('remoteNotFound')
  })

  it('maps branch not found', () => {
    const err = ErrorMapper.map(
      "error: pathspec 'nonexistent' did not match any file(s) known to git",
      1
    )
    expect(err.code).toBe('branchNotFound')
  })

  it('maps a branch checked out in another worktree', () => {
    const err = ErrorMapper.map(
      "fatal: 'feature-a' is already checked out at '/tmp/gitwarden-linked-worktree'",
      128
    )
    expect(err.code).toBe('branchCheckedOutElsewhere')
    expect(err.userMessage).toContain('/tmp/gitwarden-linked-worktree')
    expect(err.exitCode).toBe(128)
  })

  it('maps a branch delete blocked by another worktree', () => {
    const err = ErrorMapper.map(
      "error: Cannot delete branch 'feature-a' checked out at '/tmp/gitwarden-linked-worktree'",
      1
    )
    expect(err.code).toBe('branchCheckedOutElsewhere')
    expect(err.userMessage).toContain('/tmp/gitwarden-linked-worktree')
  })

  it('maps a branch delete blocked by newer Git worktree wording', () => {
    const err = ErrorMapper.map(
      "error: cannot delete branch 'feature-a' used by worktree at '/tmp/gitwarden-linked-worktree'",
      1
    )
    expect(err.code).toBe('branchCheckedOutElsewhere')
    expect(err.userMessage).toContain('/tmp/gitwarden-linked-worktree')
  })

  it('maps merge conflict', () => {
    const err = ErrorMapper.map('CONFLICT (content): Merge conflict in foo.ts', 1)
    expect(err.code).toBe('mergeConflict')
  })

  it('maps nothing to commit', () => {
    const err = ErrorMapper.map('nothing to commit, working tree clean', 1)
    expect(err.code).toBe('nothingToCommit')
  })

  it('maps network error', () => {
    const err = ErrorMapper.map('fatal: Could not resolve host: github.com', 128)
    expect(err.code).toBe('networkError')
  })

  // ── Guard Quick-Fix (Phase 64): push-failure diagnosis ──
  it('maps a GitHub HTTPS wrong-account 403 push rejection', () => {
    const err = ErrorMapper.map(
      "remote: Permission to octo/repo.git denied to wronguser.\nfatal: unable to access 'https://github.com/octo/repo.git/': The requested URL returned error: 403",
      128
    )
    expect(err.code).toBe('pushRejectedWrongAccount')
    expect(err.userMessage).toMatch(/different account|assigned profile/i)
  })

  it('classifies wrong-account BEFORE generic auth (the 403 branch wins)', () => {
    const err = ErrorMapper.map('remote: Permission to octo/repo.git denied to wronguser.', 128)
    expect(err.code).toBe('pushRejectedWrongAccount')
  })

  it('maps HTTPS token rejection (401) to authenticationFailed', () => {
    const err = ErrorMapper.map(
      "fatal: unable to access 'https://github.com/octo/repo.git/': The requested URL returned error: 401",
      128
    )
    expect(err.code).toBe('authenticationFailed')
  })

  it('maps HTTPS "could not read Username" (no credentials) to authenticationFailed', () => {
    const err = ErrorMapper.map(
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      128
    )
    expect(err.code).toBe('authenticationFailed')
  })

  it('still maps SSH "permission denied (publickey)" to authenticationFailed', () => {
    const err = ErrorMapper.map('git@github.com: Permission denied (publickey).', 128)
    expect(err.code).toBe('authenticationFailed')
  })

  it('maps "dubious ownership" (moved/owned-elsewhere repo folder) to dubiousOwnership', () => {
    const err = ErrorMapper.map(
      "fatal: detected dubious ownership in repository at '/Users/me/moved-repo'",
      128
    )
    expect(err.code).toBe('dubiousOwnership')
    expect(err.userMessage).toMatch(/moved|re-point|re-add/i)
  })

  it('falls back to unknown for unrecognized stderr', () => {
    const err = ErrorMapper.map('some completely unknown error output', 1)
    expect(err.code).toBe('unknown')
    expect(err.technicalDetails).toBe('some completely unknown error output')
    expect(err.exitCode).toBe(1)
  })

  it('sets a human-readable userMessage for all codes', () => {
    const cases = [
      'fatal: not a git repository',
      'remote: Authentication failed',
      "fatal: repository 'x' not found",
      "pathspec 'y' did not match any",
      "fatal: 'feature-a' is already checked out at '/tmp/feature-a'",
      "error: Cannot delete branch 'feature-a' checked out at '/tmp/feature-a'",
      "error: cannot delete branch 'feature-a' used by worktree at '/tmp/feature-a'",
      'CONFLICT (content)',
      'nothing to commit',
      'Could not resolve host: github.com',
      'unknown error',
    ]
    for (const stderr of cases) {
      const err = ErrorMapper.map(stderr, 1)
      expect(err.userMessage.length).toBeGreaterThan(0)
    }
  })
})

describe('toIpcFailure (structured IPC envelope)', () => {
  it('attaches code + remediation for a remediable GitError (wrong-account push)', () => {
    const failure = toIpcFailure(
      ErrorMapper.map('remote: Permission to octo/repo.git denied to wronguser.', 128)
    )
    expect(failure.error.length).toBeGreaterThan(0)
    expect(failure.code).toBe('pushRejectedWrongAccount')
    expect(failure.remediation).toEqual({
      action: 'switch-profile-and-retry-push',
      kind: 'executable',
    })
  })

  it('maps authenticationFailed to the reconnect-github remediation', () => {
    const failure = toIpcFailure(ErrorMapper.map('fatal: Authentication failed', 128))
    expect(failure.code).toBe('authenticationFailed')
    expect(failure.remediation).toEqual({ action: 'reconnect-github', kind: 'executable' })
  })

  it('attaches code but NO remediation for a non-remediable GitError', () => {
    const failure = toIpcFailure(ErrorMapper.map('some completely unknown error', 1))
    expect(failure.code).toBe('unknown')
    expect(failure.remediation).toBeUndefined()
  })

  it('leaves a plain Error string-only (no code, no remediation)', () => {
    const failure = toIpcFailure(new Error('boom'))
    expect(failure.error).toBe('boom')
    expect(failure.code).toBeUndefined()
    expect(failure.remediation).toBeUndefined()
  })
})
