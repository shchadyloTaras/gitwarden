import { describe, it, expect } from 'vitest'
import { createRequestTracker } from '../../src/core/concurrency/requestGuard.js'

describe('createRequestTracker', () => {
  it('the first begun token is current until a newer one begins', () => {
    const tracker = createRequestTracker()
    const a = tracker.begin()
    expect(tracker.isCurrent(a)).toBe(true)
  })

  it('a later begin() supersedes an earlier token', () => {
    const tracker = createRequestTracker()
    const a = tracker.begin()
    const b = tracker.begin()
    expect(tracker.isCurrent(a)).toBe(false)
    expect(tracker.isCurrent(b)).toBe(true)
  })

  it('simulates out-of-order resolution: request A issued first, resolves last — still dropped', () => {
    const tracker = createRequestTracker()
    const tokenA = tracker.begin() // issued first
    const tokenB = tracker.begin() // issued second

    // B resolves first (fast network), A resolves last (slow network).
    expect(tracker.isCurrent(tokenB)).toBe(true)
    expect(tracker.isCurrent(tokenA)).toBe(false)
  })

  it('tokens are monotonically increasing and never repeat', () => {
    const tracker = createRequestTracker()
    const tokens = Array.from({ length: 5 }, () => tracker.begin())
    expect(new Set(tokens).size).toBe(5)
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i]).toBeGreaterThan(tokens[i - 1])
    }
  })
})
