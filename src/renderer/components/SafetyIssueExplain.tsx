import React, { useState } from 'react'
import { buildDeterministicSafetyExplanation } from '../../core/ai/safetyCopilot'
import type { AiSafetyExplanation } from '../../core/ai/types'
import type { SafetyCode } from '../../core/safety/SafetyCheckService'
import type { SafetyIssue } from '../../core/types'
import { useAiStore } from '../store/aiStore'
import { STR } from '../strings'

interface SafetyIssueExplainProps {
  issue: SafetyIssue
  repositoryId?: string
  testIdPrefix?: string
}

export default function SafetyIssueExplain({
  issue,
  repositoryId,
  testIdPrefix = 'safety',
}: SafetyIssueExplainProps): React.ReactElement {
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const previewContext = useAiStore((s) => s.previewContext)
  const explainSafetyIssue = useAiStore((s) => s.explainSafetyIssue)

  const [expanded, setExpanded] = useState(false)
  const [explanation, setExplanation] = useState<AiSafetyExplanation | null>(null)
  const [previewSeen, setPreviewSeen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isBlocker = issue.severity === 'blocker'
  const code = issue.code as SafetyCode

  const handleExplain = () => {
    setExpanded(true)
    setError(null)
    setExplanation(buildDeterministicSafetyExplanation(code))
  }

  const handlePreview = async () => {
    if (!repositoryId) return
    setPreviewLoading(true)
    setError(null)
    try {
      const preview = await previewContext({
        repositoryId,
        kind: 'safety-explain',
      })
      if (preview) setPreviewSeen(true)
      else setError(STR.SAFETY_COPILOT_PREVIEW_ERROR)
    } catch {
      setError(STR.SAFETY_COPILOT_PREVIEW_ERROR)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleEnhanceWithAi = async () => {
    if (!repositoryId || !previewSeen) return
    setAiLoading(true)
    setError(null)
    try {
      const result = await explainSafetyIssue({ repositoryId, safetyCode: code })
      if (result) setExplanation(result)
      else setError(STR.SAFETY_COPILOT_AI_ERROR)
    } catch {
      setError(STR.SAFETY_COPILOT_AI_ERROR)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div
      data-testid={`${testIdPrefix}-issue-${issue.code}`}
      style={{
        padding: '8px 12px',
        background: isBlocker ? 'var(--gw-danger-bg, #450a0a)' : 'var(--gw-warning-bg, #422006)',
        borderBottom: '1px solid var(--gw-border, #27272a)',
        fontSize: '13px',
        color: isBlocker ? 'var(--gw-danger, #f87171)' : 'var(--gw-warning, #fbbf24)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ flexShrink: 0 }}>{isBlocker ? '⛔' : '⚠'}</span>
        <span style={{ flex: 1 }}>{issue.message}</span>
        {!expanded && (
          <button
            type="button"
            data-testid={`${testIdPrefix}-explain-btn-${issue.code}`}
            onClick={handleExplain}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: '1px solid currentColor',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            {STR.SAFETY_COPILOT_EXPLAIN_BTN}
          </button>
        )}
      </div>

      {expanded && explanation && (
        <div
          data-testid={`${testIdPrefix}-explain-panel-${issue.code}`}
          style={{
            marginTop: '10px',
            padding: '10px 12px',
            background: 'var(--gw-bg, #09090b)',
            border: '1px solid var(--gw-border, #27272a)',
            borderRadius: '4px',
            color: 'var(--gw-text, #f4f4f5)',
          }}
        >
          <div
            data-testid={`${testIdPrefix}-explain-source`}
            style={{
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--gw-text-faint, #71717a)',
              marginBottom: '6px',
            }}
          >
            {explanation.source === 'ai'
              ? STR.SAFETY_COPILOT_SOURCE_AI
              : STR.SAFETY_COPILOT_SOURCE_DETERMINISTIC}
          </div>
          <p
            data-testid={`${testIdPrefix}-explain-text`}
            style={{ margin: '0 0 10px', lineHeight: 1.5, fontSize: '13px' }}
          >
            {explanation.explanation}
          </p>
          <div
            data-testid={`${testIdPrefix}-explain-action-hint`}
            style={{
              fontSize: '12px',
              color: 'var(--gw-text-muted, #a1a1aa)',
              lineHeight: 1.5,
              borderTop: '1px solid var(--gw-border, #27272a)',
              paddingTop: '8px',
            }}
          >
            <strong style={{ color: 'var(--gw-text, #f4f4f5)' }}>
              {STR.SAFETY_COPILOT_SUGGESTED_ACTION}:{' '}
            </strong>
            {STR.SAFETY_ACTION_LABELS[explanation.suggestedAction]}
            <div style={{ marginTop: '4px' }}>{explanation.actionHint}</div>
          </div>

          {aiEnabled && repositoryId && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!previewSeen && (
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-explain-preview-btn`}
                  onClick={() => void handlePreview()}
                  disabled={previewLoading}
                  style={secondaryBtnStyle}
                >
                  {previewLoading ? STR.SAFETY_COPILOT_PREVIEW_LOADING : STR.AI_PREVIEW_BUTTON}
                </button>
              )}
              {previewSeen && explanation.source === 'deterministic' && (
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-explain-ai-btn`}
                  onClick={() => void handleEnhanceWithAi()}
                  disabled={aiLoading}
                  style={secondaryBtnStyle}
                >
                  {aiLoading ? STR.SAFETY_COPILOT_AI_LOADING : STR.SAFETY_COPILOT_ENHANCE_BTN}
                </button>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--gw-danger, #f87171)' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--gw-border-strong, #52525b)',
  borderRadius: '4px',
  padding: '4px 10px',
  fontSize: '11px',
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
}
