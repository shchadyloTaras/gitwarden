import { describe, it, expect } from 'vitest'
import {
  isLoopbackHost,
  isLoopbackUrl,
  isAllowedAiBaseUrl,
  deriveLocalOnly,
} from '../../src/core/ai/transport'

describe('isLoopbackHost', () => {
  it('accepts loopback literals (case-insensitive)', () => {
    for (const h of ['localhost', 'LOCALHOST', '127.0.0.1', '[::1]', '::1']) {
      expect(isLoopbackHost(h)).toBe(true)
    }
  })

  it('rejects LAN / remote hosts', () => {
    for (const h of ['example.com', '192.168.1.10', '10.0.0.1', 'host.local', 'api.openai.com']) {
      expect(isLoopbackHost(h)).toBe(false)
    }
  })
})

describe('isAllowedAiBaseUrl (shared transport gate, §3)', () => {
  it('allows any https URL', () => {
    expect(isAllowedAiBaseUrl('https://api.openai.com/v1')).toBe(true)
    expect(isAllowedAiBaseUrl('https://openrouter.ai/api/v1')).toBe(true)
  })

  it('allows http only for loopback', () => {
    expect(isAllowedAiBaseUrl('http://localhost:1234/v1')).toBe(true)
    expect(isAllowedAiBaseUrl('http://127.0.0.1:11434')).toBe(true)
    expect(isAllowedAiBaseUrl('http://[::1]:8080/v1')).toBe(true)
  })

  it('rejects http to a non-loopback host', () => {
    expect(isAllowedAiBaseUrl('http://api.openai.com/v1')).toBe(false)
    expect(isAllowedAiBaseUrl('http://192.168.1.50:1234/v1')).toBe(false)
  })

  it('rejects non-http(s) schemes and malformed URLs', () => {
    expect(isAllowedAiBaseUrl('ftp://localhost/x')).toBe(false)
    expect(isAllowedAiBaseUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedAiBaseUrl('not a url')).toBe(false)
    expect(isAllowedAiBaseUrl('')).toBe(false)
  })
})

describe('deriveLocalOnly (localOnly from host, NOT kind — §4)', () => {
  it('is true for a loopback base URL regardless of kind', () => {
    // an openai-compatible connection pointed at a local server is local
    expect(deriveLocalOnly('http://localhost:1234/v1')).toBe(true)
    expect(deriveLocalOnly('http://127.0.0.1:11434')).toBe(true)
    expect(deriveLocalOnly('https://localhost:1234/v1')).toBe(true)
  })

  it('is false for a remote base URL', () => {
    expect(deriveLocalOnly('https://api.openai.com/v1')).toBe(false)
    expect(deriveLocalOnly('https://openrouter.ai/api/v1')).toBe(false)
  })

  it('is false when there is no base URL', () => {
    expect(deriveLocalOnly(undefined)).toBe(false)
    expect(deriveLocalOnly('')).toBe(false)
  })

  it('isLoopbackUrl agrees with deriveLocalOnly on parseable URLs', () => {
    expect(isLoopbackUrl('http://localhost:1234')).toBe(true)
    expect(isLoopbackUrl('https://example.com')).toBe(false)
    expect(isLoopbackUrl('garbage')).toBe(false)
  })
})
