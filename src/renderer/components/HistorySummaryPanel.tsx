import React, { useEffect, useState } from 'react'
import type { AiHistorySummary } from '../../core/ai/types'
import { useAiStore } from '../store/aiStore'
import { STR } from '../strings'

interface HistorySummaryPanelProps {
  repositoryId: string
}

export default function HistorySummaryPanel({
  repositoryId,
}: HistorySummaryPanelProps): React.ReactElement | null {
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const previewContext = useAiStore((s) => s.previewContext)
  const generateHistorySummary = useAiStore((s) => s.generateHistorySummary)

  const [expanded, setExpanded] = useState(false)
  const [summary, setSummary] = useState<AiHistorySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewSeen, setPreviewSeen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = () => {
    if (expanded) return
    setExpanded(true)
    if (summary) return
    setLoading(true)
    setError(null)
    void window.api.historySummary
      .buildDeterministic({ repositoryId })
      .then((res) => {
        if (res.ok) setSummary(res.data)
        else setError(STR.HISTORY_SUMMARY_ERROR)
      })
      .catch(() => setError(STR.HISTORY_SUMMARY_ERROR))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setExpanded(false)
    setSummary(null)
    setPreviewSeen(false)
    setError(null)
  }, [repositoryId])

  const handlePreview = async () => {
    setPreviewLoading(true)
    setError(null)
    try {
      const preview = await previewContext({ repositoryId, kind: 'history-summary' })
      if (preview) setPreviewSeen(true)
      else setError(STR.HISTORY_SUMMARY_PREVIEW_ERROR)
    } catch {
      setError(STR.HISTORY_SUMMARY_PREVIEW_ERROR)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleEnhanceWithAi = async () => {
    if (!previewSeen) return
    setAiLoading(true)
    setError(null)
    try {
      const result = await generateHistorySummary({ repositoryId })
      if (result) setSummary(result)
      else setError(STR.HISTORY_SUMMARY_AI_ERROR)
    } catch {
      setError(STR.HISTORY_SUMMARY_AI_ERROR)
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
        flexShrink: 0,
      }}
    >
      {!expanded ? (
        <button
          type="button"
          data-testid="history-summary-open-btn"
          onClick={handleOpen}
          style={{
            background: 'transparent',
            border: '1px solid var(--gw-surface3, #3f3f46)',
            borderRadius: '4px',
            padding: '6px 12px',
            fontSize: '12px',
            color: 'var(--gw-text-muted, #a1a1aa)',
            cursor: 'pointer',
          }}
        >
          {STR.HISTORY_SUMMARY_OPEN_BTN}
        </button>
      ) : (
        <div data-testid="history-summary-panel">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{STR.HISTORY_SUMMARY_TITLE}</span>
            {summary && (
              <span
                data-testid="history-summary-source"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--gw-text-faint, #71717a)',
                }}
              >
                {summary.source === 'ai'
                  ? STR.HISTORY_SUMMARY_SOURCE_AI
                  : STR.HISTORY_SUMMARY_SOURCE_DETERMINISTIC}
              </span>
            )}
          </div>

          {loading && (
            <div style={{ fontSize: '12px', color: 'var(--gw-text-faint, #71717a)' }}>
              {STR.HISTORY_SUMMARY_LOADING}
            </div>
          )}

          {summary && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <section>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--gw-text-dim, #52525b)',
                    marginBottom: '4px',
                  }}
                >
                  {STR.HISTORY_SUMMARY_RELEASE_NOTES}
                </div>
                <pre data-testid="history-summary-release-notes" style={preStyle}>
                  {summary.releaseNotesDraft}
                </pre>
              </section>
              <section>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--gw-text-dim, #52525b)',
                    marginBottom: '4px',
                  }}
                >
                  {STR.HISTORY_SUMMARY_BRANCH_ACTIVITY}
                </div>
                <p
                  data-testid="history-summary-branch-activity"
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: 'var(--gw-text-muted, #a1a1aa)',
                  }}
                >
                  {summary.branchActivity}
                </p>
              </section>
              <section>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--gw-text-dim, #52525b)',
                    marginBottom: '4px',
                  }}
                >
                  {STR.HISTORY_SUMMARY_CHANGELOG}
                </div>
                <pre data-testid="history-summary-changelog" style={preStyle}>
                  {summary.changelogDraft}
                </pre>
              </section>
            </div>
          )}

          {aiEnabled && summary && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!previewSeen && (
                <button
                  type="button"
                  data-testid="history-summary-preview-btn"
                  onClick={() => void handlePreview()}
                  disabled={previewLoading}
                  style={secondaryBtnStyle}
                >
                  {previewLoading ? STR.HISTORY_SUMMARY_PREVIEW_LOADING : STR.AI_PREVIEW_BUTTON}
                </button>
              )}
              {previewSeen && summary.source === 'deterministic' && (
                <button
                  type="button"
                  data-testid="history-summary-ai-btn"
                  onClick={() => void handleEnhanceWithAi()}
                  disabled={aiLoading}
                  style={secondaryBtnStyle}
                >
                  {aiLoading ? STR.HISTORY_SUMMARY_AI_LOADING : STR.HISTORY_SUMMARY_ENHANCE_BTN}
                </button>
              )}
            </div>
          )}

          {error && (
            <div
              data-testid="history-summary-error"
              style={{ marginTop: '8px', fontSize: '12px', color: 'var(--gw-danger, #f87171)' }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px 10px',
  background: 'var(--gw-bg, #09090b)',
  border: '1px solid var(--gw-border, #27272a)',
  borderRadius: '4px',
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--gw-text-muted, #a1a1aa)',
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
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
