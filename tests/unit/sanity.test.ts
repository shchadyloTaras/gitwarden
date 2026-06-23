import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('true is true', () => {
    expect(true).toBe(true)
  })

  it('arithmetic works', () => {
    expect(1 + 1).toBe(2)
  })
})
