import { describe, expect, it } from 'vitest'
import {
  parseChangeReview,
  parseChangeSummary,
  parseCommitDraft,
  parsePushBriefAiResponse,
  parseHistorySummaryAiResponse,
} from '../../src/core/ai/outputs'
import {
  AiChangeReviewSchema,
  AiChangeSummarySchema,
  AiCommitDraftSchema,
} from '../../src/core/ai/schemas'

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

  it('parseChangeReview accepts a valid adapter payload', () => {
    const review = parseChangeReview({
      findings: [
        {
          category: 'risky-file',
          source: 'ai',
          confidence: 'medium',
          file: 'deploy.yml',
          why: 'Deployment config changed.',
        },
      ],
      overall: 'Review complete.',
    })
    expect(review.findings[0]?.source).toBe('ai')
  })

  it('parseChangeReview rejects malformed adapter output', () => {
    expect(() => parseChangeReview({ findings: [{ category: 'nope' }] })).toThrow()
    expect(AiChangeReviewSchema.safeParse({ findings: [] }).success).toBe(true)
  })

  it('parsePushBriefAiResponse accepts a valid adapter payload', () => {
    const brief = parsePushBriefAiResponse({
      summary: 'Publishing two commits.',
      highlights: ['Adds feature', 'Fixes bug'],
    })
    expect(brief.highlights).toHaveLength(2)
  })

  it('parseHistorySummaryAiResponse accepts a valid adapter payload', () => {
    const summary = parseHistorySummaryAiResponse({
      releaseNotesDraft: '## v1',
      branchActivity: 'Active on main.',
      changelogDraft: '- Initial',
    })
    expect(summary.releaseNotesDraft).toContain('v1')
  })
})
