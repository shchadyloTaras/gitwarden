import React, { useState } from 'react'
import type { AiFailureExplanation } from '../../core/ai/types'
import { useAiStore } from '../store/aiStore'
import { STR } from '../strings'

interface FailureExplainPanelProps {
  repositoryId: string
}

export default function FailureExplainPanel({
  repositoryId,
}: FailureExplainPanelProps): React.ReactElement {
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const [output, setOutput] = useState('')
  const [explanation, setExplanation] = useState<AiFailureExplanation | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExplain = async () => {
    const trimmed = output.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.failureExplain.toolOutput({
        repositoryId,
        output: trimmed,
      })
      if (result.ok) setExplanation(result.data)
      else setError(STR.FAILURE_EXPLAIN_ERROR)
    } catch {
      setError(STR.FAILURE_EXPLAIN_ERROR)
    } finally {
      setLoading(false)
    }
  }

  const handleEnhance = async () => {
    const trimmed = output.trim()
    if (!trimmed) return
    setAiLoading(true)
    setError(null)
    try {
      const result = await window.api.ai.explainToolOutput({ repositoryId, output: trimmed })
      if (result.ok) setExplanation(result.data)
      else setError(STR.FAILURE_EXPLAIN_AI_ERROR)
    } catch {
      setError(STR.FAILURE_EXPLAIN_AI_ERROR)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--gw-border, #27272a)',
        background: 'var(--gw-surface, #18181b)',
      }}
      data-testid="failure-explain-panel"
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {STR.FAILURE_EXPLAIN_TITLE}
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--gw-text-faint, #71717a)' }}>
        {STR.FAILURE_EXPLAIN_HINT}
      </p>
      <textarea
        data-testid="failure-explain-input"
        value={output}
        onChange={(e) => setOutput(e.target.value)}
        placeholder={STR.FAILURE_EXPLAIN_PLACEHOLDER}
        rows={4}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'var(--gw-bg, #09090b)',
          border: '1px solid var(--gw-border, #27272a)',
          borderRadius: 4,
          color: 'var(--gw-text-muted, #a1a1aa)',
          fontSize: 12,
          fontFamily: 'monospace',
          padding: '8px 10px',
          marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="failure-explain-btn"
          onClick={() => void handleExplain()}
          disabled={loading || !output.trim()}
          style={btnStyle}
        >
          {loading ? STR.FAILURE_EXPLAIN_LOADING : STR.FAILURE_EXPLAIN_BUTTON}
        </button>
        {aiEnabled && explanation && explanation.source === 'deterministic' && (
          <button
            type="button"
            data-testid="failure-explain-ai-btn"
            onClick={() => void handleEnhance()}
            disabled={aiLoading}
            style={btnStyle}
          >
            {aiLoading ? STR.FAILURE_EXPLAIN_LOADING : STR.FAILURE_EXPLAIN_ENHANCE_BTN}
          </button>
        )}
      </div>
      {explanation && (
        <div style={{ marginTop: 10 }} data-testid="failure-explain-result">
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--gw-text-muted, #a1a1aa)' }}>
            {explanation.explanation}
          </p>
          <div style={{ fontSize: 11, color: 'var(--gw-text-dim, #52525b)' }}>
            {STR.FAILURE_EXPLAIN_ACTION_HINT}: {explanation.actionHint}
          </div>
        </div>
      )}
      {error && (
        <div
          data-testid="failure-explain-error"
          style={{ marginTop: 8, fontSize: 12, color: 'var(--gw-danger, #f87171)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--gw-border-strong, #52525b)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
}
