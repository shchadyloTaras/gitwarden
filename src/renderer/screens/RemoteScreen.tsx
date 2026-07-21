import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useRemoteStore } from '../store/remoteStore'
import { useAppStore } from '../store/appStore'
import { safetyCheckService, type SafetyCode } from '../../core/safety/SafetyCheckService'
import type { GitHubPushContext } from '../../core/safety/SafetyCheckService'
import { remediationForGitError, remediationForSafetyCode } from '../../core/safety/remediation'
import { isHttpsGitHubRemoteUrl } from '../../core/github/remoteUrl'
import { matchesAnyPattern } from '../../core/safety/branchPatterns'
import type { GitRemote } from '../../core/types'
import { STR } from '../strings'
import SafetyIssueRow from '../components/SafetyIssueRow'
import RemediationButton from '../components/RemediationButton'
import { useDialogFocus } from '../hooks/useDialogFocus'
import './workflowScreens.css'

/** Renderer-side mirror of the main GitHubPushStatus (token-free). */
type PushStatus = { hasToken: boolean; tokenInvalid: boolean; effectiveLogin?: string }

export default function RemoteScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const { profiles, activeProfileId } = useProfilesStore()
  const {
    repository,
    remotes,
    upstream,
    upstreamGone,
    identity,
    loading,
    fetchLoading,
    pullLoading,
    pushLoading,
    error,
    successMessage,
    load,
    doFetch,
    doPull,
    doRemotePush,
    clearMessages,
    lastFailure,
    setLastFailure,
  } = useRemoteStore()

  const [showPushSheet, setShowPushSheet] = useState(false)
  const [selectedRemote, setSelectedRemote] = useState<GitRemote | null>(null)
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushStatusPending, setPushStatusPending] = useState(false)
  // Outgoing-authorship gate (Phase 100): the commits about to be pushed, fetched when the
  // sheet opens. Withheld (undefined) from checkPush while pending so the "safe to push"
  // verdict never renders before the authorship check has actually run.
  const [outgoingCommits, setOutgoingCommits] = useState<
    { authorName: string; authorEmail: string }[] | null
  >(null)
  const [outgoingCommitsPending, setOutgoingCommitsPending] = useState(false)
  const pushSheetRef = useRef<HTMLDivElement>(null)
  const pushCancelRef = useRef<HTMLButtonElement>(null)

  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  const assignedProfile = repository?.assignedProfileId
    ? profiles.find((p) => p.id === repository.assignedProfileId)
    : undefined

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [load, activeRepo, currentBranch])

  // The GitHub HTTPS-token push context for the selected remote — only engaged for an
  // HTTPS GitHub remote, so SSH/file remotes are unaffected.
  const githubContext = useMemo((): GitHubPushContext | undefined => {
    if (!selectedRemote || !isHttpsGitHubRemoteUrl(selectedRemote.url)) return undefined
    // expectedGitHubActor overrides the profile's linked login for HTTPS actor verification.
    const assignedLogin =
      repository?.pushPolicy?.expectedGitHubActor ?? assignedProfile?.linkedGitHub?.login
    return {
      httpsToGitHub: true,
      assignedLogin,
      hasToken: pushStatus?.hasToken ?? false,
      tokenInvalid: pushStatus?.tokenInvalid ?? false,
      effectiveLogin: pushStatus?.effectiveLogin,
      scopes: assignedProfile?.linkedGitHub?.scopes,
    }
  }, [selectedRemote, repository, assignedProfile, pushStatus])

  // Compute push safety for the selected remote
  const pushSafetyResult = useMemo(() => {
    if (!repository || !identity || !selectedRemote) return null
    return safetyCheckService.checkPush({
      repository,
      activeProfile,
      identity,
      remotes: [selectedRemote],
      currentBranch: currentBranch ?? undefined,
      upstream: upstream ?? undefined,
      // Withhold the context until the token is verified so we don't flash a stale verdict.
      github: pushStatusPending ? undefined : githubContext,
      // Withhold until the outgoing range is fetched, same reasoning as githubContext above.
      outgoingCommits: outgoingCommitsPending ? undefined : (outgoingCommits ?? undefined),
    })
  }, [
    repository,
    identity,
    activeProfile,
    selectedRemote,
    currentBranch,
    upstream,
    githubContext,
    pushStatusPending,
    outgoingCommits,
    outgoingCommitsPending,
  ])

  const handleOpenPushSheet = (remote: GitRemote) => {
    clearMessages()
    setSelectedRemote(remote)
    setShowPushSheet(true)
    setPushStatus(null)
    setOutgoingCommits(null)

    // Verify the assigned profile's token so we can catch an account mismatch / revoked
    // token before pushing — but only for an HTTPS GitHub remote.
    if (isHttpsGitHubRemoteUrl(remote.url) && assignedProfile?.id) {
      setPushStatusPending(true)
      void window.api.github
        .getPushContext(assignedProfile.id)
        .then((res) => {
          if (res.ok) setPushStatus(res.data)
        })
        .finally(() => setPushStatusPending(false))
    } else {
      setPushStatusPending(false)
    }

    // Outgoing-authorship gate (Phase 100): fetch the commits this push would carry, for
    // ANY remote (not just HTTPS GitHub) — a wrong-author commit is wrong regardless of
    // transport.
    const repoPath = repository?.localPath ?? activeRepo?.localPath
    if (repoPath && currentBranch) {
      setOutgoingCommitsPending(true)
      void window.api.git
        .getOutgoingCommits(repoPath, remote.name, currentBranch)
        .then((res) => {
          if (res.ok) setOutgoingCommits(res.data)
        })
        .finally(() => setOutgoingCommitsPending(false))
    } else {
      setOutgoingCommitsPending(false)
    }
  }

  const handleClosePushSheet = () => {
    setShowPushSheet(false)
    setSelectedRemote(null)
    setPushStatus(null)
    setPushStatusPending(false)
    setOutgoingCommits(null)
    setOutgoingCommitsPending(false)
  }

  useDialogFocus(
    showPushSheet && selectedRemote !== null,
    pushSheetRef,
    handleClosePushSheet,
    pushCancelRef
  )

  const handleConfirmPush = async () => {
    if (
      !selectedRemote ||
      !currentBranch ||
      pushStatusPending ||
      outgoingCommitsPending ||
      pushSafetyResult?.canPush === false
    )
      return
    setShowPushSheet(false)
    await doRemotePush(selectedRemote.name, currentBranch)
  }

  const pushBlockers = pushSafetyResult?.issues.filter((i) => i.severity === 'blocker') ?? []
  const pushWarnings = pushSafetyResult?.issues.filter((i) => i.severity === 'warning') ?? []

  // Model-driven one-click fixes for the push issues (dedup by action; skip a navigate
  // back to this screen) so the user can resolve a push blocker right in the push sheet.
  const pushSeenActions = new Set<string>()
  const pushIssueRemediations = [...pushBlockers, ...pushWarnings]
    .map((i) => remediationForSafetyCode(i.code as SafetyCode))
    .filter((rem) => {
      if (rem.kind === 'navigate' && rem.navigateTo === 'remote') return false
      if (pushSeenActions.has(rem.action)) return false
      pushSeenActions.add(rem.action)
      return true
    })

  const retryingWouldReuseAssignedHttpsCredential =
    lastFailure?.code === 'pushRejectedWrongAccount' &&
    selectedRemote != null &&
    isHttpsGitHubRemoteUrl(selectedRemote.url) &&
    repository?.assignedProfileId != null &&
    activeProfileId === repository.assignedProfileId

  const recoveryRemediation = retryingWouldReuseAssignedHttpsCredential
    ? remediationForGitError('authenticationFailed')
    : lastFailure?.remediation

  const recoveryMessage =
    retryingWouldReuseAssignedHttpsCredential && assignedProfile
      ? STR.RECOVERY_RECONNECT_ASSIGNED_GITHUB(assignedProfile.displayName)
      : lastFailure?.message

  return (
    <section
      data-testid="screen-remote"
      className="gw-page gw-workflow-page"
      aria-labelledby="remote-page-title"
      aria-busy={loading}
    >
      <header className="gw-page-header gw-workflow-page-header">
        <h1 id="remote-page-title" className="gw-page-title gw-workflow-page-title">
          Remote
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
          {/* Current branch */}
          {currentBranch && (
            <div className="gw-remote-context">
              Branch:{' '}
              <span
                data-testid="remote-current-branch"
                className="gw-workflow-mono"
                style={{ color: 'var(--gw-info, #60a5fa)' }}
              >
                {currentBranch}
              </span>
            </div>
          )}

          {/* Upstream state — honest about a gone remote-tracking ref (Phase 92, W20)
              instead of a misleading "0 ahead / 0 behind". */}
          {upstreamGone && (
            <div
              data-testid="remote-upstream-gone"
              className="gw-notice gw-notice--warning gw-workflow-notice gw-workflow-notice--warning"
              role="status"
            >
              {STR.REMOTE_UPSTREAM_GONE}
            </div>
          )}

          {/* Remotes list */}
          {remotes.length === 0 ? (
            <div className="gw-empty-state gw-workflow-empty">
              No remotes configured for this repository.
            </div>
          ) : (
            <section className="gw-workflow-section" aria-labelledby="remote-list-heading">
              <h2 id="remote-list-heading" className="gw-workflow-section-heading">
                Remotes ({remotes.length})
              </h2>
              <div className="gw-remote-list">
                {remotes.map((remote) => (
                  <article key={remote.name} className="gw-card gw-workflow-card gw-remote-card">
                    <div className="gw-remote-card-main">
                      <div className="gw-remote-meta">
                        <span className="gw-workflow-mono gw-remote-name">{remote.name}</span>
                        <span className="gw-workflow-mono gw-remote-url">{remote.url}</span>
                        {remote.host && <span className="gw-remote-host">{remote.host}</span>}
                      </div>

                      <div className="gw-toolbar gw-workflow-actions gw-remote-actions">
                        <button
                          type="button"
                          data-testid="remote-op-fetch"
                          data-tooltip={STR.TT_REMOTE_FETCH}
                          onClick={() => doFetch(remote.name)}
                          disabled={
                            fetchLoading === remote.name || pullLoading !== null || pushLoading
                          }
                          className="gw-button gw-button--secondary gw-workflow-button"
                        >
                          {fetchLoading === remote.name ? 'Fetching…' : 'Fetch'}
                        </button>

                        {currentBranch && (
                          <button
                            type="button"
                            data-testid="remote-op-pull"
                            data-tooltip={STR.TT_REMOTE_PULL}
                            onClick={() => doPull(remote.name, currentBranch)}
                            disabled={
                              pullLoading === remote.name || fetchLoading !== null || pushLoading
                            }
                            className="gw-button gw-button--secondary gw-workflow-button"
                          >
                            {pullLoading === remote.name ? 'Pulling…' : 'Pull'}
                          </button>
                        )}

                        {currentBranch && (
                          <button
                            type="button"
                            data-testid="remote-op-push"
                            data-tooltip={STR.TT_REMOTE_PUSH}
                            onClick={() => handleOpenPushSheet(remote)}
                            disabled={fetchLoading !== null || pullLoading !== null || pushLoading}
                            className="gw-button gw-button--primary gw-workflow-button"
                          >
                            {pushLoading ? 'Pushing…' : 'Push'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Success message */}
          {successMessage && (
            <div
              data-testid="remote-success"
              className="gw-notice gw-notice--success gw-workflow-notice gw-workflow-notice--success"
              role="status"
            >
              ✓ {successMessage}
            </div>
          )}

          {/* Failed-push recovery banner (diagnosis + one-click fix), else a plain error. */}
          {lastFailure ? (
            <div
              data-testid="remote-recovery-banner"
              className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
            >
              <div data-testid="remote-error" role="alert">
                {recoveryMessage}
              </div>
              {recoveryRemediation && lastFailure.code !== 'dubiousOwnership' && (
                <div style={{ marginTop: '10px' }}>
                  <RemediationButton
                    remediation={recoveryRemediation}
                    repoPath={repository?.localPath ?? activeRepo?.localPath}
                    assignedProfileId={repository?.assignedProfileId}
                    remote={lastFailure.remote ?? selectedRemote?.name}
                    branch={lastFailure.branch ?? currentBranch ?? undefined}
                    onSuccess={(result) => {
                      if (result.deviceCode) return
                      clearMessages()
                      if (activeRepo) void load(activeRepo.localPath, activeRepo)
                    }}
                    onFailure={(f) => setLastFailure(f)}
                  />
                </div>
              )}
            </div>
          ) : (
            error && (
              <div
                data-testid="remote-error"
                className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
                role="alert"
              >
                {error}
              </div>
            )
          )}
        </div>
      )}

      {/* Push confirmation sheet (modal overlay) */}
      {showPushSheet && selectedRemote && (
        <div className="gw-dialog-backdrop gw-remote-modal-backdrop">
          <div
            ref={pushSheetRef}
            data-testid="remote-push-sheet"
            className="gw-dialog gw-remote-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remote-push-title"
            tabIndex={-1}
          >
            <h2 id="remote-push-title" className="gw-remote-modal-title">
              Push to {selectedRemote.name}
            </h2>

            {/* Details table */}
            <div className="gw-remote-details">
              <Row label="Repo" value={repository!.name} />
              <Row label="Path" value={repository!.localPath} mono />
              <Row label="Branch" value={currentBranch ?? '(unknown)'} mono />
              <Row label="Remote" value={selectedRemote.name} />
              <Row label="URL" value={selectedRemote.url} mono />
              {selectedRemote.host && <Row label="Host" value={selectedRemote.host} mono />}
              <Row
                label="Active profile"
                value={
                  activeProfile
                    ? `${activeProfile.displayName} <${activeProfile.gitAuthorEmail}> [${activeProfile.authenticationMethod.toUpperCase()}]`
                    : '(none)'
                }
              />
              <Row
                label="Assigned profile"
                value={assignedProfile ? assignedProfile.displayName : '(none)'}
              />
              {githubContext && (
                <div className="gw-remote-detail-row" data-testid="remote-push-github-line">
                  <span className="gw-remote-detail-label">{STR.PUSH_GH_LABEL}</span>
                  <span
                    className="gw-remote-detail-value"
                    style={{ color: githubLineColor(githubContext, pushStatusPending) }}
                  >
                    {githubLineText(githubContext, pushStatusPending)}
                  </span>
                </div>
              )}
            </div>

            {/* Branch Access block — shown only when a push policy is configured */}
            {repository?.pushPolicy && (
              <BranchAccessBlock
                policy={repository.pushPolicy}
                currentBranch={currentBranch}
                isHttps={isHttpsGitHubRemoteUrl(selectedRemote.url)}
              />
            )}

            {/* Safety issues */}
            {pushSafetyResult && pushSafetyResult.issues.length > 0 && (
              <div
                className="gw-card gw-workflow-card gw-workflow-card--flush gw-commit-issues"
                aria-live="polite"
              >
                {pushBlockers.map((issue) => (
                  <SafetyIssueRow key={issue.code} issue={issue} testIdPrefix="remote-push" />
                ))}
                {pushWarnings.map((issue) => (
                  <SafetyIssueRow key={issue.code} issue={issue} testIdPrefix="remote-push" />
                ))}
              </div>
            )}

            {pushIssueRemediations.length > 0 && (
              <div
                data-testid="remote-push-remediations"
                className="gw-toolbar gw-commit-remediations"
                style={{ marginBottom: '16px' }}
              >
                {pushIssueRemediations.map((rem) => (
                  <RemediationButton
                    key={rem.action}
                    remediation={rem}
                    repoPath={repository?.localPath ?? activeRepo?.localPath}
                    assignedProfileId={repository?.assignedProfileId}
                    remote={selectedRemote?.name}
                    branch={currentBranch ?? undefined}
                    onSuccess={() => {
                      if (activeRepo) void load(activeRepo.localPath, activeRepo)
                    }}
                  />
                ))}
              </div>
            )}

            {pushSafetyResult?.canPush &&
              pushSafetyResult.issues.length === 0 &&
              !pushStatusPending &&
              !outgoingCommitsPending && (
                <div
                  className="gw-notice gw-notice--success gw-workflow-notice gw-workflow-notice--success"
                  role="status"
                  style={{ marginBottom: '16px' }}
                >
                  {STR.PUSH_SAFE_TO_PUSH(githubContext !== undefined)}
                </div>
              )}

            {/* Actions */}
            <div className="gw-toolbar gw-workflow-actions gw-workflow-actions--end">
              <button
                ref={pushCancelRef}
                type="button"
                data-testid="remote-push-cancel-btn"
                onClick={handleClosePushSheet}
                className="gw-button gw-button--secondary gw-workflow-button"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="remote-push-confirm-btn"
                onClick={handleConfirmPush}
                disabled={
                  !pushSafetyResult?.canPush ||
                  pushLoading ||
                  pushStatusPending ||
                  outgoingCommitsPending
                }
                className="gw-button gw-button--primary gw-workflow-button"
              >
                {pushStatusPending ? STR.PUSH_GH_VERIFYING : 'Confirm Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** Branch Access summary block shown in the push sheet when a push policy is set. */
function BranchAccessBlock({
  policy,
  currentBranch,
  isHttps,
}: {
  policy: NonNullable<import('../../core/types').RepositoryRecord['pushPolicy']>
  currentBranch: string | null
  isHttps: boolean
}): React.ReactElement {
  const branch = currentBranch ?? ''
  const isBlocked = branch ? matchesAnyPattern(branch, policy.blockedBranchPatterns) : false
  const isAllowed =
    !isBlocked &&
    (policy.mode === 'unrestricted' ||
      (policy.allowedBranchPatterns.length > 0 &&
        matchesAnyPattern(branch, policy.allowedBranchPatterns)))

  const verdict = isBlocked
    ? STR.BRANCH_ACCESS_VERDICT_BLOCKED
    : isAllowed
      ? STR.BRANCH_ACCESS_VERDICT_ALLOWED
      : policy.mode === 'unrestricted'
        ? STR.BRANCH_ACCESS_VERDICT_UNRESTRICTED
        : null

  const verdictColor = isBlocked ? 'var(--gw-danger, #f87171)' : 'var(--gw-success, #4ade80)'

  return (
    <section
      data-testid="remote-push-branch-access"
      className="gw-card gw-workflow-card gw-workflow-card--flush gw-remote-branch-card"
      aria-labelledby="remote-push-branch-access-title"
    >
      <h3 id="remote-push-branch-access-title" className="gw-remote-branch-heading">
        {STR.BRANCH_ACCESS_SECTION_TITLE}
      </h3>
      <div className="gw-remote-branch-body">
        <div className="gw-remote-branch-row">
          <span style={{ color: 'var(--gw-text-faint, #71717a)' }}>
            {STR.BRANCH_ACCESS_CURRENT_BRANCH_LABEL}
          </span>
          <span style={{ fontFamily: 'monospace', color: 'var(--gw-text-muted, #a1a1aa)' }}>
            {branch || '—'}
          </span>
        </div>
        {verdict && (
          <div className="gw-remote-branch-row">
            <span style={{ color: 'var(--gw-text-faint, #71717a)' }}>Verdict</span>
            <span
              data-testid="remote-push-branch-verdict"
              style={{ fontWeight: 600, color: verdictColor }}
            >
              {verdict}
            </span>
          </div>
        )}
        {/* SSH actor: shown as unverified when policy has expectedGitHubActor and push is SSH */}
        {!isHttps && policy.expectedGitHubActor && (
          <div className="gw-remote-branch-row">
            <span style={{ color: 'var(--gw-text-faint, #71717a)' }}>
              {STR.BRANCH_ACCESS_SSH_ACTOR_LABEL}
            </span>
            <span
              data-testid="remote-push-ssh-actor"
              style={{ color: 'var(--gw-warning, #fbbf24)', textAlign: 'right' }}
            >
              {STR.BRANCH_ACCESS_SSH_ACTOR_UNVERIFIED(policy.expectedGitHubActor)}
            </span>
          </div>
        )}
        <div className="gw-remote-branch-note">{STR.BRANCH_ACCESS_ENFORCEMENT_NOTE}</div>
      </div>
    </section>
  )
}

/** The "Pushing as @login …" sheet line text for the resolved GitHub push context. */
function githubLineText(github: GitHubPushContext, pending: boolean): string {
  if (pending) return STR.PUSH_GH_VERIFYING
  if (!github.hasToken) {
    return github.assignedLogin ? STR.PUSH_GH_NO_TOKEN : STR.PUSH_GH_NOT_CONNECTED
  }
  if (github.tokenInvalid) return STR.PUSH_GH_TOKEN_INVALID
  const login = github.effectiveLogin ?? github.assignedLogin ?? '?'
  const matches =
    github.assignedLogin !== undefined &&
    github.effectiveLogin !== undefined &&
    github.assignedLogin === github.effectiveLogin
  return STR.PUSH_GH_AS(login, matches)
}

function githubLineColor(github: GitHubPushContext, pending: boolean): string {
  if (pending) return 'var(--gw-text-faint, #71717a)'
  const ok =
    github.hasToken &&
    !github.tokenInvalid &&
    (github.assignedLogin === undefined ||
      github.effectiveLogin === undefined ||
      github.assignedLogin === github.effectiveLogin)
  return ok ? 'var(--gw-success, #4ade80)' : 'var(--gw-danger, #f87171)'
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}): React.ReactElement {
  return (
    <div className="gw-remote-detail-row">
      <span className="gw-remote-detail-label">{label}</span>
      <span
        className="gw-remote-detail-value"
        style={{
          fontFamily: mono
            ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
            : 'inherit',
        }}
      >
        {value}
      </span>
    </div>
  )
}
