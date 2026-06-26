import type { AiRequestKind } from './types.js'

/** OpenAI-style strict JSON schema fragment shared by all structured outputs. */
const STRICT_OBJECT = {
  additionalProperties: false,
} as const

/** Provider JSON schema for commit-draft structured output. */
export const AI_COMMIT_DRAFT_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['conventional', 'plain', 'summary'],
  properties: {
    conventional: { type: 'string' },
    plain: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
  },
} as const

/** Provider JSON schema for staged-change summary structured output. */
export const AI_CHANGE_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['summary', 'highlights'],
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
  },
} as const

/** Provider JSON schema for staged-change review structured output. */
export const AI_CHANGE_REVIEW_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        ...STRICT_OBJECT,
        required: ['category', 'source', 'confidence', 'why'],
        properties: {
          category: {
            type: 'string',
            enum: [
              'secret-like',
              'risky-file',
              'migration',
              'lockfile',
              'generated',
              'missing-tests',
              'destructive',
            ],
          },
          source: { type: 'string', enum: ['deterministic', 'ai'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          file: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
    overall: { type: 'string' },
  },
} as const

/** Provider JSON schema for safety-copilot structured output. */
export const AI_SAFETY_EXPLANATION_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['explanation'],
  properties: {
    explanation: { type: 'string' },
  },
} as const

/** Provider JSON schema for push-brief AI enhancement. */
export const AI_PUSH_BRIEF_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['summary', 'highlights'],
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
  },
} as const

/** Provider JSON schema for history-summary AI enhancement. */
export const AI_HISTORY_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['releaseNotesDraft', 'branchActivity', 'changelogDraft'],
  properties: {
    releaseNotesDraft: { type: 'string' },
    branchActivity: { type: 'string' },
    changelogDraft: { type: 'string' },
  },
} as const

/** Provider JSON schema for repo-brief AI enhancement. */
export const AI_REPO_BRIEF_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['projectSummary'],
  properties: {
    projectSummary: { type: 'string' },
    likelyBuildCommands: { type: 'array', items: { type: 'string' } },
    likelyTestCommands: { type: 'array', items: { type: 'string' } },
    buildHint: { type: 'string' },
    testHint: { type: 'string' },
  },
} as const

/** Provider JSON schema for failure-explain AI enhancement. */
export const AI_FAILURE_EXPLANATION_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['explanation'],
  properties: {
    explanation: { type: 'string' },
  },
} as const

/** Provider JSON schema for agentic proposal structured output. */
export const AI_AGENTIC_PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['summary', 'actions', 'fileEdits'],
  properties: {
    summary: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        ...STRICT_OBJECT,
        required: ['kind'],
        properties: {
          kind: {
            type: 'string',
            enum: ['write-repo-file', 'suggest-navigation', 'copy-command'],
          },
          target: { type: 'string' },
          command: { type: 'string' },
        },
      },
    },
    fileEdits: {
      type: 'array',
      items: {
        type: 'object',
        ...STRICT_OBJECT,
        required: ['path', 'after'],
        properties: {
          path: { type: 'string' },
          before: { type: 'string' },
          after: { type: 'string' },
        },
      },
    },
  },
} as const

/** Provider JSON schema for advisory chat structured output. */
export const AI_CHAT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  ...STRICT_OBJECT,
  required: ['reply'],
  properties: {
    reply: { type: 'string' },
    suggestedCommands: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

/** Maps a request kind to the provider JSON schema sent to structured-output APIs. */
export function providerJsonSchemaForKind(kind: AiRequestKind): unknown {
  switch (kind) {
    case 'commit-draft':
      return AI_COMMIT_DRAFT_JSON_SCHEMA
    case 'change-summary':
      return AI_CHANGE_SUMMARY_JSON_SCHEMA
    case 'change-review':
      return AI_CHANGE_REVIEW_JSON_SCHEMA
    case 'safety-explain':
      return AI_SAFETY_EXPLANATION_JSON_SCHEMA
    case 'push-brief':
      return AI_PUSH_BRIEF_JSON_SCHEMA
    case 'history-summary':
      return AI_HISTORY_SUMMARY_JSON_SCHEMA
    case 'repo-brief':
      return AI_REPO_BRIEF_JSON_SCHEMA
    case 'failure-explain':
      return AI_FAILURE_EXPLANATION_JSON_SCHEMA
    case 'agentic-proposal':
      return AI_AGENTIC_PROPOSAL_JSON_SCHEMA
    case 'chat':
      return AI_CHAT_RESPONSE_JSON_SCHEMA
    default: {
      const _exhaustive: never = kind
      throw new Error(`No provider JSON schema for AI request kind: ${String(_exhaustive)}`)
    }
  }
}
