import React from 'react'
import type { AiCommitDraft } from '../../../core/ai/types'
import { useCommitStore } from '../../store/commitStore'
import { useAppStore } from '../../store/appStore'
import { STR } from '../../strings'

/** Build the commit message the same way the inline Commit-screen helper does. */
function buildCommitMessage(draft: AiCommitDraft): string {
  const body = draft.body?.trim()
  return body ? `${draft.conventional}\n\n${body}` : draft.conventional
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--gw-text-faint, #71717a)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: 'var(--gw-text, #f4f4f5)',
          fontFamily: mono ? 'monospace' : 'inherit',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Native card for an AI commit draft. Insert reuses the EXISTING commit-message
 * path (`useCommitStore.setMessage`) and navigates to the Commit screen — the
 * user still commits through the Safety Engine. No new mutate path.
 */
export default function CommitDraftCard({ draft }: { draft: AiCommitDraft }): React.ReactElement {
  const setMessage = useCommitStore((s) => s.setMessage)
  const navigate = useAppStore((s) => s.navigate)
  const body = draft.body?.trim()

  function handleInsert(): void {
    setMessage(buildCommitMessage(draft))
    navigate('commit')
  }

  return (
    <div
      data-testid="ai-chat-commit-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px',
        background: 'var(--gw-surface, #18181b)',
        border: '1px solid var(--gw-border-subtle, #3f3f46)',
        borderRadius: 8,
      }}
    >
      <Field label={STR.AI_COMMIT_DRAFT_CONVENTIONAL} value={draft.conventional} mono />
      <Field label={STR.AI_COMMIT_DRAFT_PLAIN} value={draft.plain} />
      {draft.summary && <Field label={STR.AI_COMMIT_DRAFT_SUMMARY} value={draft.summary} />}
      {body && <Field label={STR.AI_COMMIT_DRAFT_BODY} value={body} mono />}
      <div>
        <button
          type="button"
          data-testid="ai-chat-commit-insert"
          onClick={handleInsert}
          style={{
            marginTop: 2,
            padding: '5px 12px',
            background: 'var(--gw-accent, #6366f1)',
            color: 'var(--gw-on-solid, #fff)',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {STR.AI_COMMIT_INSERT}
        </button>
      </div>
    </div>
  )
}
