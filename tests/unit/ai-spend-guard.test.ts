import { describe, expect, it } from 'vitest'
import { AiSpendGuard } from '../../src/main/ai/spendGuard.js'

describe('AiSpendGuard', () => {
  it('refuses a request over the per-request token cap', () => {
    const guard = new AiSpendGuard({ perRequestTokenCap: 10 })

    expect(() =>
      guard.assertAllowed({
        connectionId: 'ai-1',
        kind: 'change-summary',
        estimatedInputTokens: 11,
      })
    ).toThrow(/per-request cap/)
  })

  it('requires explicit acknowledgement for expensive sends', () => {
    const guard = new AiSpendGuard({ perRequestTokenCap: 100, expensiveTokenWarning: 5 })

    expect(() =>
      guard.assertAllowed({
        connectionId: 'ai-1',
        kind: 'change-summary',
        estimatedInputTokens: 6,
      })
    ).toThrow(/explicit/)

    expect(() =>
      guard.assertAllowed({
        connectionId: 'ai-1',
        kind: 'change-summary',
        estimatedInputTokens: 6,
        expensiveSendAcknowledged: true,
      })
    ).not.toThrow()
  })

  it('warns when a request would cross the daily soft cap', () => {
    const guard = new AiSpendGuard({
      perRequestTokenCap: 100,
      dailySoftCap: 12,
      expensiveTokenWarning: 90,
      now: () => new Date('2026-06-25T12:00:00.000Z'),
    })

    const first = guard.assertAllowed({
      connectionId: 'ai-1',
      kind: 'change-summary',
      estimatedInputTokens: 8,
      expensiveSendAcknowledged: true,
    })
    guard.record(first)

    const estimate = guard.estimate({
      connectionId: 'ai-1',
      kind: 'change-summary',
      estimatedInputTokens: 5,
    })
    expect(estimate.warnings?.join(' ')).toContain('daily soft cap')
    expect(estimate.requiresExplicitWarning).toBe(true)
  })
})
