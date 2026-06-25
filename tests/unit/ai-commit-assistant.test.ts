import { describe, expect, it, vi } from 'vitest'
import type { AiAdapter, AiStructuredRequest } from '../../src/main/ai/types'
import { AiCommitAssistant } from '../../src/main/ai/AiCommitAssistant'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'
import type { AiPreparedContext } from '../../src/core/ai/context'

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
})
