import React from 'react'
import type { SafetyIssue } from '../../core/types'

interface SafetyIssueRowProps {
  issue: SafetyIssue
  testIdPrefix?: string
}

/**
 * Deterministic safety-issue row (Phase 55). The advisory "explain this" flow now
 * lives in the AI Chat panel (`/explain`), so this row just surfaces the
 * deterministic issue message — no AI, no network. It keeps the
 * `${prefix}-issue-${code}` test id the screens relied on.
 */
export default function SafetyIssueRow({
  issue,
  testIdPrefix = 'safety',
}: SafetyIssueRowProps): React.ReactElement {
  const isBlocker = issue.severity === 'blocker'
  return (
    <div
      data-testid={`${testIdPrefix}-issue-${issue.code}`}
      style={{
        padding: '8px 12px',
        background: isBlocker ? 'var(--gw-danger-bg, #450a0a)' : 'var(--gw-warning-bg, #422006)',
        borderBottom: '1px solid var(--gw-border, #27272a)',
        fontSize: '13px',
        color: isBlocker ? 'var(--gw-danger, #f87171)' : 'var(--gw-warning, #fbbf24)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      <span style={{ flexShrink: 0 }}>{isBlocker ? '⛔' : '⚠'}</span>
      <span style={{ flex: 1 }}>{issue.message}</span>
    </div>
  )
}
