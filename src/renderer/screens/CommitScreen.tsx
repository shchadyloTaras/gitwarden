import React, { useEffect, useMemo, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useCommitStore } from '../store/commitStore'
import { useAppStore } from '../store/appStore'
import { useAiStore } from '../store/aiStore'
import { safetyCheckService } from '../../core/safety/SafetyCheckService'
import type { AiPreparedContext } from '../../core/ai/context'
import type {
  AiChangeSummary,
  AiChangeReview,
  AiCommitDraft,
  AiReviewFinding,
  AiReviewCategory,
} from '../../core/ai/types'
import { groupFindingsByCategory } from '../../core/ai/changeReview'
import AgenticProposalPanel from '../components/AgenticProposalPanel'
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
  const summarizeStagedChanges = useAiStore((s) => s.summarizeStagedChanges)
  const reviewStagedChanges = useAiStore((s) => s.reviewStagedChanges)
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const [aiPreview, setAiPreview] = useState<AiPreparedContext | null>(null)
  const [aiPreviewSeen, setAiPreviewSeen] = useState(false)
  const [aiPreviewLoading, setAiPreviewLoading] = useState(false)
  const [aiPreviewError, setAiPreviewError] = useState<string | null>(null)
  const [commitDraft, setCommitDraft] = useState<AiCommitDraft | null>(null)
  const [changeSummary, setChangeSummary] = useState<AiChangeSummary | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [summarizeLoading, setSummarizeLoading] = useState(false)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const [deterministicFindings, setDeterministicFindings] = useState<AiReviewFinding[]>([])
  const [changeReview, setChangeReview] = useState<AiChangeReview | null>(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [load, activeRepo])

  useEffect(() => {
    setAiPreview(null)
    setAiPreviewSeen(false)
    setAiPreviewError(null)
    setCommitDraft(null)
    setChangeSummary(null)
    setAssistantError(null)
    setDeterministicFindings([])
    setChangeReview(null)
    setReviewError(null)
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
    setScanLoading(true)
    setReviewError(null)
    void window.api.changeReview
      .scanStaged({ repositoryId: repository.id })
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setDeterministicFindings(result.data)
          setChangeReview(null)
        } else setReviewError(STR.CHANGE_REVIEW_SCAN_ERROR)
      })
      .catch(() => {
        if (!cancelled) setReviewError(STR.CHANGE_REVIEW_SCAN_ERROR)
      })
      .finally(() => {
        if (!cancelled) setScanLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository, stagedFiles.length, stagedPathsKey])

  const reviewFindings = changeReview?.findings ?? deterministicFindings

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
      else setAssistantError(STR.AI_COMMIT_DRAFT_ERROR)
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : STR.AI_COMMIT_DRAFT_ERROR)
    } finally {
      setDraftLoading(false)
    }
  }

  const handleSummarize = async () => {
    if (!repository || !aiPreviewSeen) return
    setSummarizeLoading(true)
    setAssistantError(null)
    setChangeSummary(null)
    try {
      const summary = await summarizeStagedChanges({
        repositoryId: repository.id,
        commitMessage: message,
      })
      if (summary) setChangeSummary(summary)
      else setAssistantError(STR.AI_COMMIT_SUMMARIZE_ERROR)
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : STR.AI_COMMIT_SUMMARIZE_ERROR)
    } finally {
      setSummarizeLoading(false)
    }
  }

  const insertCommitText = (text: string) => {
    setMessage(text)
  }

  const insertCommitWithBody = (subject: string, body?: string) => {
    const trimmedBody = body?.trim()
    setMessage(trimmedBody ? `${subject}\n\n${trimmedBody}` : subject)
  }

  const handleAiReview = async () => {
    if (!repository || !aiPreviewSeen) return
    setReviewLoading(true)
    setReviewError(null)
    try {
      const review = await reviewStagedChanges({
        repositoryId: repository.id,
        commitMessage: message,
      })
      if (review) setChangeReview(review)
      else setReviewError(STR.CHANGE_REVIEW_ERROR)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : STR.CHANGE_REVIEW_ERROR)
    } finally {
      setReviewLoading(false)
    }
  }

  const assistantReady = aiPreviewSeen && !aiPreviewLoading
  const assistantBusy = draftLoading || summarizeLoading
  const reviewReady = aiEnabled && assistantReady && !scanLoading
  const groupedFindings = groupFindingsByCategory(reviewFindings)

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

          {/* Change Review Assistant */}
          {stagedFiles.length > 0 && (
            <div
              data-testid="change-review-panel"
              style={{
                marginBottom: '16px',
                border: '1px solid var(--gw-border, #27272a)',
                borderRadius: '4px',
                background: 'var(--gw-surface, #18181b)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--gw-border, #27272a)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{STR.CHANGE_REVIEW_TITLE}</div>
                <div style={{ fontSize: 11, color: 'var(--gw-text-faint, #71717a)', marginTop: 4 }}>
                  {STR.CHANGE_REVIEW_HINT}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  padding: '10px 12px',
                  borderBottom:
                    reviewFindings.length > 0 || reviewError || scanLoading
                      ? '1px solid var(--gw-border, #27272a)'
                      : 'none',
                }}
              >
                {aiEnabled && (
                  <button
                    data-testid="change-review-ai-btn"
                    onClick={() => void handleAiReview()}
                    disabled={!reviewReady || reviewLoading}
                    title={!aiPreviewSeen ? STR.CHANGE_REVIEW_AI_PREVIEW_REQUIRED : undefined}
                    style={{
                      background: 'none',
                      color: reviewReady
                        ? 'var(--gw-text-muted, #a1a1aa)'
                        : 'var(--gw-text-dim, #52525b)',
                      border: '1px solid var(--gw-surface3, #3f3f46)',
                      borderRadius: '4px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: reviewReady && !reviewLoading ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {reviewLoading ? STR.CHANGE_REVIEW_AI_LOADING : STR.CHANGE_REVIEW_AI_BUTTON}
                  </button>
                )}
                {scanLoading && (
                  <span
                    data-testid="change-review-scanning"
                    style={{ fontSize: 12, color: 'var(--gw-text-faint, #71717a)' }}
                  >
                    {STR.CHANGE_REVIEW_SCANNING}
                  </span>
                )}
              </div>

              {reviewError && (
                <div
                  data-testid="change-review-error"
                  style={{ padding: '8px 12px', color: 'var(--gw-danger, #f87171)', fontSize: 12 }}
                >
                  {reviewError}
                </div>
              )}

              {!scanLoading && reviewFindings.length === 0 && !reviewError && (
                <div
                  data-testid="change-review-clear"
                  style={{
                    padding: '10px 12px',
                    fontSize: 12,
                    color: 'var(--gw-text-faint, #71717a)',
                  }}
                >
                  {STR.CHANGE_REVIEW_NO_FINDINGS}
                </div>
              )}

              {reviewFindings.length > 0 && (
                <div data-testid="change-review-findings" style={{ padding: '10px 12px' }}>
                  {changeReview?.overall && (
                    <div
                      data-testid="change-review-overall"
                      style={{ fontSize: 12, marginBottom: 10, lineHeight: '18px' }}
                    >
                      <span style={{ color: 'var(--gw-text-faint, #71717a)' }}>
                        {STR.CHANGE_REVIEW_OVERALL}:{' '}
                      </span>
                      {changeReview.overall}
                    </div>
                  )}
                  {Array.from(groupedFindings.entries()).map(([category, items]) => (
                    <div
                      key={category}
                      data-testid={`change-review-group-${category}`}
                      style={{ marginBottom: 12 }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        {categoryLabel(category)}
                      </div>
                      {items.map((finding, index) => (
                        <div
                          key={`${category}-${finding.file ?? index}-${finding.source}`}
                          data-testid="change-review-finding"
                          style={{
                            marginBottom: 8,
                            padding: '8px 10px',
                            border: '1px solid var(--gw-border-subtle, #3f3f46)',
                            borderRadius: '4px',
                            fontSize: 12,
                          }}
                        >
                          <div
                            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}
                          >
                            <span
                              data-testid="change-review-source"
                              style={{
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: 'var(--gw-text-faint, #71717a)',
                              }}
                            >
                              {finding.source === 'deterministic'
                                ? STR.CHANGE_REVIEW_SOURCE_DETERMINISTIC
                                : STR.CHANGE_REVIEW_SOURCE_AI}
                            </span>
                            <span
                              data-testid="change-review-confidence"
                              style={{
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: 'var(--gw-text-faint, #71717a)',
                              }}
                            >
                              {STR.CHANGE_REVIEW_CONFIDENCE(finding.confidence)}
                            </span>
                            {finding.file && (
                              <span
                                data-testid="change-review-file"
                                style={{ fontSize: 11, color: 'var(--gw-text-muted, #a1a1aa)' }}
                              >
                                {finding.file}
                              </span>
                            )}
                          </div>
                          <div style={{ color: 'var(--gw-text-faint, #71717a)', fontSize: 11 }}>
                            {STR.CHANGE_REVIEW_WHY}
                          </div>
                          <div data-testid="change-review-why">{finding.why}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Commit message */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                color: 'var(--gw-text-faint, #71717a)',
                marginBottom: '4px',
              }}
            >
              Commit Message
            </label>
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

          {/* AI send preview */}
          <div
            data-testid="ai-send-preview-card"
            style={{
              marginBottom: '16px',
              border: '1px solid var(--gw-border, #27272a)',
              borderRadius: '4px',
              background: 'var(--gw-surface, #18181b)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderBottom: aiPreview ? '1px solid var(--gw-border, #27272a)' : 'none',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{STR.AI_PREVIEW_TITLE}</div>
                <div style={{ fontSize: 11, color: 'var(--gw-text-faint, #71717a)' }}>
                  {STR.AI_PREVIEW_PAYLOAD_LABEL}
                </div>
              </div>
              <button
                data-testid="ai-preview-btn"
                onClick={() => void handleAiPreview()}
                disabled={aiPreviewLoading}
                style={{
                  background: 'none',
                  color: 'var(--gw-text-muted, #a1a1aa)',
                  border: '1px solid var(--gw-surface3, #3f3f46)',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: aiPreviewLoading ? 'wait' : 'pointer',
                }}
              >
                {aiPreviewLoading ? STR.AI_PREVIEW_LOADING : STR.AI_PREVIEW_BUTTON}
              </button>
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
              <div style={{ padding: '10px 12px' }}>
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
                  style={{ fontSize: 11, color: 'var(--gw-text-faint, #71717a)', marginBottom: 8 }}
                >
                  {STR.AI_PREVIEW_REDACTIONS(aiPreview.redactions.count)}
                  {aiPreview.truncated
                    ? ` ${STR.AI_PREVIEW_TRUNCATED(aiPreview.omittedChars)}`
                    : ''}
                </div>
                <pre
                  data-testid="ai-preview-payload"
                  style={{
                    margin: 0,
                    maxHeight: 260,
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
              </div>
            )}
          </div>

          {/* Smart Commit Assistant */}
          <div
            data-testid="ai-commit-assistant-card"
            style={{
              marginBottom: '16px',
              border: '1px solid var(--gw-border, #27272a)',
              borderRadius: '4px',
              background: 'var(--gw-surface, #18181b)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{ padding: '10px 12px', borderBottom: '1px solid var(--gw-border, #27272a)' }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{STR.AI_COMMIT_ASSISTANT_TITLE}</div>
              <div style={{ fontSize: 11, color: 'var(--gw-text-faint, #71717a)', marginTop: 4 }}>
                {STR.AI_COMMIT_ASSISTANT_HINT}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '10px 12px',
                borderBottom:
                  commitDraft || changeSummary || assistantError
                    ? '1px solid var(--gw-border, #27272a)'
                    : 'none',
              }}
            >
              <button
                data-testid="ai-draft-message-btn"
                onClick={() => void handleDraftMessage()}
                disabled={!assistantReady || assistantBusy}
                title={!aiPreviewSeen ? STR.AI_COMMIT_PREVIEW_REQUIRED : undefined}
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
                {draftLoading ? STR.AI_COMMIT_DRAFT_LOADING : STR.AI_COMMIT_DRAFT_BUTTON}
              </button>
              <button
                data-testid="ai-summarize-btn"
                onClick={() => void handleSummarize()}
                disabled={!assistantReady || assistantBusy}
                title={!aiPreviewSeen ? STR.AI_COMMIT_PREVIEW_REQUIRED : undefined}
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
                {summarizeLoading
                  ? STR.AI_COMMIT_SUMMARIZE_LOADING
                  : STR.AI_COMMIT_SUMMARIZE_BUTTON}
              </button>
            </div>

            {!aiPreviewSeen && !aiPreviewLoading && (
              <div
                data-testid="ai-commit-preview-required"
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  color: 'var(--gw-text-faint, #71717a)',
                }}
              >
                {STR.AI_COMMIT_PREVIEW_REQUIRED}
              </div>
            )}

            {assistantError && (
              <div
                data-testid="ai-commit-assistant-error"
                style={{
                  padding: '8px 12px',
                  color: 'var(--gw-danger, #f87171)',
                  fontSize: 12,
                }}
              >
                {assistantError}
              </div>
            )}

            {commitDraft && (
              <div data-testid="ai-commit-draft" style={{ padding: '10px 12px' }}>
                <DraftOption
                  label={STR.AI_COMMIT_DRAFT_CONVENTIONAL}
                  text={commitDraft.conventional}
                  testId="ai-insert-conventional"
                  onInsert={() => insertCommitWithBody(commitDraft.conventional, commitDraft.body)}
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

            {changeSummary && (
              <div data-testid="ai-change-summary" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  {STR.AI_COMMIT_SUMMARY_TITLE}
                </div>
                <div
                  data-testid="ai-change-summary-text"
                  style={{ fontSize: 12, marginBottom: 8, lineHeight: '18px' }}
                >
                  {changeSummary.summary}
                </div>
                {changeSummary.highlights.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--gw-text-faint, #71717a)',
                        marginBottom: 4,
                      }}
                    >
                      {STR.AI_COMMIT_HIGHLIGHTS}
                    </div>
                    <ul
                      data-testid="ai-change-summary-highlights"
                      style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}
                    >
                      {changeSummary.highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

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

          <AgenticProposalPanel />
        </>
      )}
    </div>
  )
}

function categoryLabel(category: AiReviewCategory): string {
  switch (category) {
    case 'secret-like':
      return STR.CHANGE_REVIEW_CATEGORY_SECRET
    case 'risky-file':
      return STR.CHANGE_REVIEW_CATEGORY_RISKY
    case 'migration':
      return STR.CHANGE_REVIEW_CATEGORY_MIGRATION
    case 'lockfile':
      return STR.CHANGE_REVIEW_CATEGORY_LOCKFILE
    case 'generated':
      return STR.CHANGE_REVIEW_CATEGORY_GENERATED
    case 'missing-tests':
      return STR.CHANGE_REVIEW_CATEGORY_MISSING_TESTS
    case 'destructive':
      return STR.CHANGE_REVIEW_CATEGORY_DESTRUCTIVE
  }
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
