import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiHistorySummaryAssistant } from '../../src/main/ai/AiHistorySummaryAssistant'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'
import type { HistorySummaryService } from '../../src/main/ai/HistorySummaryService'
import type { AiAdapter } from '../../src/main/ai/types'

describe('AiHistorySummaryAssistant', () => {
  const deterministic = {
    releaseNotesDraft: 'Draft release notes\n- feat: initial',
    branchActivity: '1 recent commit on main by Alice.',
    changelogDraft: '* abc123 — feat: initial — Alice',
    source: 'deterministic' as const,
  }

  const preview = {
    requestId: 'req-1',
    connectionId: 'conn-1',
    kind: 'history-summary' as const,
    destinationHost: 'openrouter.ai',
    privacyMode: 'preview-each' as const,
    payloadText: '{}',
    chunks: [],
    truncated: false,
    omittedChars: 0,
    redactions: { count: 0, matches: [], labels: [] },
  }

  let historySummaryService: Pick<HistorySummaryService, 'buildDeterministic'>
  let contextBuilder: Pick<AiContextBuilder, 'buildPreview'>
  let adapters: Pick<AiAdapter, 'generateStructured'>

  beforeEach(() => {
    historySummaryService = {
      buildDeterministic: vi.fn().mockResolvedValue(deterministic),
    }
    contextBuilder = {
      buildPreview: vi.fn().mockResolvedValue(preview),
    }
    adapters = {
      generateStructured: vi.fn().mockResolvedValue({
        releaseNotesDraft: '## v1\n- Initial release',
        branchActivity: 'Steady activity on main.',
        changelogDraft: '- Initial commit',
      }),
    }
  })

  it('returns AI-enhanced history drafts', async () => {
    const assistant = new AiHistorySummaryAssistant(
      historySummaryService as HistorySummaryService,
      contextBuilder as AiContextBuilder,
      adapters as AiAdapter
    )
    const result = await assistant.generateHistorySummary({ repositoryId: 'repo-1' })
    expect(result.source).toBe('ai')
    expect(result.releaseNotesDraft).toContain('v1')
    expect(contextBuilder.buildPreview).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'history-summary' })
    )
  })
})
