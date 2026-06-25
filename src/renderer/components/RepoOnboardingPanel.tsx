import React, { useEffect, useState } from 'react'
import type { AiAllowlistedFile, AiRepoBrief } from '../../core/ai/types'
import { useAiStore } from '../store/aiStore'
import { STR } from '../strings'

interface RepoOnboardingPanelProps {
  repositoryId: string
}

export default function RepoOnboardingPanel({
  repositoryId,
}: RepoOnboardingPanelProps): React.ReactElement {
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const previewContext = useAiStore((s) => s.previewContext)

  const [expanded, setExpanded] = useState(false)
  const [brief, setBrief] = useState<AiRepoBrief | null>(null)
  const [allowlisted, setAllowlisted] = useState<AiAllowlistedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [previewSeen, setPreviewSeen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setExpanded(false)
    setBrief(null)
    setAllowlisted([])
    setPreviewSeen(false)
    setError(null)
  }, [repositoryId])

  const handleOpen = () => {
    if (expanded) return
    setExpanded(true)
    if (brief) return
    setLoading(true)
    setError(null)
    void Promise.all([
      window.api.repoBrief.buildDeterministic({ repositoryId }),
      window.api.repoBrief.listAllowlistedFiles({ repositoryId }),
    ])
      .then(([briefRes, filesRes]) => {
        if (briefRes.ok) setBrief(briefRes.data)
        else setError(STR.REPO_ONBOARDING_ERROR)
        if (filesRes.ok) setAllowlisted(filesRes.data)
      })
      .catch(() => setError(STR.REPO_ONBOARDING_ERROR))
      .finally(() => setLoading(false))
  }

  const handlePreview = async () => {
    setPreviewLoading(true)
    setError(null)
    try {
      const preview = await previewContext({ repositoryId, kind: 'repo-brief' })
      if (preview) setPreviewSeen(true)
      else setError(STR.REPO_ONBOARDING_PREVIEW_ERROR)
    } catch {
      setError(STR.REPO_ONBOARDING_PREVIEW_ERROR)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleEnhance = async () => {
    if (!previewSeen) return
    setAiLoading(true)
    setError(null)
    try {
      const result = await window.api.ai.generateRepoBrief({ repositoryId })
      if (result.ok) setBrief(result.data)
      else setError(STR.REPO_ONBOARDING_AI_ERROR)
    } catch {
      setError(STR.REPO_ONBOARDING_AI_ERROR)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div style={containerStyle} data-testid="repo-onboarding-panel-root">
      {!expanded ? (
        <button
          type="button"
          data-testid="repo-onboarding-open-btn"
          onClick={handleOpen}
          style={openBtnStyle}
        >
          {STR.REPO_ONBOARDING_OPEN_BTN}
        </button>
      ) : (
        <div data-testid="repo-onboarding-panel">
          <div style={headerRowStyle}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{STR.REPO_ONBOARDING_TITLE}</span>
            {brief && (
              <span data-testid="repo-onboarding-source" style={sourceBadgeStyle}>
                {brief.source === 'ai'
                  ? STR.REPO_ONBOARDING_SOURCE_AI
                  : STR.REPO_ONBOARDING_SOURCE_DETERMINISTIC}
              </span>
            )}
          </div>

          {loading && <div style={mutedStyle}>{STR.REPO_ONBOARDING_LOADING}</div>}

          {brief && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p data-testid="repo-onboarding-summary" style={bodyStyle}>
                {brief.projectSummary}
              </p>
              <section>
                <div style={sectionLabelStyle}>{STR.REPO_ONBOARDING_INCLUDED_FILES}</div>
                <ul data-testid="repo-onboarding-included-files" style={listStyle}>
                  {(allowlisted.length > 0
                    ? allowlisted
                    : brief.includedFiles.map((p) => ({ path: p, byteLength: 0 }))
                  ).map((file) => (
                    <li key={file.path}>
                      {file.path}
                      {file.byteLength > 0 ? ` (${file.byteLength} B)` : ''}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <div style={sectionLabelStyle}>{STR.REPO_ONBOARDING_BUILD_COMMANDS}</div>
                <p data-testid="repo-onboarding-build" style={bodyStyle}>
                  {brief.buildHint}
                </p>
              </section>
              <section>
                <div style={sectionLabelStyle}>{STR.REPO_ONBOARDING_TEST_COMMANDS}</div>
                <p data-testid="repo-onboarding-test" style={bodyStyle}>
                  {brief.testHint}
                </p>
              </section>
            </div>
          )}

          {aiEnabled && brief && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!previewSeen && (
                <button
                  type="button"
                  data-testid="repo-onboarding-preview-btn"
                  onClick={() => void handlePreview()}
                  disabled={previewLoading}
                  style={secondaryBtnStyle}
                >
                  {previewLoading ? STR.AI_PREVIEW_LOADING : STR.AI_PREVIEW_BUTTON}
                </button>
              )}
              {previewSeen && brief.source === 'deterministic' && (
                <button
                  type="button"
                  data-testid="repo-onboarding-ai-btn"
                  onClick={() => void handleEnhance()}
                  disabled={aiLoading}
                  style={secondaryBtnStyle}
                >
                  {aiLoading ? STR.REPO_ONBOARDING_AI_LOADING : STR.REPO_ONBOARDING_ENHANCE_BTN}
                </button>
              )}
            </div>
          )}

          {error && (
            <div data-testid="repo-onboarding-error" style={errorStyle}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 16,
  borderTop: '1px solid var(--gw-border, #27272a)',
}

const openBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--gw-surface3, #3f3f46)',
  borderRadius: 4,
  padding: '6px 12px',
  fontSize: 12,
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
}

const sourceBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--gw-text-faint, #71717a)',
}

const mutedStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--gw-text-faint, #71717a)',
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--gw-text-muted, #a1a1aa)',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--gw-text-dim, #52525b)',
  marginBottom: 4,
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 12,
  color: 'var(--gw-text-muted, #a1a1aa)',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--gw-border-strong, #52525b)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
}

const errorStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: 'var(--gw-danger, #f87171)',
}
