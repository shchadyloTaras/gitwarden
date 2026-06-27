import { describe, it, expect } from 'vitest'
import {
  ChatUiBlockSchema,
  reviewFindingsBlock,
  commitDraftBlock,
  parseChatBlockSuggestion,
} from '../../src/core/ai/chatBlocks'

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

  it('accepts a valid commit-draft block', () => {
    const block = commitDraftBlock({
      conventional: 'feat(ai): add commit draft card',
      plain: 'Add commit draft card',
      summary: 'Renders the AI commit draft as a native card.',
      body: 'Longer explanation.',
    })
    expect(ChatUiBlockSchema.parse(block)).toEqual(block)
  })

  it('accepts a commit-draft block without a body', () => {
    const block = commitDraftBlock({
      conventional: 'fix: tidy',
      plain: 'Tidy',
      summary: 'Small cleanup.',
    })
    expect(ChatUiBlockSchema.safeParse(block).success).toBe(true)
  })

  it('rejects a malformed commit-draft (missing conventional)', () => {
    const bad = { kind: 'commit-draft', draft: { plain: 'x', summary: 'y' } }
    expect(ChatUiBlockSchema.safeParse(bad).success).toBe(false)
  })
})

describe('parseChatBlockSuggestion (fail-closed)', () => {
  it('extracts a commit-draft block', () => {
    const result = parseChatBlockSuggestion({
      block: {
        kind: 'commit-draft',
        draft: { conventional: 'feat: x', plain: 'X', summary: 'Did X.' },
      },
    })
    expect(result.block).toEqual({
      kind: 'commit-draft',
      draft: { conventional: 'feat: x', plain: 'X', summary: 'Did X.' },
    })
  })

  it('returns no block for an explicit null', () => {
    expect(parseChatBlockSuggestion({ block: null }).block).toBeNull()
  })

  it('returns no block for a review-findings block (outside the suggestion allowlist)', () => {
    const result = parseChatBlockSuggestion({
      block: { kind: 'review-findings', review: { findings: [] } },
    })
    expect(result.block).toBeNull()
  })

  it('returns no block for malformed or garbage input', () => {
    expect(
      parseChatBlockSuggestion({ block: { kind: 'commit-draft', draft: { plain: 'x' } } }).block
    ).toBeNull()
    expect(parseChatBlockSuggestion('nope').block).toBeNull()
    expect(parseChatBlockSuggestion({}).block).toBeNull()
  })
})
