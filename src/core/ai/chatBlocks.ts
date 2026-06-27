// Chat UI blocks — pure core contracts for the chat's "controlled Generative UI"
// layer. A capability result can be carried to the renderer as a typed,
// Zod-validated block instead of a flattened string, so the chat renders a
// native card. The union is a CLOSED allowlist: the model never chooses an
// arbitrary component — it only fills the typed fields of a known block.
//
// Pure — no node/electron/DOM imports (architecture rule). Blocks are plain data.

import { z } from 'zod'
import type { AiChangeReview, AiCommitDraft } from './types.js'
import { AiChangeReviewSchema, AiCommitDraftSchema } from './schemas.js'
import { AI_COMMIT_DRAFT_JSON_SCHEMA } from './providerSchemas.js'

/**
 * A typed renderable block carried on an assistant chat message. A CLOSED
 * allowlist of known cards; further variants (push-brief, …) extend this union
 * later without changing the renderer contract.
 */
export type ChatUiBlock =
  | { kind: 'review-findings'; review: AiChangeReview }
  | { kind: 'commit-draft'; draft: AiCommitDraft }

const ReviewFindingsBlockSchema = z.object({
  kind: z.literal('review-findings'),
  review: AiChangeReviewSchema,
})

const CommitDraftBlockSchema = z.object({
  kind: z.literal('commit-draft'),
  draft: AiCommitDraftSchema,
})

/** Fail-closed validation for a chat UI block (closed discriminated union). */
export const ChatUiBlockSchema = z.discriminatedUnion('kind', [
  ReviewFindingsBlockSchema,
  CommitDraftBlockSchema,
])

/** Build a review-findings block from a parsed change review. */
export function reviewFindingsBlock(review: AiChangeReview): ChatUiBlock {
  return { kind: 'review-findings', review }
}

/** Build a commit-draft block from a parsed AI commit draft. */
export function commitDraftBlock(draft: AiCommitDraft): ChatUiBlock {
  return { kind: 'commit-draft', draft }
}

// ── Free-text block suggestion (Phase 62, Level 2) ──────────────────────────
//
// After a free-text chat reply streams, a small structured pass MAY upgrade the
// bubble with one allowlisted block. Scoped to `commit-draft` — the only block
// derivable from the conversation alone (the chat context carries NO diffs, so a
// model-"reviewed" findings block would be fabricated). `block` is required but
// nullable: the model returns null when no card fits.

export type ChatBlockSuggestion = { block: ChatUiBlock | null }

export const ChatBlockSuggestionSchema = z.object({
  block: CommitDraftBlockSchema.nullable(),
})

/** Fail-closed: any malformed suggestion (or block) yields no block. */
export function parseChatBlockSuggestion(raw: unknown): ChatBlockSuggestion {
  const parsed = ChatBlockSuggestionSchema.safeParse(raw)
  if (!parsed.success || parsed.data.block === null) return { block: null }
  return { block: commitDraftBlock(parsed.data.block.draft) }
}

/** Provider JSON schema for the suggestion pass (nullable commit-draft block). */
export const CHAT_BLOCK_SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['block'],
  properties: {
    block: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['kind', 'draft'],
      properties: {
        kind: { type: 'string', enum: ['commit-draft'] },
        draft: AI_COMMIT_DRAFT_JSON_SCHEMA,
      },
    },
  },
} as const

export const CHAT_BLOCK_SUGGEST_INSTRUCTION =
  'You are GitWarden\'s advisory assistant. Given the conversation, decide whether a single commit-message draft card would clearly help the user (for example, they asked you to write or improve a commit message). Return JSON {"block": null} when no card fits. Only when a commit message is clearly wanted, return {"block": {"kind": "commit-draft", "draft": {"conventional": <Conventional Commits subject>, "plain": <plain subject>, "summary": <one sentence>}}} (you may also include draft.body). Never fabricate file findings or invent changes. English only. Advisory only — you never run Git actions.'
