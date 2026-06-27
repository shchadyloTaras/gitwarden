// Chat UI blocks — pure core contracts for the chat's "controlled Generative UI"
// layer. A capability result can be carried to the renderer as a typed,
// Zod-validated block instead of a flattened string, so the chat renders a
// native card. The union is a CLOSED allowlist: the model never chooses an
// arbitrary component — it only fills the typed fields of a known block.
//
// Pure — no node/electron/DOM imports (architecture rule). Blocks are plain data.

import { z } from 'zod'
import type { AiChangeReview } from './types.js'
import { AiChangeReviewSchema } from './schemas.js'

/**
 * A typed renderable block carried on an assistant chat message. Starts with the
 * review-findings card; commit-draft / push-brief variants extend this union
 * later without changing the renderer contract.
 */
export type ChatUiBlock = { kind: 'review-findings'; review: AiChangeReview }

/** Fail-closed validation for a chat UI block (closed discriminated union). */
export const ChatUiBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('review-findings'),
    review: AiChangeReviewSchema,
  }),
])

/** Build a review-findings block from a parsed change review. */
export function reviewFindingsBlock(review: AiChangeReview): ChatUiBlock {
  return { kind: 'review-findings', review }
}
