import { describe, expect, it } from 'vitest'
import {
  friendlyCapabilityError,
  isStructuredParseFailure,
} from '../../src/core/ai/capabilityErrors'

describe('capabilityErrors', () => {
  it('detects Zod JSON dumps and common parse prefixes', () => {
    expect(isStructuredParseFailure('[{"code":"invalid_type","path":["summary"]}]')).toBe(true)
    expect(isStructuredParseFailure('Expected string, received number')).toBe(true)
    expect(isStructuredParseFailure('AI provider returned non-JSON structured content')).toBe(true)
    expect(
      isStructuredParseFailure(
        'AI request requires an explicit expensive-send warning acknowledgement'
      )
    ).toBe(false)
  })

  it('maps structured-parse failures to the friendly message', () => {
    const friendly =
      'The model returned an unexpected response. Try again or pick a model that supports structured JSON output.'
    expect(friendlyCapabilityError('Expected string, received number', friendly)).toBe(friendly)
    expect(friendlyCapabilityError('Network timeout', friendly)).toBe('Network timeout')
  })
})
