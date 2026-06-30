import React, { useEffect, useMemo } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useCommitStore } from '../store/commitStore'
import { useAppStore } from '../store/appStore'
import { useAiStore } from '../store/aiStore'
import { safetyCheckService, type SafetyCode } from '../../core/safety/SafetyCheckService'
import { remediationForSafetyCode } from '../../core/safety/remediation'
import RemediationButton from '../components/RemediationButton'
import { STR } from '../strings'

export default function CommitScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const { profiles, activeProfileId } = useProfilesStore()
  const {
    repository,
    message,
    status,
    identity,
    loading,
    commitLoading,
    draftLoading,
    draftError,
    error,
    committedHash,
    load,
    setMessage,
    doCommit,
    draftMessage,
  } = useCommitStore()

  const activeProfile = profiles.find((p) => p.id === activeProfileId)
  const loadAi = useAiStore((s) => s.load)
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const connections = useAiStore((s) => s.connections)
  // AI on the Commit tab is limited to the commit message. It is offered only when a
  // connection exists and AI is enabled; redaction/enablement rules still apply per send.
  const aiAvailable = aiEnabled && connections.length > 0

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [load, activeRepo])

  // Keep the AI enablement/connection state fresh so the commit-message affordance
  // reflects what the user set up in the AI Chat panel / Settings.
  useEffect(() => {
    void loadAi()
  }, [loadAi])

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

  const safetyResult = useMemo(() => {
    if (!status || !identity || !repository) return null
    return safetyCheckService.checkCommit({
      repository,
      activeProfile,
      identity,
      status,
      commitMessage: message,
    })
  }, [status, identity, repository, activeProfile, message])

  const blockers = safetyResult?.issues.filter((i) => i.severity === 'blocker') ?? []
  const warnings = safetyResult?.issues.filter((i) => i.severity === 'warning') ?? []
  // One remediation per distinct action across the issues (model-driven; replaces the
  // bespoke "Set local identity" button). Skip a navigate that points back to Commit.
  const seenRemediationActions = new Set<string>()
  const issueRemediations = [...blockers, ...warnings]
    .map((i) => remediationForSafetyCode(i.code as SafetyCode))
    .filter((rem) => {
      if (rem.kind === 'navigate' && rem.navigateTo === 'commit') return false
      if (seenRemediationActions.has(rem.action)) return false
      seenRemediationActions.add(rem.action)
      return true
    })

  const handleCommit = async () => {
    if (!safetyResult?.canCommit || commitLoading) return
    await doCommit(message)
  }

  return (
    <div
      data-testid="screen-commit"
      style={{ padding: '24px', maxWidth: '720px', fontFamily: 'inherit' }}
    >
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600 }}>Commit</h2>

      {loading && (
        <div
          style={{ color: 'var(--gw-text-faint, #71717a)', fontSize: '14px', marginBottom: '16px' }}
        >
          Loading…
        </div>
      )}

      {!loading && !repository && !activeRepo && (
        <div style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: '14px' }}>
          Add a repository to get started.
        </div>
      )}

      {!loading && repository && (
        <>
          {/* Staged changes summary */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '14px',
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
                fontSize: '14px',
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
                  fontSize: '14px',
                  color: 'var(--gw-text-faint, #71717a)',
                }}
              >
                Commit Message
              </label>
              {aiAvailable && (
                <button
                  data-testid="ai-commit-draft-toggle"
                  onClick={() => void draftMessage()}
                  disabled={draftLoading}
                  data-tooltip={STR.AI_COMMIT_ASSISTANT_HINT}
                  style={{
                    background: 'none',
                    color: 'var(--gw-accent-text, #a5b4fc)',
                    border: '1px solid var(--gw-surface3, #3f3f46)',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '14px',
                    cursor: draftLoading ? 'wait' : 'pointer',
                  }}
                >
                  {draftLoading ? STR.AI_COMMIT_DRAFT_LOADING : STR.AI_COMMIT_DRAFT_TOGGLE}
                </button>
              )}
            </div>
            <textarea
              data-testid="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes…"
              rows={10}
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '8px',
                background: 'var(--gw-input-bg, #09090b)',
                border: '1px solid var(--gw-border-subtle, #3f3f46)',
                borderRadius: '4px',
                color: 'var(--gw-text, #f4f4f5)',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />

            {draftError && (
              <div
                data-testid="ai-commit-assistant-error"
                style={{
                  marginTop: '8px',
                  color: 'var(--gw-danger, #f87171)',
                  fontSize: 14,
                }}
              >
                {draftError}
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
                    fontSize: '14px',
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
                    fontSize: '14px',
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
              {issueRemediations.length > 0 && (
                <div
                  data-testid="commit-remediations"
                  style={{
                    padding: '10px 12px',
                    background: 'var(--gw-accent-soft, #1e1b4b)',
                    borderTop:
                      blockers.length + warnings.length > 0
                        ? '1px solid var(--gw-accent-soft, #1e1b4b)'
                        : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {issueRemediations.map((rem) => (
                    <RemediationButton
                      key={rem.action}
                      remediation={rem}
                      repoPath={repository?.localPath ?? activeRepo?.localPath}
                      assignedProfileId={repository?.assignedProfileId}
                      testId={
                        rem.action === 'set-local-identity' ? 'commit-set-identity-btn' : undefined
                      }
                      onSuccess={() => {
                        if (activeRepo) void load(activeRepo.localPath, activeRepo)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Commit error */}
          {error && (
            <div
              style={{ color: 'var(--gw-danger, #f87171)', fontSize: '14px', marginBottom: '12px' }}
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
                fontSize: '14px',
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
              data-tooltip={
                safetyResult?.canCommit
                  ? undefined
                  : blockers.length > 0
                    ? `Can't commit yet:\n• ${blockers.map((b) => b.message).join('\n• ')}`
                    : 'Stage changes and enter a commit message to commit.'
              }
              data-tooltip-pos="left"
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
                  fontSize: '14px',
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
