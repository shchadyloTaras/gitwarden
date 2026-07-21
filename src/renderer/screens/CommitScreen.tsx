import React, { useEffect, useMemo } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useCommitStore } from '../store/commitStore'
import { useAppStore } from '../store/appStore'
import { useAiStore } from '../store/aiStore'
import { safetyCheckService, type SafetyCode } from '../../core/safety/SafetyCheckService'
import { remediationForSafetyCode } from '../../core/safety/remediation'
import RemediationButton from '../components/RemediationButton'
import { FileStatusBadge } from '../components/FileStatusBadge'
import { STR } from '../strings'
import './workflowScreens.css'

export default function CommitScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const { profiles, activeProfileId } = useProfilesStore()
  const {
    repository,
    message,
    status,
    identity,
    stagedDiffs,
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
  }, [load, activeRepo, currentBranch])

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
      stagedDiffs,
    })
  }, [status, identity, repository, activeProfile, message, stagedDiffs])

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
    <section
      data-testid="screen-commit"
      className="gw-page gw-workflow-page"
      aria-labelledby="commit-page-title"
      aria-busy={loading}
    >
      <header className="gw-page-header gw-workflow-page-header">
        <h1 id="commit-page-title" className="gw-page-title gw-workflow-page-title">
          Commit
        </h1>
      </header>

      {loading && (
        <div className="gw-empty-state gw-workflow-state" role="status">
          Loading…
        </div>
      )}

      {!loading && !repository && !activeRepo && (
        <div className="gw-empty-state gw-workflow-empty">Add a repository to get started.</div>
      )}

      {!loading && repository && (
        <div className="gw-workflow-stack">
          {/* Staged changes summary */}
          <section className="gw-workflow-section" aria-labelledby="commit-staged-heading">
            <h2 id="commit-staged-heading" className="gw-workflow-section-heading">
              Staged Changes ({stagedFiles.length})
            </h2>
            <div
              data-testid="commit-staged-summary"
              className={`gw-card gw-workflow-card gw-commit-staged-list${
                stagedFiles.length === 0 ? ' gw-commit-staged-list--empty' : ''
              }`}
            >
              {stagedFiles.length === 0 ? (
                <span>No staged changes</span>
              ) : (
                stagedFiles.map((f) => (
                  <div key={f.path} className="gw-commit-file">
                    <FileStatusBadge kind={f.indexStatus} />
                    <span className="gw-commit-file-path">
                      {f.originalPath ? `${f.path} ← ${f.originalPath}` : f.path}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Commit message (with the one and only Commit-tab AI affordance) */}
          <section className="gw-field gw-workflow-field gw-workflow-section">
            <div className="gw-commit-message-header">
              <label htmlFor="commit-message-input" className="gw-workflow-label">
                Commit Message
              </label>
              {aiAvailable && (
                <button
                  type="button"
                  data-testid="ai-commit-draft-toggle"
                  onClick={() => void draftMessage()}
                  disabled={draftLoading}
                  data-tooltip={STR.AI_COMMIT_ASSISTANT_HINT}
                  className="gw-button gw-button--secondary gw-workflow-button"
                >
                  {draftLoading ? STR.AI_COMMIT_DRAFT_LOADING : STR.AI_COMMIT_DRAFT_TOGGLE}
                </button>
              )}
            </div>
            <textarea
              id="commit-message-input"
              data-testid="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes…"
              rows={10}
              aria-describedby={draftError ? 'commit-draft-error' : undefined}
              className="gw-workflow-input gw-commit-message"
            />

            {draftError && (
              <div
                id="commit-draft-error"
                data-testid="ai-commit-assistant-error"
                className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
                role="alert"
              >
                {draftError}
              </div>
            )}
          </section>

          {/* Safety issues */}
          {safetyResult && safetyResult.issues.length > 0 && (
            <section
              data-testid="commit-safety-issues"
              className="gw-card gw-workflow-card gw-workflow-card--flush gw-commit-issues"
              aria-live="polite"
            >
              {blockers.map((issue) => (
                <div
                  key={issue.code}
                  data-testid="commit-blocker"
                  className="gw-notice gw-notice--danger gw-workflow-notice--danger gw-commit-issue"
                >
                  <span aria-hidden="true">⛔</span>
                  <span>{issue.message}</span>
                </div>
              ))}
              {warnings.map((issue) => (
                <div
                  key={issue.code}
                  data-testid="commit-warning"
                  className="gw-notice gw-notice--warning gw-workflow-notice--warning gw-commit-issue"
                >
                  <span aria-hidden="true">⚠</span>
                  <span>{issue.message}</span>
                </div>
              ))}
              {issueRemediations.length > 0 && (
                <div
                  data-testid="commit-remediations"
                  className="gw-toolbar gw-commit-remediations"
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
            </section>
          )}

          {/* Commit error */}
          {error && (
            <div
              className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Success */}
          {committedHash && (
            <div
              data-testid="commit-success"
              className="gw-notice gw-notice--success gw-workflow-notice gw-workflow-notice--success"
              role="status"
            >
              ✓ Committed {committedHash}
            </div>
          )}

          {/* Commit button */}
          <div className="gw-toolbar gw-workflow-actions gw-workflow-actions--end">
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
                className="gw-button gw-button--primary gw-workflow-button"
              >
                {commitLoading ? 'Committing…' : 'Commit Changes'}
              </button>
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
