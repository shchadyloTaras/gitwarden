import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from '../../src/main/security/contentSecurityPolicy.js'

describe('buildContentSecurityPolicy', () => {
  it('uses strict script-src in production', () => {
    const policy = buildContentSecurityPolicy(false)
    expect(policy).toContain("script-src 'self'")
    expect(policy).not.toContain('unsafe-eval')
  })

  it('allows Vite HMR sources in development', () => {
    const policy = buildContentSecurityPolicy(true)
    expect(policy).toContain("'unsafe-eval'")
    expect(policy).toContain('ws://localhost:*')
  })
})
