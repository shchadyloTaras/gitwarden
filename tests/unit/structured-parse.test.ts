import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AiChatResponseSchema, AiCommitDraftSchema } from '../../src/core/ai/schemas'
import { parseStructuredAdapterValue } from '../../src/core/ai/structuredParse'

describe('parseStructuredAdapterValue', () => {
  describe('chat', () => {
    it('accepts plain-text provider content and renders it as reply', () => {
      const result = parseStructuredAdapterValue(
        AiChatResponseSchema,
        'Stage your changes first, then run /review.',
        'chat'
      )
      expect(result).toEqual({
        reply: 'Stage your changes first, then run /review.',
      })
    })

    it('parses normal JSON content', () => {
      const result = parseStructuredAdapterValue(
        AiChatResponseSchema,
        '{"reply":"Hello","suggestedCommands":["/review"]}',
        'chat'
      )
      expect(result).toEqual({
        reply: 'Hello',
        suggestedCommands: ['/review'],
      })
    })

    it('extracts JSON from markdown fenced content', () => {
      const result = parseStructuredAdapterValue(
        AiChatResponseSchema,
        '```json\n{"reply":"From fence","suggestedCommands":[]}\n```',
        'chat'
      )
      expect(result.reply).toBe('From fence')
    })
  })

  describe('non-chat structured requests', () => {
    it('accepts commit draft JSON with body null after schema normalization', () => {
      const result = parseStructuredAdapterValue(
        AiCommitDraftSchema,
        '{"conventional":"feat: x","plain":"x","summary":"s","body":null}',
        'commit-draft'
      )
      expect(result).toEqual({
        conventional: 'feat: x',
        plain: 'x',
        summary: 's',
      })
    })

    it('rejects missing required fields for commit drafts', () => {
      expect(() =>
        parseStructuredAdapterValue(
          AiCommitDraftSchema,
          '{"conventional":"only one field"}',
          'commit-draft'
        )
      ).toThrow()
    })

    it('rejects plain prose for non-chat structured requests', () => {
      expect(() =>
        parseStructuredAdapterValue(
          z.object({ summary: z.string(), highlights: z.array(z.string()) }),
          'This is plain prose, not JSON.',
          'change-summary'
        )
      ).toThrow(/non-JSON structured content/)
    })

    it('extracts JSON from markdown fences for non-chat requests', () => {
      const result = parseStructuredAdapterValue(
        z.object({ summary: z.string(), highlights: z.array(z.string()) }),
        'Here you go:\n```json\n{"summary":"ok","highlights":["a"]}\n```',
        'change-summary'
      )
      expect(result).toEqual({ summary: 'ok', highlights: ['a'] })
    })
  })
})
