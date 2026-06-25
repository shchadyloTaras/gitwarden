import React, { useEffect, useMemo, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useCommitStore } from '../store/commitStore'
import { useAppStore } from '../store/appStore'
import { useAiStore } from '../store/aiStore'
import { safetyCheckService } from '../../core/safety/SafetyCheckService'
import type { AiPreparedContext } from '../../core/ai/context'
import type { AiCommitDraft, AiReviewFinding } from '../../core/ai/types'
import { STR } from '../strings'

const IDENTITY_CODES = new Set(['IDENTITY_UNSET', 'EMAIL_MISMATCH', 'EMAIL_FROM_GLOBAL_ONLY'])

export default function CommitScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const { profiles, activeProfileId } = useProfilesStore()
  const {
    repository,
    message,
    status,
    identity,
    loading,
    identityLoading,
    commitLoading,
    error,
    committedHash,
    load,
    setMessage,
    applyLocalIdentity,
    doCommit,
  } = useCommitStore()

  const activeProfile = profiles.find((p) => p.id === activeProfileId)
  const previewContext = useAiStore((s) => s.previewContext)
  const draftCommitMessage = useAiStore((s) => s.draftCommitMessage)
  const aiError = useAiStore((s) => s.error)
  const loadAi = useAiStore((s) => s.load)
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const connections = useAiStore((s) => s.connections)
  // AI on the Commit tab is limited to the commit message. It is offered only when a
  // connection exists and AI is enabled; redaction/enablement rules still apply per send.
  const aiAvailable = aiEnabled && connections.length > 0

  // Inline commit-message AI assistant state.
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPreview, setAiPreview] = useState<AiPreparedContext | null>(null)
  const [aiPreviewSeen, setAiPreviewSeen] = useState(false)
  const [aiPreviewLoading, setAiPreviewLoading] = useState(false)
  const [aiPreviewError, setAiPreviewError] = useState<string | null>(null)
  const [commitDraft, setCommitDraft] = useState<AiCommitDraft | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  // Deterministic-only change scan (Safety Engine, not AI) — feeds the commit gate.
  const [deterministicFindings, setDeterministicFindings] = useState<AiReviewFinding[]>([])

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [load, activeRepo])

  // Keep the AI enablement/connection state fresh so the commit-message affordance
  // reflects what the user set up in the AI Chat panel / Settings.
  useEffect(() => {
    void loadAi()
  }, [loadAi])

  // Reset the inline AI assistant when the repo or message changes (a stale draft
  // must not linger after manual edits). Deterministic findings are owned by the
  // scan effect below — never cleared here, so the secret gate can't be typed away.
  useEffect(() => {
    setAiOpen(false)
    setAiPreview(null)
    setAiPreviewSeen(false)
    setAiPreviewError(null)
    setCommitDraft(null)
    setAssistantError(null)
  }, [activeRepo?.id, message])

  const stagedFiles = useMemo(
    () =>
      (status?.files ?? []).filter(
        (f) =>
          f.indexStatus !== 'unmodified' &&
          f.indexStatus !== 'untracked' &&
          f.indexStatus !== 'ignored' &&
          f.indexStatus !== 'conflicted'
      ),
    [status]
  )

  const stagedPathsKey = useMemo(() => stagedFiles.map((f) => f.path).join('\0'), [stagedFiles])

  useEffect(() => {
    if (!repository || stagedFiles.length === 0) {
      setDeterministicFindings([])
      return
    }
    let cancelled = false
    void window.api.changeReview
      .scanStaged({ repositoryId: repository.id })
      .then((result) => {
        if (cancelled) return
        setDeterministicFindings(result.ok ? result.data : [])
      })
      .catch(() => {
        if (!cancelled) setDeterministicFindings([])
      })
    return () => {
      cancelled = true
    }
  }, [repository, stagedFiles.length, stagedPathsKey])

  const safetyResult = useMemo(() => {
    if (!status || !identity || !repository) return null
    return safetyCheckService.checkCommit({
      repository,
      activeProfile,
      identity,
      status,
      commitMessage: message,
      reviewFindings: deterministicFindings,
    })
  }, [status, identity, repository, activeProfile, message, deterministicFindings])

  const blockers = safetyResult?.issues.filter((i) => i.severity === 'blocker') ?? []
  const warnings = safetyResult?.issues.filter((i) => i.severity === 'warning') ?? []
  const advisoryFindings = useMemo(
    () => deterministicFindings.filter((f) => f.category !== 'secret-like'),
    [deterministicFindings]
  )
  const hasIdentityIssue = safetyResult?.issues.some((i) => IDENTITY_CODES.has(i.code)) ?? false
  const canSetIdentity = hasIdentityIssue && !!activeProfile && !identityLoading

  const handleSetIdentity = async () => {
    if (!activeProfile) return
    await applyLocalIdentity(activeProfile.gitAuthorName, activeProfile.gitAuthorEmail)
  }

  const handleCommit = async () => {
    if (!safetyResult?.canCommit || commitLoading) return
    await doCommit(message)
  }

  const handleAiPreview = async () => {
    if (!repository) return
    setAiPreviewLoading(true)
    setAiPreviewError(null)
    setAiPreview(null)
    try {
      const preview = await previewContext({
        repositoryId: repository.id,
        kind: 'commit-draft',
        commitMessage: message,
      })
      if (preview) {
        setAiPreview(preview)
        setAiPreviewSeen(true)
      } else setAiPreviewError(STR.AI_PREVIEW_ERROR)
    } catch (err) {
      setAiPreviewError(err instanceof Error ? err.message : STR.AI_PREVIEW_ERROR)
    } finally {
      setAiPreviewLoading(false)
    }
  }

  const handleDraftMessage = async () => {
    if (!repository || !aiPreviewSeen) return
    setDraftLoading(true)
    setAssistantError(null)
    setCommitDraft(null)
    try {
      const draft = await draftCommitMessage({
        repositoryId: repository.id,
        commitMessage: message,
      })
      if (draft) setCommitDraft(draft)
      else setAssistantError(aiError ?? STR.AI_COMMIT_DRAFT_ERROR)
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : STR.AI_COMMIT_DRAFT_ERROR)
    } finally {
      setDraftLoading(false)
    }
  }

  const insertCommitText = (text: string) => {
    setMessage(text)
  }

  const insertCommitWithBody = (subject: string, body?: string) => {
    const trimmedBody = body?.trim()
    setMessage(trimmedBody ? `${subject}\n\n${trimmedBody}` : subject)
  }

  const assistantReady = aiPreviewSeen && !aiPreviewLoading
  const assistantBusy = draftLoading

  // Open the inline assistant and immediately build the (local, redacted) send
  // preview so the user sees what would be sent before pressing Draft.
  const handleToggleAi = async () => {
    if (aiOpen) {
      setAiOpen(false)
      return
    }
    setAiOpen(true)
    await handleAiPreview()
  }

  return (
    <div
      data-testid="screen-commit"
      style={{ padding: '24px', maxWidth: '720px', fontFamily: 'inherit' }}
    >
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600 }}>Commit</h2>

      {loading && (
        <div
          style={{ color: 'var(--gw-text-faint, #71717a)', fontSize: '13px', marginBottom: '16px' }}
        >
          Loading…
        </div>
      )}

      {!loading && !repository && !activeRepo && (
        <div style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: '13px' }}>
          Add a repository to get started.
        </div>
      )}

      {!loading && repository && (
        <>
          {/* Staged changes summary */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--gw-text-faint, #71717a)',
                marginBottom: '6px',
              }}
            >
              Staged Changes ({stagedFiles.length})
            </div>
            <div
              data-testid="commit-staged-summary"
              style={{
                background: 'var(--gw-surface, #18181b)',
                border: '1px solid var(--gw-border, #27272a)',
                borderRadius: '4px',
                padding: stagedFiles.length ? '8px' : '10px 12px',
                fontSize: '13px',
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            >
              {stagedFiles.length === 0 ? (
                <span style={{ color: 'var(--gw-text-dim, #52525b)' }}>No staged changes</span>
              ) : (
                stagedFiles.map((f) => (
                  <div
                    key={f.path}
                    style={{ color: 'var(--gw-success, #4ade80)', padding: '2px 0' }}
                  >
                    + {f.path}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Commit message (with the one and only Commit-tab AI affordance) */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '4px',
              }}
            >
              <label
                style={{
                  fontSize: '12px',
                  color: 'var(--gw-text-faint, #71717a)',
                }}
              >
                Commit Message
              </label>
              {aiAvailable && (
                <button
                  data-testid="ai-commit-draft-toggle"
                  onClick={() => void handleToggleAi()}
                  style={{
                    background: aiOpen ? 'var(--gw-accent-soft, #1e1b4b)' : 'none',
                    color: 'var(--gw-accent-text, #a5b4fc)',
                    border: '1px solid var(--gw-surface3, #3f3f46)',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {aiOpen ? STR.AI_COMMIT_DRAFT_CLOSE : STR.AI_COMMIT_DRAFT_TOGGLE}
                </button>
              )}
            </div>
            <textarea
              data-testid="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes…"
              rows={4}
              style={{
                width: '100%',
                padding: '8px',
                background: 'var(--gw-input-bg, #09090b)',
                border: '1px solid var(--gw-border-subtle, #3f3f46)',
                borderRadius: '4px',
                color: 'var(--gw-text, #f4f4f5)',
                fontSize: '13px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />

            {aiOpen && (
              <div
                data-testid="ai-commit-assistant"
                style={{
                  marginTop: '10px',
                  border: '1px solid var(--gw-border, #27272a)',
                  borderRadius: '4px',
                  background: 'var(--gw-surface, #18181b)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '10px 12px',
                    fontSize: 11,
                    color: 'var(--gw-text-faint, #71717a)',
                    borderBottom: '1px solid var(--gw-border, #27272a)',
                  }}
                >
                  {STR.AI_COMMIT_ASSISTANT_HINT}
                </div>

                {aiPreviewError && (
                  <div
                    data-testid="ai-preview-error"
                    style={{
                      padding: '8px 12px',
                      color: 'var(--gw-danger, #f87171)',
                      fontSize: 12,
                    }}
                  >
                    {aiPreviewError}
                  </div>
                )}

                {aiPreview && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--gw-border, #27272a)',
                    }}
                  >
                    <div
                      data-testid="ai-preview-host"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--gw-accent-text, #a5b4fc)',
                        marginBottom: 6,
                      }}
                    >
                      {STR.AI_PREVIEW_HOST(aiPreview.destinationHost)}
                    </div>
                    <div
                      data-testid="ai-preview-redactions"
                      style={{
                        fontSize: 11,
                        color: 'var(--gw-text-faint, #71717a)',
                        marginBottom: 8,
                      }}
                    >
                      {STR.AI_PREVIEW_REDACTIONS(aiPreview.redactions.count)}
                      {aiPreview.truncated
                        ? ` ${STR.AI_PREVIEW_TRUNCATED(aiPreview.omittedChars)}`
                        : ''}
                    </div>
                    <details>
                      <summary
                        style={{
                          fontSize: 11,
                          color: 'var(--gw-text-muted, #a1a1aa)',
                          cursor: 'pointer',
                        }}
                      >
                        {STR.AI_PREVIEW_PAYLOAD_LABEL}
                      </summary>
                      <pre
                        data-testid="ai-preview-payload"
                        style={{
                          margin: '8px 0 0',
                          maxHeight: 220,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background: 'var(--gw-input-bg, #09090b)',
                          border: '1px solid var(--gw-border-subtle, #3f3f46)',
                          borderRadius: '4px',
                          padding: '10px',
                          color: 'var(--gw-text, #f4f4f5)',
                          fontSize: 11,
                          lineHeight: '16px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {aiPreview.payloadText}
                      </pre>
                    </details>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', padding: '10px 12px' }}>
                  <button
                    data-testid="ai-draft-message-btn"
                    onClick={() => void handleDraftMessage()}
                    disabled={!assistantReady || assistantBusy}
                    style={{
                      background: 'none',
                      color: assistantReady
                        ? 'var(--gw-text-muted, #a1a1aa)'
                        : 'var(--gw-text-dim, #52525b)',
                      border: '1px solid var(--gw-surface3, #3f3f46)',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: assistantReady && !assistantBusy ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {draftLoading
                      ? STR.AI_COMMIT_DRAFT_LOADING
                      : commitDraft
                        ? STR.AI_COMMIT_DRAFT_REGENERATE
                        : STR.AI_COMMIT_DRAFT_BUTTON}
                  </button>
                </div>

                {assistantError && (
                  <div
                    data-testid="ai-commit-assistant-error"
                    style={{
                      padding: '0 12px 10px',
                      color: 'var(--gw-danger, #f87171)',
                      fontSize: 12,
                    }}
                  >
                    {assistantError}
                  </div>
                )}

                {commitDraft && (
                  <div
                    data-testid="ai-commit-draft"
                    style={{
                      padding: '10px 12px',
                      borderTop: '1px solid var(--gw-border, #27272a)',
                    }}
                  >
                    <DraftOption
                      label={STR.AI_COMMIT_DRAFT_CONVENTIONAL}
                      text={commitDraft.conventional}
                      testId="ai-insert-conventional"
                      onInsert={() =>
                        insertCommitWithBody(commitDraft.conventional, commitDraft.body)
                      }
                    />
                    <DraftOption
                      label={STR.AI_COMMIT_DRAFT_PLAIN}
                      text={commitDraft.plain}
                      testId="ai-insert-plain"
                      onInsert={() => insertCommitWithBody(commitDraft.plain, commitDraft.body)}
                    />
                    <div style={{ fontSize: 12, marginBottom: 8 }}>
                      <span style={{ color: 'var(--gw-text-faint, #71717a)' }}>
                        {STR.AI_COMMIT_DRAFT_SUMMARY}:{' '}
                      </span>
                      <span data-testid="ai-commit-draft-summary">{commitDraft.summary}</span>
                    </div>
                    {commitDraft.body && (
                      <DraftOption
                        label={STR.AI_COMMIT_DRAFT_BODY}
                        text={commitDraft.body}
                        testId="ai-insert-body"
                        onInsert={() => insertCommitText(commitDraft.body ?? '')}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Safety issues */}
          {safetyResult && safetyResult.issues.length > 0 && (
            <div
              data-testid="commit-safety-issues"
              style={{
                marginBottom: '16px',
                border: '1px solid var(--gw-border, #27272a)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              {blockers.map((issue) => (
                <div
                  key={issue.code}
                  data-testid="commit-blocker"
                  style={{
                    padding: '8px 12px',
                    background: 'var(--gw-danger-bg, #450a0a)',
                    borderBottom: '1px solid var(--gw-danger-border, #991b1b)',
                    fontSize: '13px',
                    color: 'var(--gw-danger, #f87171)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <span style={{ flexShrink: 0 }}>⛔</span>
                  <span>{issue.message}</span>
                </div>
              ))}
              {warnings.map((issue) => (
                <div
                  key={issue.code}
                  data-testid="commit-warning"
                  style={{
                    padding: '8px 12px',
                    background: 'var(--gw-warning-bg, #422006)',
                    borderBottom: '1px solid var(--gw-warning-border, #78350f)',
                    fontSize: '13px',
                    color: 'var(--gw-warning, #fbbf24)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <span style={{ flexShrink: 0 }}>⚠</span>
                  <span>{issue.message}</span>
                </div>
              ))}
              {canSetIdentity && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--gw-accent-soft, #1e1b4b)',
                    borderTop:
                      blockers.length + warnings.length > 0
                        ? '1px solid var(--gw-accent-soft, #1e1b4b)'
                        : 'none',
                  }}
                >
                  <button
                    data-testid="commit-set-identity-btn"
                    onClick={handleSetIdentity}
                    disabled={identityLoading}
                    style={{
                      background: 'var(--gw-primary, #2563eb)',
                      color: 'var(--gw-on-solid, #fff)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: identityLoading ? 'wait' : 'pointer',
                    }}
                  >
                    {identityLoading
                      ? 'Setting…'
                      : `Set local identity to "${activeProfile!.displayName}" (${activeProfile!.gitAuthorName} <${activeProfile!.gitAuthorEmail}>)`}
                  </button>
                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '11px',
                      color: 'var(--gw-text-dim, #52525b)',
                    }}
                  >
                    This changes local repository Git config only, not global Git config.
                  </div>
                </div>
              )}
            </div>
          )}

          {advisoryFindings.length > 0 && (
            <details
              data-testid="commit-review-advisories"
              style={{
                marginBottom: '16px',
                border: '1px solid var(--gw-border, #27272a)',
                borderRadius: '4px',
                background: 'var(--gw-surface, #18181b)',
                overflow: 'hidden',
              }}
            >
              <summary
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: 'var(--gw-text-faint, #71717a)',
                  cursor: 'pointer',
                  listStylePosition: 'inside',
                }}
              >
                Change review advisories ({advisoryFindings.length})
              </summary>
              <div
                style={{
                  borderTop: '1px solid var(--gw-border, #27272a)',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              >
                {advisoryFindings.map((finding) => (
                  <div
                    key={`${finding.category}\0${finding.file ?? ''}\0${finding.why}`}
                    data-testid="commit-review-advisory"
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: 'var(--gw-text-muted, #a1a1aa)',
                      borderBottom: '1px solid var(--gw-surface, #18181b)',
                    }}
                  >
                    {finding.why}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Commit error */}
          {error && (
            <div
              style={{ color: 'var(--gw-danger, #f87171)', fontSize: '13px', marginBottom: '12px' }}
            >
              {error}
            </div>
          )}

          {/* Success */}
          {committedHash && (
            <div
              data-testid="commit-success"
              style={{
                padding: '10px 14px',
                background: 'var(--gw-success-bg, #052e16)',
                border: '1px solid var(--gw-success-border, #2d4a2d)',
                borderRadius: '4px',
                fontSize: '13px',
                color: 'var(--gw-success, #4ade80)',
                marginBottom: '16px',
              }}
            >
              ✓ Committed {committedHash}
            </div>
          )}

          {/* Commit button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span
              title={
                safetyResult?.canCommit
                  ? undefined
                  : blockers.length > 0
                    ? `Can't commit yet:\n• ${blockers.map((b) => b.message).join('\n• ')}`
                    : 'Stage changes and enter a commit message to commit.'
              }
              style={{ display: 'inline-block' }}
            >
              <button
                data-testid="commit-btn"
                onClick={handleCommit}
                disabled={!safetyResult?.canCommit || commitLoading}
                style={{
                  background: safetyResult?.canCommit
                    ? 'var(--gw-primary, #2563eb)'
                    : 'var(--gw-primary-disabled-bg, #333333)',
                  color: safetyResult?.canCommit
                    ? 'var(--gw-on-solid, #fff)'
                    : 'var(--gw-primary-disabled-text, #555555)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  fontSize: '13px',
                  cursor: safetyResult?.canCommit ? 'pointer' : 'not-allowed',
                }}
              >
                {commitLoading ? 'Committing…' : 'Commit Changes'}
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function DraftOption({
  label,
  text,
  testId,
  onInsert,
}: {
  label: string
  text: string
  testId: string
  onInsert: () => void
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 8,
        fontSize: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: 'var(--gw-text-faint, #71717a)' }}>{label}: </span>
        <span style={{ wordBreak: 'break-word' }}>{text}</span>
      </div>
      <button
        data-testid={testId}
        onClick={onInsert}
        style={{
          flexShrink: 0,
          background: 'var(--gw-primary, #2563eb)',
          color: 'var(--gw-on-solid, #fff)',
          border: 'none',
          borderRadius: '4px',
          padding: '4px 10px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        {STR.AI_COMMIT_INSERT}
      </button>
    </div>
  )
}
