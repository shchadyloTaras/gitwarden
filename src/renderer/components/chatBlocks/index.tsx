import React from 'react'
import type { ChatUiBlock } from '../../../core/ai/chatBlocks'
import ReviewFindingsCard from './ReviewFindingsCard'

/**
 * Controlled Generative-UI registry: maps a typed, validated chat block to its
 * whitelisted native card. Unknown kinds render nothing (the message's plain-text
 * `content` remains the fallback in MessageRow).
 */
export function ChatBlockView({ block }: { block: ChatUiBlock }): React.ReactElement | null {
  switch (block.kind) {
    case 'review-findings':
      return <ReviewFindingsCard review={block.review} />
    default:
      return null
  }
}
