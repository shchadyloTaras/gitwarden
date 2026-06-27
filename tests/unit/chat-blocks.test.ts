import { describe, it, expect } from 'vitest'
import { ChatUiBlockSchema, reviewFindingsBlock } from '../../src/core/ai/chatBlocks'

describe('ChatUiBlockSchema', () => {
  it('accepts a valid review-findings block', () => {
    const block = reviewFindingsBlock({
      findings: [
        {
          category: 'risky-file',
          source: 'ai',
          confidence: 'medium',
          file: 'feature.txt',
          why: 'Fake AI advisory finding for e2e.',
        },
      ],
      overall: 'All clear from the model.',
    })
    expect(ChatUiBlockSchema.parse(block)).toEqual(block)
  })

  it('accepts an empty findings list', () => {
    const block = reviewFindingsBlock({ findings: [] })
    expect(ChatUiBlockSchema.safeParse(block).success).toBe(true)
  })

  it('rejects an unknown block kind', () => {
    expect(ChatUiBlockSchema.safeParse({ kind: 'mystery', review: { findings: [] } }).success).toBe(
      false
    )
  })

  it('rejects a malformed finding (bad category)', () => {
    const bad = {
      kind: 'review-findings',
      review: {
        findings: [{ category: 'not-a-category', source: 'ai', confidence: 'medium', why: 'x' }],
      },
    }
    expect(ChatUiBlockSchema.safeParse(bad).success).toBe(false)
  })
})
