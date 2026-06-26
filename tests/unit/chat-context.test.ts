import { describe, expect, it } from 'vitest'
import {
  atMentionQuery,
  filterContextFiles,
  normalizeContextPaths,
} from '../../src/core/ai/chatContext'

describe('chatContext', () => {
  it('filters repo paths for @ mentions', () => {
    expect(filterContextFiles('read', ['src/main.ts', 'README.md', 'docs/plan.md'])).toEqual([
      'README.md',
    ])
  })

  it('detects a trailing @ query', () => {
    expect(atMentionQuery('summarize @src/co')).toBe('src/co')
    expect(atMentionQuery('/commit')).toBeNull()
  })

  it('normalizes attached context paths', () => {
    expect(normalizeContextPaths([' a.ts ', 'a.ts', ''])).toEqual(['a.ts'])
  })
})
