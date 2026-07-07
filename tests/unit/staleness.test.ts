import { describe, it, expect } from 'vitest'
import { isStale } from '../../src/core/concurrency/staleness.js'

describe('isStale', () => {
  it('is stale when there is no prior timestamp at all', () => {
    expect(isStale(null, 1_000, 500)).toBe(true)
  })

  it('is not stale when less than the threshold has elapsed', () => {
    expect(isStale(1_000, 1_400, 500)).toBe(false)
  })

  it('is stale once exactly the threshold has elapsed (inclusive)', () => {
    expect(isStale(1_000, 1_500, 500)).toBe(true)
  })

  it('is stale once more than the threshold has elapsed', () => {
    expect(isStale(1_000, 10_000, 500)).toBe(true)
  })
})
