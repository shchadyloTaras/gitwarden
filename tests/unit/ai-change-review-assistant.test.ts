import { describe, expect, it, vi } from 'vitest'
import type { AiAdapter, AiStructuredRequest } from '../../src/main/ai/types'
import { AiChangeReviewAssistant } from '../../src/main/ai/AiChangeReviewAssistant'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'
import type { StagedChangeReviewService } from '../../src/main/ai/StagedChangeReviewService'
import type { AiPreparedContext } from '../../src/core/ai/context'

const previewFixture = (): AiPreparedContext => ({
  requestId: 'req-1',
  connectionId: 'conn-1',
  kind: 'change-review',
  destinationHost: 'openrouter.ai',
  privacyMode: 'preview-each',
  payloadText: '{"stagedDiffs":[]}',
  chunks: [{ index: 0, total: 1, start: 0, end: 18, text: '{"stagedDiffs":[]}' }],
  truncated: false,
  omittedChars: 0,
  redactions: { count: 0, matches: [], labels: [] },
})

describe('AiChangeReviewAssistant', () => {
  it('merges deterministic findings with AI output and preserves secrets on model all-clear', async () => {
    const deterministic = [
      {
        category: 'secret-like' as const,
        source: 'deterministic' as const,
        confidence: 'high' as const,
        file: 'config.env',
        why: 'Secret detected.',
      },
    ]

    const generateStructured = vi.fn(async (request: AiStructuredRequest<unknown>) =>
      request.responseSchema.parse({
        findings: [],
        overall: 'All clear — nothing risky here.',
      })
    )

    const assistant = new AiChangeReviewAssistant(
      {
        scanDeterministic: vi.fn(async () => deterministic),
      } as unknown as StagedChangeReviewService,
      {
        buildPreview: vi.fn(async () => previewFixture()),
      } as unknown as AiContextBuilder,
      { generateStructured } as unknown as AiAdapter
    )

    const review = await assistant.reviewStagedChanges({ repositoryId: 'repo-1' })
    expect(review.findings).toHaveLength(1)
    expect(review.findings[0]?.source).toBe('deterministic')
    expect(review.overall).toBeUndefined()
    expect(generateStructured).toHaveBeenCalled()
  })

  it('tags AI findings with source ai', async () => {
    const generateStructured = vi.fn(async (request: AiStructuredRequest<unknown>) =>
      request.responseSchema.parse({
        findings: [
          {
            category: 'risky-file',
            source: 'ai',
            confidence: 'medium',
            file: 'deploy.yml',
            why: 'Deployment config changed.',
          },
        ],
      })
    )

    const assistant = new AiChangeReviewAssistant(
      {
        scanDeterministic: vi.fn(async () => []),
      } as unknown as StagedChangeReviewService,
      {
        buildPreview: vi.fn(async () => previewFixture()),
      } as unknown as AiContextBuilder,
      { generateStructured } as unknown as AiAdapter
    )

    const review = await assistant.reviewStagedChanges({ repositoryId: 'repo-1' })
    expect(review.findings[0]?.source).toBe('ai')
  })
})
