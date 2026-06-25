import type { AiRequestKind } from './types.js'

/** Provider JSON schema for commit-draft structured output. */
export const AI_COMMIT_DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['conventional', 'plain', 'summary'],
  properties: {
    conventional: { type: 'string' },
    plain: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
  },
} as const

/** Provider JSON schema for advisory chat structured output. */
export const AI_CHAT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply'],
  properties: {
    reply: { type: 'string' },
    suggestedCommands: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

/** Maps a request kind to the provider JSON schema when one is defined. */
export function providerJsonSchemaForKind(kind: AiRequestKind): unknown | undefined {
  switch (kind) {
    case 'commit-draft':
      return AI_COMMIT_DRAFT_JSON_SCHEMA
    case 'chat':
      return AI_CHAT_RESPONSE_JSON_SCHEMA
    default:
      return undefined
  }
}
