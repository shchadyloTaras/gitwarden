import { describe, expect, it } from 'vitest'
import {
  FAILURE_ACTION_BY_CODE,
  FAILURE_CATEGORY_BY_CODE,
  buildDeterministicGitFailureExplanation,
  buildDeterministicToolFailureExplanation,
} from '../../src/core/ai/index.js'

describe('failure explainer', () => {
  it('maps every GitErrorCode to category and suggested action', () => {
    for (const code of Object.keys(FAILURE_CATEGORY_BY_CODE)) {
      const explanation = buildDeterministicGitFailureExplanation({
        code: code as keyof typeof FAILURE_CATEGORY_BY_CODE,
        userMessage: 'test message',
      })
      expect(explanation.category).toBeTruthy()
      expect(explanation.suggestedAction).toBe(
        FAILURE_ACTION_BY_CODE[code as keyof typeof FAILURE_ACTION_BY_CODE]
      )
      expect(explanation.source).toBe('deterministic')
    }
  })

  it('explains pasted tool output deterministically', () => {
    const explanation = buildDeterministicToolFailureExplanation({
      output: 'FAIL tests/unit/example.test.ts\nAssertionError: expected true',
    })
    expect(explanation.code).toBe('tool-output')
    expect(explanation.explanation).toContain('Tool output starts with')
    expect(explanation.source).toBe('deterministic')
  })
})
