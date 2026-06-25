import React, { useEffect, useState } from 'react'
import type { AiPushBrief } from '../../core/ai/types'
import { useAiStore } from '../store/aiStore'
import { STR } from '../strings'

interface PushBriefPanelProps {
  repositoryId: string
  remoteName: string
  branch: string
  github?: {
    assignedLogin?: string
    effectiveLogin?: string
    hasToken: boolean
    tokenInvalid: boolean
  }
}

export default function PushBriefPanel({
  repositoryId,
  remoteName,
  branch,
  github,
}: PushBriefPanelProps): React.ReactElement {
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const previewContext = useAiStore((s) => s.previewContext)
  const generatePushBrief = useAiStore((s) => s.generatePushBrief)

  const [brief, setBrief] = useState<AiPushBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewSeen, setPreviewSeen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPreviewSeen(false)
    void window.api.pushBrief
      .buildDeterministic({ repositoryId, remoteName, branch, github })
      .then((res) => {
        if (cancelled) return
        if (res.ok) setBrief(res.data)
        else setError(STR.PUSH_BRIEF_ERROR)
      })
      .catch(() => {
        if (!cancelled) setError(STR.PUSH_BRIEF_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repositoryId, remoteName, branch, github])

  const handlePreview = async () => {
    setPreviewLoading(true)
    setError(null)
    try {
      const preview = await previewContext({
        repositoryId,
        kind: 'push-brief',
        remoteName,
        branch,
        pushGithub: github,
      })
      if (preview) setPreviewSeen(true)
      else setError(STR.PUSH_BRIEF_PREVIEW_ERROR)
    } catch {
      setError(STR.PUSH_BRIEF_PREVIEW_ERROR)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleEnhanceWithAi = async () => {
    if (!previewSeen) return
    setAiLoading(true)
    setError(null)
    try {
      const result = await generatePushBrief({ repositoryId, remoteName, branch, github })
      if (result) setBrief(result)
      else setError(STR.PUSH_BRIEF_AI_ERROR)
    } catch {
      setError(STR.PUSH_BRIEF_AI_ERROR)
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div
        data-testid="push-brief-loading"
        style={{
          marginBottom: '16px',
          fontSize: '12px',
          color: 'var(--gw-text-faint, #71717a)',
        }}
      >
        {STR.PUSH_BRIEF_LOADING}
      </div>
    )
  }

  if (!brief) {
    return error ? (
      <div
        data-testid="push-brief-error"
        style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--gw-danger, #f87171)' }}
      >
        {error}
      </div>
    ) : (
      <></>
    )
  }

  return (
    <div
      data-testid="push-brief-panel"
      style={{
        border: '1px solid var(--gw-border, #27272a)',
        borderRadius: '4px',
        padding: '12px',
        marginBottom: '16px',
        background: 'var(--gw-bg, #09090b)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gw-text, #f4f4f5)' }}>
          {STR.PUSH_BRIEF_TITLE}
        </span>
        <span
          data-testid="push-brief-source"
          style={{
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--gw-text-faint, #71717a)',
          }}
        >
          {brief.source === 'ai' ? STR.PUSH_BRIEF_SOURCE_AI : STR.PUSH_BRIEF_SOURCE_DETERMINISTIC}
        </span>
      </div>

      <p
        data-testid="push-brief-summary"
        style={{
          margin: '0 0 10px',
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'var(--gw-text-muted, #a1a1aa)',
        }}
      >
        {brief.summary}
      </p>

      {brief.highlights.length > 0 && (
        <ul
          data-testid="push-brief-highlights"
          style={{
            margin: '0 0 10px',
            paddingLeft: '18px',
            fontSize: '12px',
            color: 'var(--gw-text-muted, #a1a1aa)',
            lineHeight: 1.6,
          }}
        >
          {brief.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      <div
        data-testid="push-brief-identity"
        style={{
          fontSize: '12px',
          color: 'var(--gw-info, #60a5fa)',
          lineHeight: 1.5,
          borderTop: '1px solid var(--gw-border, #27272a)',
          paddingTop: '8px',
        }}
      >
        {brief.identityNote}
      </div>

      {aiEnabled && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!previewSeen && (
            <button
              type="button"
              data-testid="push-brief-preview-btn"
              onClick={() => void handlePreview()}
              disabled={previewLoading}
              style={secondaryBtnStyle}
            >
              {previewLoading ? STR.PUSH_BRIEF_PREVIEW_LOADING : STR.AI_PREVIEW_BUTTON}
            </button>
          )}
          {previewSeen && brief.source === 'deterministic' && (
            <button
              type="button"
              data-testid="push-brief-ai-btn"
              onClick={() => void handleEnhanceWithAi()}
              disabled={aiLoading}
              style={secondaryBtnStyle}
            >
              {aiLoading ? STR.PUSH_BRIEF_AI_LOADING : STR.PUSH_BRIEF_ENHANCE_BTN}
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
