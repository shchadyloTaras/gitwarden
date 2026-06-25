import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiSafetyCopilotAssistant } from '../../src/main/ai/AiSafetyCopilotAssistant'
import type { AiContextBuilder } from '../../src/main/ai/AiContextBuilder'
import type { AiAdapter } from '../../src/main/ai/types'

describe('AiSafetyCopilotAssistant', () => {
  const preview = {
    requestId: 'req-1',
    connectionId: 'conn-1',
    kind: 'safety-explain' as const,
    destinationHost: 'openrouter.ai',
    privacyMode: 'preview-each' as const,
    payloadText: '{}',
    chunks: [],
    truncated: false,
    omittedChars: 0,
    redactions: { count: 0, matches: [], labels: [] },
  }

  let contextBuilder: Pick<AiContextBuilder, 'buildPreview'>
  let adapters: Pick<AiAdapter, 'generateStructured'>

  beforeEach(() => {
    contextBuilder = {
      buildPreview: vi.fn().mockResolvedValue(preview),
    }
    adapters = {
      generateStructured: vi.fn().mockResolvedValue({
        explanation: 'Use the profile assigned to this repository before committing.',
      }),
    }
  })

  it('merges AI explanation with deterministic suggested action', async () => {
    const assistant = new AiSafetyCopilotAssistant(
      contextBuilder as AiContextBuilder,
      adapters as AiAdapter
    )
    const result = await assistant.explainSafetyIssue({
      repositoryId: 'repo-1',
      safetyCode: 'PROFILE_MISMATCH',
    })
    expect(result.source).toBe('ai')
    expect(result.suggestedAction).toBe('switch-active-profile')
    expect(result.explanation).toContain('assigned')
    expect(contextBuilder.buildPreview).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'safety-explain', safetyCode: 'PROFILE_MISMATCH' })
    )
  })

  it('returns deterministic explanation without calling the adapter', () => {
    const assistant = new AiSafetyCopilotAssistant(
      contextBuilder as AiContextBuilder,
      adapters as AiAdapter
    )
    const result = assistant.explainDeterministic('GITHUB_TOKEN_MISSING')
    expect(result.source).toBe('deterministic')
    expect(result.suggestedAction).toBe('reconnect-github')
    expect(adapters.generateStructured).not.toHaveBeenCalled()
  })
})
