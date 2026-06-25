import { describe, it, expect } from 'vitest'
import { maskSecret } from '../../src/core/ai/credentials'

describe('maskSecret', () => {
  it('reveals at most the last 4 chars', () => {
    expect(maskSecret('sk-or-v1-0123456789abcd')).toBe('••••abcd')
  })

  it('never returns the raw secret', () => {
    const secret = 'gho_supersecrettoken1234'
    expect(maskSecret(secret)).not.toContain('supersecrettoken')
    expect(maskSecret(secret).endsWith('1234')).toBe(true)
  })

  it('fully masks short secrets (≤ 4 chars)', () => {
    expect(maskSecret('abcd')).toBe('••••')
    expect(maskSecret('ab')).toBe('••••')
    expect(maskSecret('')).toBe('••••')
  })
})
