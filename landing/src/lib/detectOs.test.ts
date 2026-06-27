import { describe, it, expect } from 'vitest'
import { detectOs } from './detectOs'

describe('detectOs (plan Appendix C)', () => {
  it('macOS from userAgentData / platform / userAgent', () => {
    expect(detectOs({ uaDataPlatform: 'macOS' })).toBe('macOS')
    expect(detectOs({ platform: 'MacIntel' })).toBe('macOS')
    expect(
      detectOs({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605',
      })
    ).toBe('macOS')
  })

  it('Windows from platform / userAgent', () => {
    expect(detectOs({ platform: 'Win32' })).toBe('Windows')
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('Windows')
  })

  it('Linux from userAgent / platform', () => {
    expect(detectOs({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe('Linux')
    expect(detectOs({ platform: 'Linux x86_64' })).toBe('Linux')
  })

  it('mobile (Android / iOS) → unknown — no desktop build', () => {
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)' })).toBe('unknown')
    expect(detectOs({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe('unknown')
  })

  it('"Darwin" is macOS, not Windows (substring "win")', () => {
    expect(detectOs({ uaDataPlatform: 'Darwin' })).toBe('macOS')
  })

  it('empty / unrecognized input → unknown', () => {
    expect(detectOs({})).toBe('unknown')
    expect(detectOs({ userAgent: '' })).toBe('unknown')
    expect(detectOs({ platform: 'PlayStation' })).toBe('unknown')
  })
})
