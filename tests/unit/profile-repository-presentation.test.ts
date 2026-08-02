import { describe, expect, it } from 'vitest'
import { deriveRepositoryDataState } from '../../src/renderer/profileRepositoryPresentation'

describe('deriveRepositoryDataState', () => {
  it.each([
    {
      label: 'a completed empty load',
      input: { cachedRepositoryCount: 0, loading: false, error: null },
      expected: 'ready',
    },
    {
      label: 'an initial load with no cached records',
      input: { cachedRepositoryCount: 0, loading: true, error: null },
      expected: 'loading',
    },
    {
      label: 'a failed load with no cached records',
      input: { cachedRepositoryCount: 0, loading: false, error: 'offline' },
      expected: 'unavailable',
    },
    {
      label: 'a refresh with cached records',
      input: { cachedRepositoryCount: 2, loading: true, error: null },
      expected: 'refreshing',
    },
    {
      label: 'a failed refresh with cached records',
      input: { cachedRepositoryCount: 2, loading: false, error: 'offline' },
      expected: 'stale',
    },
  ] as const)('returns $expected for $label', ({ input, expected }) => {
    expect(deriveRepositoryDataState(input)).toBe(expected)
  })
})
