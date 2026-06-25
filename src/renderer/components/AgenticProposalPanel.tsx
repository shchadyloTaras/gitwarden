import React, { useState } from 'react'
import type { AiAgenticProposal } from '../../core/ai/types'
import { useAiStore } from '../store/aiStore'
import { useAppStore } from '../store/appStore'
import { STR } from '../strings'

export default function AgenticProposalPanel(): React.ReactElement | null {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const previewContext = useAiStore((s) => s.previewContext)

  const [prompt, setPrompt] = useState('')
  const [proposal, setProposal] = useState<AiAgenticProposal | null>(null)
  const [previewSeen, setPreviewSeen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!activeRepo || !aiEnabled) return null

  const handlePreview = async () => {
    setError(null)
    const preview = await previewContext({
      repositoryId: activeRepo.id,
      kind: 'agentic-proposal',
      commitMessage: prompt,
    })
    if (preview) setPreviewSeen(true)
    else setError(STR.AGENTIC_PREVIEW_REQUIRED)
  }

  const handlePropose = async () => {
    if (!previewSeen || !prompt.trim()) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await window.api.ai.proposeAgenticActions({
        repositoryId: activeRepo.id,
        prompt: prompt.trim(),
      })
      if (result.ok) setProposal(result.data)
      else setError(STR.AGENTIC_PROPOSE_ERROR)
    } catch {
      setError(STR.AGENTIC_PROPOSE_ERROR)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = () => {
    setProposal(null)
    setMessage(null)
  }

  const handleConfirm = async () => {
    if (!proposal || proposal.fileEdits.length === 0) return
    setExecuting(true)
    setError(null)
    try {
      const result = await window.api.ai.executeAgenticProposal({
        repositoryId: activeRepo.id,
        fileEdits: proposal.fileEdits,
      })
      if (result.ok) {
        setMessage(STR.AGENTIC_EXECUTED)
        setProposal(null)
      } else setError(STR.AGENTIC_PROPOSE_ERROR)
    } catch {
      setError(STR.AGENTIC_PROPOSE_ERROR)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: '12px 14px',
        border: '1px solid var(--gw-border, #27272a)',
        borderRadius: 6,
        background: 'var(--gw-surface, #18181b)',
      }}
      data-testid="agentic-proposal-panel"
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{STR.AGENTIC_TITLE}</div>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--gw-text-faint, #71717a)' }}>
        {STR.AGENTIC_HINT}
      </p>
      <textarea
        data-testid="agentic-prompt-input"
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value)
          setPreviewSeen(false)
          setProposal(null)
        }}
        placeholder={STR.AGENTIC_PROMPT_PLACEHOLDER}
        rows={2}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'var(--gw-bg, #09090b)',
          border: '1px solid var(--gw-border, #27272a)',
          borderRadius: 4,
          color: 'var(--gw-text-muted, #a1a1aa)',
          fontSize: 12,
          padding: '8px 10px',
          marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {!previewSeen && (
          <button
            type="button"
            data-testid="agentic-preview-btn"
            onClick={() => void handlePreview()}
            style={btnStyle}
          >
            {STR.AI_PREVIEW_BUTTON}
          </button>
        )}
        {previewSeen && !proposal && (
          <button
            type="button"
            data-testid="agentic-propose-btn"
            onClick={() => void handlePropose()}
            disabled={loading || !prompt.trim()}
            style={btnStyle}
          >
            {loading ? STR.AGENTIC_PROPOSE_LOADING : STR.AGENTIC_PROPOSE_BUTTON}
          </button>
        )}
      </div>

      {proposal && (
        <div data-testid="agentic-proposal-review">
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--gw-text-muted, #a1a1aa)' }}>
            {proposal.summary}
          </p>
          {proposal.fileEdits.length > 0 && (
            <section style={{ marginBottom: 8 }}>
              <div style={labelStyle}>{STR.AGENTIC_FILE_EDITS}</div>
              {proposal.fileEdits.map((edit) => (
                <pre
                  key={edit.path}
                  data-testid={`agentic-file-edit-${edit.path}`}
                  style={preStyle}
                >
                  {edit.path}
                  {'\n'}
                  {edit.after}
                </pre>
              ))}
            </section>
          )}
          {proposal.actions.length > 0 && (
            <section style={{ marginBottom: 8 }}>
              <div style={labelStyle}>{STR.AGENTIC_ACTIONS}</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 12,
                  color: 'var(--gw-text-muted, #a1a1aa)',
                }}
              >
                {proposal.actions.map((action, index) => (
                  <li key={`${action.kind}-${index}`}>
                    {action.kind}
                    {action.target ? ` → ${action.target}` : ''}
                    {action.command ? ` (${action.command})` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              data-testid="agentic-reject-btn"
              onClick={handleReject}
              style={btnStyle}
            >
              {STR.AGENTIC_REJECT_BUTTON}
            </button>
            {proposal.fileEdits.length > 0 && (
              <button
                type="button"
                data-testid="agentic-confirm-btn"
                onClick={() => void handleConfirm()}
                disabled={executing}
                style={btnStyle}
              >
                {executing ? STR.AGENTIC_EXECUTING : STR.AGENTIC_CONFIRM_BUTTON}
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <div
          data-testid="agentic-success"
          style={{ marginTop: 8, fontSize: 12, color: 'var(--gw-success, #4ade80)' }}
        >
          {message}
        </div>
      )}
      {error && (
        <div
          data-testid="agentic-error"
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

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--gw-text-dim, #52525b)',
  marginBottom: 4,
}

const preStyle: React.CSSProperties = {
  margin: '0 0 6px',
  padding: '8px 10px',
  background: 'var(--gw-bg, #09090b)',
  border: '1px solid var(--gw-border, #27272a)',
  borderRadius: 4,
  fontSize: 11,
  lineHeight: 1.4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  whiteSpace: 'pre-wrap',
  fontFamily: 'monospace',
}
