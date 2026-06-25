import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiPushBriefAssistant } from '../../src/main/ai/AiPushBriefAssistant'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'
import type { PushBriefService } from '../../src/main/ai/PushBriefService'
import type { AiAdapter } from '../../src/main/ai/types'

describe('AiPushBriefAssistant', () => {
  const deterministic = {
    summary: 'One commit on main will be published to origin.',
    highlights: ['abc1234 — feat: test (Alice)'],
    commitCount: 1,
    identityNote: 'Local Git identity: Alice <alice@example.com>',
    source: 'deterministic' as const,
  }

  const preview = {
    requestId: 'req-1',
    connectionId: 'conn-1',
    kind: 'push-brief' as const,
    destinationHost: 'openrouter.ai',
    privacyMode: 'preview-each' as const,
    payloadText: '{}',
    chunks: [],
    truncated: false,
    omittedChars: 0,
    redactions: { count: 0, matches: [], labels: [] },
  }

  let pushBriefService: Pick<PushBriefService, 'buildDeterministic'>
  let contextBuilder: Pick<AiContextBuilder, 'buildPreview'>
  let adapters: Pick<AiAdapter, 'generateStructured'>

  beforeEach(() => {
    pushBriefService = {
      buildDeterministic: vi.fn().mockResolvedValue(deterministic),
    }
    contextBuilder = {
      buildPreview: vi.fn().mockResolvedValue(preview),
    }
    adapters = {
      generateStructured: vi.fn().mockResolvedValue({
        summary: 'Publishing one feature commit.',
        highlights: ['Adds push brief panel.'],
      }),
    }
  })

  it('merges AI summary while keeping deterministic identity note', async () => {
    const assistant = new AiPushBriefAssistant(
      pushBriefService as PushBriefService,
      contextBuilder as AiContextBuilder,
      adapters as AiAdapter
    )
    const result = await assistant.generatePushBrief({
      repositoryId: 'repo-1',
      remoteName: 'origin',
      branch: 'main',
    })
    expect(result.source).toBe('ai')
    expect(result.identityNote).toBe(deterministic.identityNote)
    expect(contextBuilder.buildPreview).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'push-brief', remoteName: 'origin', branch: 'main' })
    )
  })
})
