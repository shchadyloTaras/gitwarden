import { describe, expect, it } from 'vitest'
import type { FileChange } from '../../src/core/types'
import { countUniqueChangedFiles } from '../../src/core/status/workingCopy'

function file(
  path: string,
  indexStatus: FileChange['indexStatus'],
  worktreeStatus: FileChange['worktreeStatus']
): FileChange {
  return { path, indexStatus, worktreeStatus }
}

describe('countUniqueChangedFiles', () => {
  it('returns zero for an empty or clean working copy', () => {
    expect(countUniqueChangedFiles([])).toBe(0)
    expect(countUniqueChangedFiles([file('clean.ts', 'unmodified', 'unmodified')])).toBe(0)
  })

  it('counts a single changed path', () => {
    expect(countUniqueChangedFiles([file('src/app.ts', 'modified', 'unmodified')])).toBe(1)
  })

  it('counts a staged-and-modified path once', () => {
    expect(countUniqueChangedFiles([file('src/app.ts', 'modified', 'modified')])).toBe(1)
  })

  it('defensively de-duplicates repeated changed paths', () => {
    expect(
      countUniqueChangedFiles([
        file('src/app.ts', 'modified', 'unmodified'),
        file('src/app.ts', 'unmodified', 'modified'),
      ])
    ).toBe(1)
  })

  it('counts untracked and conflicted paths once each', () => {
    expect(
      countUniqueChangedFiles([
        file('new.ts', 'untracked', 'untracked'),
        file('conflict.ts', 'conflicted', 'conflicted'),
      ])
    ).toBe(2)
  })

  it('ignores paths whose only states are ignored or unmodified', () => {
    expect(
      countUniqueChangedFiles([
        file('ignored.log', 'ignored', 'ignored'),
        file('clean.ts', 'unmodified', 'unmodified'),
        file('mixed.ts', 'ignored', 'unmodified'),
      ])
    ).toBe(0)
  })

  it('counts each changed path in a mixed working copy', () => {
    expect(
      countUniqueChangedFiles([
        file('staged.ts', 'added', 'unmodified'),
        file('unstaged.ts', 'unmodified', 'deleted'),
        file('rename.ts', 'renamed', 'unmodified'),
        file('copy.ts', 'unmodified', 'copied'),
        file('ignored.log', 'ignored', 'ignored'),
        file('clean.ts', 'unmodified', 'unmodified'),
      ])
    ).toBe(4)
  })
})
