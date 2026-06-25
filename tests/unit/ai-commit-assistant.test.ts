import { describe, expect, it, vi } from 'vitest'
import type { AiAdapter, AiStructuredRequest } from '../../src/main/ai/types'
import { AiCommitAssistant } from '../../src/main/ai/AiCommitAssistant'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'
import type { AiPreparedContext } from '../../src/core/ai/context'
import { AI_COMMIT_DRAFT_JSON_SCHEMA } from '../../src/core/ai/providerSchemas'
import { parseCommitDraft } from '../../src/core/ai/outputs'
import { AiSpendGuard } from '../../src/main/ai/spendGuard.js'
import { usageInputFromStructured } from '../../src/main/ai/adapterUtils.js'

const previewFixture = (kind: 'commit-draft' | 'change-summary'): AiPreparedContext => ({
  requestId: 'req-1',
  connectionId: 'conn-1',
  kind,
  destinationHost: 'openrouter.ai',
  privacyMode: 'preview-each',
  payloadText: '{"stagedDiffs":[]}',
  chunks: [{ index: 0, total: 1, start: 0, end: 18, text: '{"stagedDiffs":[]}' }],
  truncated: false,
  omittedChars: 0,
  redactions: { count: 0, matches: [], labels: [] },
})

describe('AiCommitAssistant', () => {
  it('draftCommitMessage uses AiContextBuilder and parses structured output', async () => {
    const buildPreview = vi.fn(async () => previewFixture('commit-draft'))
    const generateStructured = vi.fn(async (request: AiStructuredRequest<unknown>) => {
      expect(request.kind).toBe('commit-draft')
      expect(request.messages[0]?.content).toContain('Conventional Commits')
      expect(request.responseSchemaJson).toEqual(AI_COMMIT_DRAFT_JSON_SCHEMA)
      return request.responseSchema.parse({
        conventional: 'feat(test): draft',
        plain: 'Draft test',
        summary: 'Test summary',
      })
    })

    const assistant = new AiCommitAssistant(
      { buildPreview } as unknown as AiContextBuilder,
      { generateStructured } as unknown as AiAdapter
    )

    const draft = await assistant.draftCommitMessage({ repositoryId: 'repo-1' })
    expect(draft.plain).toBe('Draft test')
    expect(buildPreview).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      kind: 'commit-draft',
      commitMessage: undefined,
    })
  })

  it('summarizeStagedChanges uses change-summary kind', async () => {
    const buildPreview = vi.fn(async () => previewFixture('change-summary'))
    const generateStructured = vi.fn(async (request: AiStructuredRequest<unknown>) =>
      request.responseSchema.parse({
        summary: 'One staged file.',
        highlights: ['readme.txt'],
      })
    )

    const assistant = new AiCommitAssistant(
      { buildPreview } as unknown as AiContextBuilder,
      { generateStructured } as unknown as AiAdapter
    )

    const summary = await assistant.summarizeStagedChanges({
      repositoryId: 'repo-1',
      commitMessage: 'WIP',
    })
    expect(summary.highlights).toEqual(['readme.txt'])
    expect(buildPreview).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      kind: 'change-summary',
      commitMessage: 'WIP',
    })
  })

  it('rejects malformed adapter output for commit drafts', async () => {
    const assistant = new AiCommitAssistant(
      {
        buildPreview: vi.fn(async () => previewFixture('commit-draft')),
      } as unknown as AiContextBuilder,
      {
        generateStructured: vi.fn(async () => ({
          conventional: 'only one field',
        })),
      } as unknown as AiAdapter
    )

    await expect(assistant.draftCommitMessage({ repositoryId: 'repo-1' })).rejects.toThrow()
  })

  it('accepts commit draft body null by normalizing it to omitted', () => {
    const draft = parseCommitDraft({
      conventional: 'feat: test',
      plain: 'Test',
      summary: 'Summary',
      body: null,
    })
    expect(draft.body).toBeUndefined()
  })

  it('rejects expensive commit drafts without explicit acknowledgement', async () => {
    const guard = new AiSpendGuard()
    const largePayload = 'x'.repeat(32_001)
    const buildPreview = vi.fn(async () => ({
      ...previewFixture('commit-draft'),
      payloadText: largePayload,
    }))
    const generateStructured = vi.fn(async (request: AiStructuredRequest<unknown>) => {
      guard.assertAllowed(usageInputFromStructured(request))
      return request.responseSchema.parse({
        conventional: 'feat(test): draft',
        plain: 'Draft test',
        summary: 'Test summary',
      })
    })

    const assistant = new AiCommitAssistant(
      { buildPreview } as unknown as AiContextBuilder,
      { generateStructured } as unknown as AiAdapter
    )

    await expect(assistant.draftCommitMessage({ repositoryId: 'repo-1' })).rejects.toThrow(
      /explicit expensive-send warning acknowledgement/
    )
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ expensiveSendAcknowledged: undefined })
    )
  })

  it('allows expensive commit drafts when explicitly acknowledged', async () => {
    const guard = new AiSpendGuard()
    const largePayload = 'x'.repeat(32_001)
    const buildPreview = vi.fn(async () => ({
      ...previewFixture('commit-draft'),
      payloadText: largePayload,
    }))
    const generateStructured = vi.fn(async (request: AiStructuredRequest<unknown>) => {
      guard.assertAllowed(usageInputFromStructured(request))
      return request.responseSchema.parse({
        conventional: 'feat(test): draft',
        plain: 'Draft test',
        summary: 'Test summary',
      })
    })

    const assistant = new AiCommitAssistant(
      { buildPreview } as unknown as AiContextBuilder,
      { generateStructured } as unknown as AiAdapter
    )

    const draft = await assistant.draftCommitMessage({
      repositoryId: 'repo-1',
      expensiveSendAcknowledged: true,
    })
    expect(draft.plain).toBe('Draft test')
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ expensiveSendAcknowledged: true })
    )
  })
})
