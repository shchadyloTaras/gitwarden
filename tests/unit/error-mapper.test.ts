import { describe, it, expect } from 'vitest'
import { ErrorMapper, GitError } from '../../src/main/git/ErrorMapper'

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
