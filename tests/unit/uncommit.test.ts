import { describe, it, expect } from 'vitest'
import { evaluateUncommit } from '../../src/core/history/uncommit'
import type { UncommitContext } from '../../src/core/history/uncommit'

const BASE: UncommitContext = {
  unpushedCount: 1,
  hasUpstream: true,
  workingTreeClean: true,
  headIsMerge: false,
  headIsRoot: false,
  rangeHasMerge: false,
  inProgressOp: false,
  detachedHead: false,
}

describe('evaluateUncommit', () => {
  it('allows both actions on a clean repo with a single unpushed commit', () => {
    const result = evaluateUncommit(BASE)
    expect(result.canReturnLast).toBe(true)
    expect(result.canReturnAllUnpushed).toBe(true)
    expect(result.returnAllCount).toBe(1)
    expect(result.refusals).toEqual({})
  })

  it('allows both actions with 3 unpushed commits, returnAllCount = 3', () => {
    const result = evaluateUncommit({ ...BASE, unpushedCount: 3 })
    expect(result.canReturnLast).toBe(true)
    expect(result.canReturnAllUnpushed).toBe(true)
    expect(result.returnAllCount).toBe(3)
  })

  it('refuses both actions with nothing-unpushed when unpushedCount is 0', () => {
    const result = evaluateUncommit({ ...BASE, unpushedCount: 0 })
    expect(result.canReturnLast).toBe(false)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ last: 'nothing-unpushed', all: 'nothing-unpushed' })
  })

  it('refuses both actions with dirty-tree on a dirty working tree', () => {
    const result = evaluateUncommit({ ...BASE, workingTreeClean: false })
    expect(result.canReturnLast).toBe(false)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ last: 'dirty-tree', all: 'dirty-tree' })
  })

  it('refuses both actions with root-commit when HEAD is the root commit', () => {
    const result = evaluateUncommit({ ...BASE, headIsRoot: true })
    expect(result.canReturnLast).toBe(false)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ last: 'root-commit', all: 'root-commit' })
  })

  it('refuses both actions with merge-commit when HEAD is a merge commit', () => {
    const result = evaluateUncommit({ ...BASE, headIsMerge: true })
    expect(result.canReturnLast).toBe(false)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ last: 'merge-commit', all: 'merge-commit' })
  })

  it('allows last but refuses all with no-upstream-for-all when there is no upstream', () => {
    const result = evaluateUncommit({ ...BASE, hasUpstream: false })
    expect(result.canReturnLast).toBe(true)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ all: 'no-upstream-for-all' })
  })

  it('allows last but refuses all with merge-commit when a merge exists in the unpushed range', () => {
    const result = evaluateUncommit({ ...BASE, unpushedCount: 3, rangeHasMerge: true })
    expect(result.canReturnLast).toBe(true)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ all: 'merge-commit' })
  })

  it('refuses both actions with detached-head on a detached HEAD', () => {
    const result = evaluateUncommit({ ...BASE, detachedHead: true })
    expect(result.canReturnLast).toBe(false)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ last: 'detached-head', all: 'detached-head' })
  })

  it('refuses both actions with in-progress-op during a mid-merge/rebase', () => {
    const result = evaluateUncommit({ ...BASE, inProgressOp: true })
    expect(result.canReturnLast).toBe(false)
    expect(result.canReturnAllUnpushed).toBe(false)
    expect(result.refusals).toEqual({ last: 'in-progress-op', all: 'in-progress-op' })
  })
})
