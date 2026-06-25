import { describe, it, expect } from 'vitest'
import {
  redactSecrets,
  findSecretMatches,
  containsSecret,
  REDACTION_RULES,
} from '../../src/core/ai/redaction'

// Deterministic fixtures, one per required category (§4: tokens, private keys,
// GitHub tokens, common env secrets, credential URLs) plus a few extra shapes.
const PRIVATE_KEY = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Q',
  'uKUpRKfFLfRYC9AIKjbJTWit+CqvjSFmbE5RpD8=',
  '-----END RSA PRIVATE KEY-----',
].join('\n')

const FIXTURES: Array<{ ruleId: string; text: string; secret: string }> = [
  {
    ruleId: 'github-token',
    text: 'token=ghp_0123456789abcdefghijklmnopqrstuvwxyz in config',
    secret: 'ghp_0123456789abcdefghijklmnopqrstuvwxyz',
  },
  {
    ruleId: 'github-token',
    text: 'pat github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ here',
    secret: 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ',
  },
  {
    ruleId: 'api-key',
    text: 'OPENAI key sk-or-v1-0123456789abcdef0123 used',
    secret: 'sk-or-v1-0123456789abcdef0123',
  },
  {
    ruleId: 'private-key',
    text: `before\n${PRIVATE_KEY}\nafter`,
    secret: 'MIIBOgIBAAJBAKj34GkxFhD90',
  },
  {
    ruleId: 'env-secret',
    text: 'MY_API_KEY=supersecretvalue123\nMODE=debug',
    secret: 'supersecretvalue123',
  },
  {
    ruleId: 'credential-url',
    text: 'remote https://alice:hunter2pass@github.com/x.git set',
    secret: 'hunter2pass',
  },
  {
    ruleId: 'jwt',
    text: 'auth eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123_- end',
    secret: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcDEF123_-',
  },
  {
    ruleId: 'aws-access-key-id',
    text: 'aws AKIAIOSFODNN7EXAMPLE creds',
    secret: 'AKIAIOSFODNN7EXAMPLE',
  },
  {
    ruleId: 'slack-token',
    text: 'slack xoxb-123456789012-abcdefghijkl token',
    secret: 'xoxb-123456789012-abcdefghijkl',
  },
]

describe('redactSecrets — single ruleset, every category', () => {
  for (const { ruleId, text, secret } of FIXTURES) {
    it(`redacts ${ruleId} and removes the raw secret`, () => {
      const { redacted, matches } = redactSecrets(text)
      expect(redacted.includes(secret)).toBe(false)
      expect(matches.some((m) => m.ruleId === ruleId)).toBe(true)
    })
  }

  it('keeps the env var NAME but redacts only its value', () => {
    const { redacted } = redactSecrets('MY_API_KEY=supersecretvalue123')
    expect(redacted).toBe('MY_API_KEY=«redacted:env-secret»')
  })

  it('keeps scheme/user/host on a credential URL, redacts only the password', () => {
    const { redacted } = redactSecrets('https://alice:hunter2pass@github.com/x.git')
    expect(redacted).toBe('https://alice:«redacted»@github.com/x.git')
    expect(redacted.includes('github.com')).toBe(true) // destination host still visible (§4)
  })

  it('leaves clean text untouched and reports no matches', () => {
    const clean = 'fix(core): add AI contracts\n\nNo secrets here, just prose.'
    const { redacted, matches } = redactSecrets(clean)
    expect(redacted).toBe(clean)
    expect(matches).toEqual([])
  })

  it('redacts multiple distinct secrets in one pass', () => {
    const text = 'a ghp_0123456789abcdefghijklmnopqrstuvwxyz b sk-or-v1-0123456789abcdef0123 c'
    const { redacted, matches } = redactSecrets(text)
    expect(redacted.includes('ghp_')).toBe(false)
    expect(redacted.includes('sk-or-')).toBe(false)
    const firedRules = new Set(matches.map((m) => m.ruleId))
    expect(firedRules.has('github-token')).toBe(true)
    expect(firedRules.has('api-key')).toBe(true)
  })
})

describe('findSecretMatches / containsSecret — reused by the Phase 33 scanner', () => {
  it('detects without redacting, reporting rule + position + length', () => {
    const text = 'token=ghp_0123456789abcdefghijklmnopqrstuvwxyz'
    const matches = findSecretMatches(text)
    const gh = matches.find((m) => m.ruleId === 'github-token')
    expect(gh).toBeDefined()
    expect(text.slice(gh!.index, gh!.index + gh!.length)).toBe(
      'ghp_0123456789abcdefghijklmnopqrstuvwxyz'
    )
  })

  it('containsSecret is true/false correctly (no leaked regex lastIndex state)', () => {
    const secretText = 'k sk-or-v1-0123456789abcdef0123'
    // call twice to prove global-regex lastIndex is reset between calls
    expect(containsSecret(secretText)).toBe(true)
    expect(containsSecret(secretText)).toBe(true)
    expect(containsSecret('nothing sensitive here')).toBe(false)
  })

  it('every rule has a stable, documented id and a global pattern', () => {
    for (const rule of REDACTION_RULES) {
      expect(rule.id.length).toBeGreaterThan(0)
      expect(rule.pattern.flags.includes('g')).toBe(true)
    }
  })
})
