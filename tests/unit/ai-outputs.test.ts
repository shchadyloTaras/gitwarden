import { describe, expect, it } from 'vitest'
import { parseChangeSummary, parseCommitDraft } from '../../src/core/ai/outputs'
import { AiChangeSummarySchema, AiCommitDraftSchema } from '../../src/core/ai/schemas'

describe('AI structured outputs (fail-closed)', () => {
  it('parseCommitDraft accepts a valid adapter payload', () => {
    const draft = parseCommitDraft({
      conventional: 'feat(ai): add commit assistant',
      plain: 'Add commit assistant',
      summary: 'Introduces draft and summarize actions on the Commit screen.',
      body: '- Uses AiContextBuilder only\n- Never auto-commits',
    })
    expect(draft.conventional).toContain('feat(ai)')
    expect(draft.body).toContain('Never auto-commits')
  })

  it('parseCommitDraft rejects malformed adapter output', () => {
    expect(() =>
      parseCommitDraft({
        conventional: 'feat: ok',
        plain: 'ok',
      })
    ).toThrow()
    expect(AiCommitDraftSchema.safeParse({ summary: 'only summary' }).success).toBe(false)
    expect(AiCommitDraftSchema.safeParse(null).success).toBe(false)
  })

  it('parseChangeSummary accepts a valid adapter payload', () => {
    const summary = parseChangeSummary({
      summary: 'Staged one file with a token redaction.',
      highlights: ['secrets.txt updated', 'No network in tests'],
    })
    expect(summary.highlights).toHaveLength(2)
  })

  it('parseChangeSummary rejects malformed adapter output', () => {
    expect(() => parseChangeSummary({ summary: 'missing highlights' })).toThrow()
    expect(AiChangeSummarySchema.safeParse({ highlights: [] }).success).toBe(false)
  })
})
