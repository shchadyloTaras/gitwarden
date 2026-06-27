import React from 'react'
import type { AiChangeReview, AiConfidence, AiReviewFinding } from '../../../core/ai/types'
import { STR } from '../../strings'

const CONFIDENCE_STYLE: Record<AiConfidence, { bg: string; fg: string; label: string }> = {
  high: {
    bg: 'var(--gw-danger-bg, #450a0a)',
    fg: 'var(--gw-danger, #f87171)',
    label: STR.REVIEW_CONFIDENCE_HIGH,
  },
  medium: {
    bg: 'var(--gw-warning-bg, #422006)',
    fg: 'var(--gw-warning, #fbbf24)',
    label: STR.REVIEW_CONFIDENCE_MEDIUM,
  },
  low: {
    bg: 'var(--gw-success-bg, #052e16)',
    fg: 'var(--gw-success, #4ade80)',
    label: STR.REVIEW_CONFIDENCE_LOW,
  },
}

/** Technical taxonomy label, lightly humanized for display (e.g. "risky-file" → "Risky file"). */
function humanizeCategory(category: string): string {
  return category.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function FindingRow({ finding }: { finding: AiReviewFinding }): React.ReactElement {
  const tone = CONFIDENCE_STYLE[finding.confidence]
  return (
    <div
      data-testid="ai-chat-finding"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        background: 'var(--gw-surface, #18181b)',
        border: '1px solid var(--gw-border-subtle, #3f3f46)',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '1px 8px',
            borderRadius: 999,
            background: tone.bg,
            color: tone.fg,
          }}
        >
          {tone.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--gw-text-muted, #a1a1aa)' }}>
          {humanizeCategory(finding.category)}
        </span>
        {finding.file && (
          <span
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: 'var(--gw-accent-text, #a5b4fc)',
              background: 'var(--gw-surface2, #27272a)',
              padding: '1px 6px',
              borderRadius: 6,
            }}
          >
            {finding.file}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--gw-text, #f4f4f5)' }}>{finding.why}</div>
    </div>
  )
}

/** Native card for an AI change review (controlled GenUI — render only, no actions). */
export default function ReviewFindingsCard({
  review,
}: {
  review: AiChangeReview
}): React.ReactElement {
  return (
    <div
      data-testid="ai-chat-review-card"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {review.overall && (
        <div style={{ fontSize: 13, color: 'var(--gw-text, #f4f4f5)' }}>{review.overall}</div>
      )}
      {review.findings.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--gw-text-muted, #a1a1aa)' }}>
          {STR.REVIEW_NO_FINDINGS}
        </div>
      ) : (
        review.findings.map((f, i) => (
          <FindingRow key={`${f.category}-${f.file ?? ''}-${i}`} finding={f} />
        ))
      )}
    </div>
  )
}
