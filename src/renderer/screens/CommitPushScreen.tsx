import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useCommitStore } from '../store/commitStore'
import { useRemoteStore } from '../store/remoteStore'
import { useCommitAndPushStore } from '../store/commitAndPushStore'
import { useAppStore } from '../store/appStore'
import { useAiStore } from '../store/aiStore'
import { safetyCheckService, type SafetyCode } from '../../core/safety/SafetyCheckService'
import type { GitHubPushContext } from '../../core/safety/SafetyCheckService'
import { remediationForGitError, remediationForSafetyCode } from '../../core/safety/remediation'
import { isHttpsGitHubRemoteUrl } from '../../core/github/remoteUrl'
import { matchesAnyPattern } from '../../core/safety/branchPatterns'
import { pickPushTarget } from '../../core/commitAndPush/pickPushTarget'
import { checkCommitAndPush } from '../../core/commitAndPush/gate'
import type { GitRemote, Profile, RepositoryRecord } from '../../core/types'
import { STR } from '../strings'
import { FileStatusBadge } from '../components/FileStatusBadge'
import SafetyIssueRow from '../components/SafetyIssueRow'
import RemediationButton from '../components/RemediationButton'
import { useDialogFocus } from '../hooks/useDialogFocus'
import './workflowScreens.css'

/** Renderer-side mirror of the main GitHubPushStatus (token-free). */
type PushStatus = { hasToken: boolean; tokenInvalid: boolean; effectiveLogin?: string }

/** The GitHub HTTPS-token push context for a candidate remote — shared by the regular
 *  push sheet and the Commit & Push sheet so the two can never quietly diverge. */
function computeGithubPushContext(
  selectedRemote: GitRemote | null,
  repository: RepositoryRecord | null | undefined,
  assignedProfile: Profile | undefined,
  pushStatus: PushStatus | null
): GitHubPushContext | undefined {
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
}

/** Kicks off the same token + outgoing-authorship verification for a candidate push —
 *  shared by the regular push sheet and the Commit & Push sheet (finding 5: both must
 *  withhold their verdict identically while either fetch is pending). */
function fetchPushPreflight(
  remote: GitRemote,
  repoPath: string | undefined,
  branch: string | null,
  assignedProfileId: string | undefined,
  setPushStatus: (status: PushStatus | null) => void,
  setPushStatusPending: (pending: boolean) => void,
  setOutgoingCommits: (commits: { authorName: string; authorEmail: string }[] | null) => void,
  setOutgoingCommitsPending: (pending: boolean) => void
): void {
  setPushStatus(null)
  setOutgoingCommits(null)

  if (isHttpsGitHubRemoteUrl(remote.url) && assignedProfileId) {
    setPushStatusPending(true)
    void window.api.github
      .getPushContext(assignedProfileId)
      .then((res) => {
        if (res.ok) setPushStatus(res.data)
      })
      .finally(() => setPushStatusPending(false))
  } else {
    setPushStatusPending(false)
  }

  if (repoPath && branch) {
    setOutgoingCommitsPending(true)
    void window.api.git
      .getOutgoingCommits(repoPath, remote.name, branch)
      .then((res) => {
        if (res.ok) setOutgoingCommits(res.data)
      })
      .finally(() => setOutgoingCommitsPending(false))
  } else {
    setOutgoingCommitsPending(false)
  }
}

export default function CommitPushScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const { profiles, activeProfileId } = useProfilesStore()
  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  const {
    repository: commitRepository,
    message,
    status,
    identity: commitIdentity,
    loading: commitInitialLoading,
    commitLoading,
    draftLoading,
    draftError,
    error: commitError,
    committedHash,
    load: loadCommit,
    setMessage,
    doCommit,
    draftMessage,
  } = useCommitStore()

  const loadAi = useAiStore((s) => s.load)
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const connections = useAiStore((s) => s.connections)
  // AI on this tab is limited to the commit message. It is offered only when a
  // connection exists and AI is enabled; redaction/enablement rules still apply per send.
  const aiAvailable = aiEnabled && connections.length > 0

  const {
    repository: remoteRepository,
    remotes,
    upstream,
    upstreamGone,
    identity: remoteIdentity,
    loading: remoteInitialLoading,
    fetchLoading,
    pullLoading,
    pushLoading,
    error: remoteError,
    successMessage,
    load: loadRemote,
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

  // Commit & Push: the chained flow state lives in its own store (not here — a
  // mid-flight tab switch must not orphan a running push). Everything below is the
  // pre-flight verification data for ITS OWN sheet, mirroring the regular push sheet's
  // local state above one-for-one so the two sheets never share (or clobber) state.
  const flow = useCommitAndPushStore((s) => s.flow)
  const [cpSelectedRemote, setCpSelectedRemote] = useState<GitRemote | null>(null)
  const [cpPendingChoiceCandidates, setCpPendingChoiceCandidates] = useState<string[] | null>(null)
  const [cpPushStatus, setCpPushStatus] = useState<PushStatus | null>(null)
  const [cpPushStatusPending, setCpPushStatusPending] = useState(false)
  const [cpOutgoingCommits, setCpOutgoingCommits] = useState<
    { authorName: string; authorEmail: string }[] | null
  >(null)
  const [cpOutgoingCommitsPending, setCpOutgoingCommitsPending] = useState(false)
  const cpSheetRef = useRef<HTMLDivElement>(null)
  const cpCancelRef = useRef<HTMLButtonElement>(null)

  const assignedProfile = remoteRepository?.assignedProfileId
    ? profiles.find((p) => p.id === remoteRepository.assignedProfileId)
    : undefined

  // One mount effect fires both stores' loads in parallel — a screen merge, not a
  // store rewrite (both stores survive unchanged).
  useEffect(() => {
    if (!activeRepo) return
    void loadCommit(activeRepo.localPath, activeRepo)
    void loadRemote(activeRepo.localPath, activeRepo)
  }, [loadCommit, loadRemote, activeRepo, currentBranch])

  // Keep the AI enablement/connection state fresh so the commit-message affordance
  // reflects what the user set up in the AI Chat panel / Settings.
  useEffect(() => {
    void loadAi()
  }, [loadAi])

  // A remediation (e.g. fixing local identity) can affect both the commit gate and
  // the push gate, so refresh both stores after any of the remediation buttons below
  // succeeds — otherwise the other half of this merged screen would show stale data.
  const refreshBothStores = (): void => {
    if (!activeRepo) return
    void loadCommit(activeRepo.localPath, activeRepo)
    void loadRemote(activeRepo.localPath, activeRepo)
  }

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
    if (!status || !commitIdentity || !commitRepository) return null
    return safetyCheckService.checkCommit({
      repository: commitRepository,
      activeProfile,
      identity: commitIdentity,
      status,
      commitMessage: message,
    })
  }, [status, commitIdentity, commitRepository, activeProfile, message])

  const blockers = safetyResult?.issues.filter((i) => i.severity === 'blocker') ?? []
  const warnings = safetyResult?.issues.filter((i) => i.severity === 'warning') ?? []
  // One remediation per distinct action across the issues (model-driven; replaces the
  // bespoke "Set local identity" button). Skip a navigate that points back to this tab
  // (either of its former ids — 'commit' or 'remote' — both land here now).
  const seenRemediationActions = new Set<string>()
  const issueRemediations = [...blockers, ...warnings]
    .map((i) => remediationForSafetyCode(i.code as SafetyCode))
    .filter((rem) => {
      if (rem.kind === 'navigate' && (rem.navigateTo === 'commit' || rem.navigateTo === 'remote'))
        return false
      if (seenRemediationActions.has(rem.action)) return false
      seenRemediationActions.add(rem.action)
      return true
    })

  const handleCommit = async () => {
    if (!safetyResult?.canCommit || commitLoading) return
    await doCommit(message)
  }

  // The GitHub HTTPS-token push context for the selected remote — only engaged for an
  // HTTPS GitHub remote, so SSH/file remotes are unaffected.
  const githubContext = useMemo(
    (): GitHubPushContext | undefined =>
      computeGithubPushContext(selectedRemote, remoteRepository, assignedProfile, pushStatus),
    [selectedRemote, remoteRepository, assignedProfile, pushStatus]
  )

  // Compute push safety for the selected remote
  const pushSafetyResult = useMemo(() => {
    if (!remoteRepository || !remoteIdentity || !selectedRemote) return null
    return safetyCheckService.checkPush({
      repository: remoteRepository,
      activeProfile,
      identity: remoteIdentity,
      remotes: [selectedRemote],
      currentBranch: currentBranch ?? undefined,
      upstream: upstream ?? undefined,
      // Withhold the context until the token is verified so we don't flash a stale verdict.
      github: pushStatusPending ? undefined : githubContext,
      // Withhold until the outgoing range is fetched, same reasoning as githubContext above.
      outgoingCommits: outgoingCommitsPending ? undefined : (outgoingCommits ?? undefined),
    })
  }, [
    remoteRepository,
    remoteIdentity,
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
    fetchPushPreflight(
      remote,
      remoteRepository?.localPath ?? activeRepo?.localPath,
      currentBranch,
      assignedProfile?.id,
      setPushStatus,
      setPushStatusPending,
      setOutgoingCommits,
      setOutgoingCommitsPending
    )
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
  // back to this tab under either of its former ids) so the user can resolve a push
  // blocker right in the push sheet.
  const pushSeenActions = new Set<string>()
  const pushIssueRemediations = [...pushBlockers, ...pushWarnings]
    .map((i) => remediationForSafetyCode(i.code as SafetyCode))
    .filter((rem) => {
      if (rem.kind === 'navigate' && (rem.navigateTo === 'commit' || rem.navigateTo === 'remote'))
        return false
      if (pushSeenActions.has(rem.action)) return false
      pushSeenActions.add(rem.action)
      return true
    })

  const retryingWouldReuseAssignedHttpsCredential =
    lastFailure?.code === 'pushRejectedWrongAccount' &&
    selectedRemote != null &&
    isHttpsGitHubRemoteUrl(selectedRemote.url) &&
    remoteRepository?.assignedProfileId != null &&
    activeProfileId === remoteRepository.assignedProfileId

  const recoveryRemediation = retryingWouldReuseAssignedHttpsCredential
    ? remediationForGitError('authenticationFailed')
    : lastFailure?.remediation

  const recoveryMessage =
    retryingWouldReuseAssignedHttpsCredential && assignedProfile
      ? STR.RECOVERY_RECONNECT_ASSIGNED_GITHUB(assignedProfile.displayName)
      : lastFailure?.message

  // ── Commit & Push: one button, one confirmation (Phase 116) ────────────────────

  const cpTarget = useMemo(
    () => pickPushTarget(remotes, upstream ?? undefined),
    [remotes, upstream]
  )

  const cpGithubContext = useMemo(
    (): GitHubPushContext | undefined =>
      computeGithubPushContext(cpSelectedRemote, remoteRepository, assignedProfile, cpPushStatus),
    [cpSelectedRemote, remoteRepository, assignedProfile, cpPushStatus]
  )

  // The Phase-114 combined verdict: composes checkCommit + checkPush, projecting the
  // hypothetical new commit into the outgoing-authorship gate before it exists.
  const commitAndPushVerdict = useMemo(() => {
    if (!commitRepository || !status || !commitIdentity) return null
    if (!remoteRepository || !remoteIdentity || !cpSelectedRemote) return null
    return checkCommitAndPush({
      commit: {
        repository: commitRepository,
        activeProfile,
        identity: commitIdentity,
        status,
        commitMessage: message,
      },
      push: {
        repository: remoteRepository,
        activeProfile,
        identity: remoteIdentity,
        remotes: [cpSelectedRemote],
        currentBranch: currentBranch ?? undefined,
        upstream: upstream ?? undefined,
        github: cpPushStatusPending ? undefined : cpGithubContext,
      },
      existingOutgoing: cpOutgoingCommitsPending ? undefined : (cpOutgoingCommits ?? undefined),
    })
  }, [
    commitRepository,
    status,
    commitIdentity,
    remoteRepository,
    remoteIdentity,
    cpSelectedRemote,
    activeProfile,
    message,
    currentBranch,
    upstream,
    cpGithubContext,
    cpPushStatusPending,
    cpOutgoingCommits,
    cpOutgoingCommitsPending,
  ])

  const cpIssues = useMemo(() => {
    if (!commitAndPushVerdict) return []
    const all = [
      ...commitAndPushVerdict.commit.issues,
      ...(commitAndPushVerdict.push?.issues ?? []),
    ]
    const seen = new Set<string>()
    return all.filter((issue) => {
      if (seen.has(issue.code)) return false
      seen.add(issue.code)
      return true
    })
  }, [commitAndPushVerdict])

  const cpBlockers = cpIssues.filter((i) => i.severity === 'blocker')
  const cpWarnings = cpIssues.filter((i) => i.severity === 'warning')

  // Union of commit-gate and push-gate remediations, deduped by action; skip a
  // navigate back to this tab under either of its former ids.
  const cpSeenActions = new Set<string>()
  const cpRemediations = [...cpBlockers, ...cpWarnings]
    .map((i) => remediationForSafetyCode(i.code as SafetyCode))
    .filter((rem) => {
      if (rem.kind === 'navigate' && (rem.navigateTo === 'commit' || rem.navigateTo === 'remote'))
        return false
      if (cpSeenActions.has(rem.action)) return false
      cpSeenActions.add(rem.action)
      return true
    })

  const openCommitAndPushSheetForRemote = (remote: GitRemote): void => {
    setCpSelectedRemote(remote)
    setCpPendingChoiceCandidates(null)
    fetchPushPreflight(
      remote,
      remoteRepository?.localPath ?? activeRepo?.localPath,
      currentBranch,
      assignedProfile?.id,
      setCpPushStatus,
      setCpPushStatusPending,
      setCpOutgoingCommits,
      setCpOutgoingCommitsPending
    )
    useCommitAndPushStore.getState().open(remote.name)
  }

  const handleOpenCommitAndPush = (): void => {
    if (flow.stage === 'committing' || flow.stage === 'pushing' || showPushSheet) return
    if (flow.stage !== 'idle') useCommitAndPushStore.getState().dismiss()
    if (cpTarget.kind === 'none' || !currentBranch) return

    if (cpTarget.kind === 'choice-required') {
      setCpPendingChoiceCandidates(cpTarget.candidates)
      return
    }

    const remote = remotes.find((r) => r.name === cpTarget.remoteName)
    if (!remote) return
    openCommitAndPushSheetForRemote(remote)
  }

  const handlePickChoiceRemote = (name: string): void => {
    const remote = remotes.find((r) => r.name === name)
    if (!remote) return
    openCommitAndPushSheetForRemote(remote)
  }

  const handleCancelCommitAndPush = (): void => {
    useCommitAndPushStore.getState().cancel()
    setCpPendingChoiceCandidates(null)
    setCpSelectedRemote(null)
    setCpPushStatus(null)
    setCpPushStatusPending(false)
    setCpOutgoingCommits(null)
    setCpOutgoingCommitsPending(false)
  }

  const cpSheetOpen = cpPendingChoiceCandidates !== null || flow.stage === 'confirming'

  useDialogFocus(cpSheetOpen, cpSheetRef, handleCancelCommitAndPush, cpCancelRef)

  const handleConfirmCommitAndPush = async (): Promise<void> => {
    if (
      !currentBranch ||
      !commitAndPushVerdict?.canCommitAndPush ||
      cpPushStatusPending ||
      cpOutgoingCommitsPending
    )
      return
    await useCommitAndPushStore.getState().confirm(message, currentBranch)
  }

  const cpButtonDisabled =
    cpTarget.kind === 'none' ||
    !currentBranch ||
    flow.stage === 'committing' ||
    flow.stage === 'pushing' ||
    showPushSheet

  const cpButtonLabel =
    flow.stage === 'committing'
      ? STR.COMMIT_AND_PUSH_COMMITTING
      : flow.stage === 'pushing'
        ? STR.COMMIT_AND_PUSH_PUSHING
        : STR.COMMIT_AND_PUSH_BUTTON

  const anyInitialLoading = commitInitialLoading || remoteInitialLoading

  return (
    <section
      data-testid="screen-commit"
      className="gw-page gw-workflow-page"
      aria-labelledby="commit-push-page-title"
      aria-busy={anyInitialLoading}
    >
      <header className="gw-page-header gw-workflow-page-header">
        <h1 id="commit-push-page-title" className="gw-page-title gw-workflow-page-title">
          {STR.NAV_COMMIT_PUSH}
        </h1>
      </header>

      {anyInitialLoading && (
        <div className="gw-empty-state gw-workflow-state" role="status">
          Loading…
        </div>
      )}

      {!anyInitialLoading && !commitRepository && !activeRepo && (
        <div className="gw-empty-state gw-workflow-empty">Add a repository to get started.</div>
      )}

      {!anyInitialLoading && commitRepository && (
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

          {/* Commit message (with the one and only commit-message AI affordance) */}
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

          {/* Commit safety issues */}
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
                      repoPath={commitRepository?.localPath ?? activeRepo?.localPath}
                      assignedProfileId={commitRepository?.assignedProfileId}
                      testId={
                        rem.action === 'set-local-identity' ? 'commit-set-identity-btn' : undefined
                      }
                      onSuccess={refreshBothStores}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Commit error */}
          {commitError && (
            <div
              className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
              role="alert"
            >
              {commitError}
            </div>
          )}

          {/* Commit success */}
          {committedHash && (
            <div
              data-testid="commit-success"
              className="gw-notice gw-notice--success gw-workflow-notice gw-workflow-notice--success"
              role="status"
            >
              ✓ Committed {committedHash}
            </div>
          )}

          {/* Commit button + Commit & Push */}
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
            <span
              data-tooltip={
                cpTarget.kind === 'none'
                  ? STR.COMMIT_AND_PUSH_NO_TARGET_HINT
                  : !currentBranch
                    ? 'Stage changes and check out a branch to commit and push.'
                    : undefined
              }
              data-tooltip-pos="left"
              style={{ display: 'inline-block' }}
            >
              <button
                data-testid="commit-and-push-btn"
                onClick={handleOpenCommitAndPush}
                disabled={cpButtonDisabled}
                className="gw-button gw-button--primary gw-workflow-button"
              >
                {cpButtonLabel}
              </button>
            </span>
          </div>

          {flow.stage === 'done' && (
            <div
              data-testid="commit-and-push-success"
              className="gw-notice gw-notice--success gw-workflow-notice gw-workflow-notice--success"
              role="status"
            >
              {STR.COMMIT_AND_PUSH_SUCCESS(flow.committedHash, flow.remoteName)}
            </div>
          )}

          {flow.stage === 'commit-failed' && (
            <div
              data-testid="commit-and-push-commit-failed"
              className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
              role="alert"
            >
              {STR.COMMIT_AND_PUSH_COMMIT_FAILED(flow.message)}
            </div>
          )}

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
                            disabled={
                              fetchLoading !== null ||
                              pullLoading !== null ||
                              pushLoading ||
                              cpSheetOpen
                            }
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
                    repoPath={remoteRepository?.localPath ?? activeRepo?.localPath}
                    assignedProfileId={remoteRepository?.assignedProfileId}
                    remote={lastFailure.remote ?? selectedRemote?.name}
                    branch={lastFailure.branch ?? currentBranch ?? undefined}
                    onSuccess={(result) => {
                      if (result.deviceCode) return
                      clearMessages()
                      refreshBothStores()
                    }}
                    onFailure={(f) => setLastFailure(f)}
                  />
                </div>
              )}
            </div>
          ) : (
            remoteError && (
              <div
                data-testid="remote-error"
                className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
                role="alert"
              >
                {remoteError}
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
              <Row label="Repo" value={remoteRepository!.name} />
              <Row label="Path" value={remoteRepository!.localPath} mono />
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
            {remoteRepository?.pushPolicy && (
              <BranchAccessBlock
                policy={remoteRepository.pushPolicy}
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
                    repoPath={remoteRepository?.localPath ?? activeRepo?.localPath}
                    assignedProfileId={remoteRepository?.assignedProfileId}
                    remote={selectedRemote?.name}
                    branch={currentBranch ?? undefined}
                    onSuccess={refreshBothStores}
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

      {/* Commit & Push pre-flight sheet (modal overlay) */}
      {cpSheetOpen && (
        <div className="gw-dialog-backdrop gw-remote-modal-backdrop">
          <div
            ref={cpSheetRef}
            data-testid="commit-and-push-sheet"
            className="gw-dialog gw-remote-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commit-and-push-title"
            tabIndex={-1}
          >
            <h2 id="commit-and-push-title" className="gw-remote-modal-title">
              {STR.COMMIT_AND_PUSH_SHEET_TITLE}
            </h2>

            {cpPendingChoiceCandidates ? (
              <>
                <p>{STR.COMMIT_AND_PUSH_CHOOSE_REMOTE}</p>
                <div
                  data-testid="commit-and-push-remote-picker"
                  className="gw-toolbar gw-workflow-actions"
                >
                  {cpPendingChoiceCandidates.map((name) => (
                    <button
                      key={name}
                      type="button"
                      data-testid={`commit-and-push-remote-option-${name}`}
                      onClick={() => handlePickChoiceRemote(name)}
                      className="gw-button gw-button--secondary gw-workflow-button"
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="gw-toolbar gw-workflow-actions gw-workflow-actions--end">
                  <button
                    type="button"
                    data-testid="commit-and-push-cancel-btn"
                    onClick={handleCancelCommitAndPush}
                    className="gw-button gw-button--secondary gw-workflow-button"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              cpSelectedRemote && (
                <>
                  {/* Details table */}
                  <div className="gw-remote-details">
                    <Row label="Repo" value={remoteRepository!.name} />
                    <Row label="Path" value={remoteRepository!.localPath} mono />
                    <Row label="Branch" value={currentBranch ?? '(unknown)'} mono />
                    <Row label="Remote" value={cpSelectedRemote.name} />
                    <Row label="URL" value={cpSelectedRemote.url} mono />
                    {cpSelectedRemote.host && (
                      <Row label="Host" value={cpSelectedRemote.host} mono />
                    )}
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
                    {cpGithubContext && (
                      <div
                        className="gw-remote-detail-row"
                        data-testid="commit-and-push-github-line"
                      >
                        <span className="gw-remote-detail-label">{STR.PUSH_GH_LABEL}</span>
                        <span
                          className="gw-remote-detail-value"
                          style={{ color: githubLineColor(cpGithubContext, cpPushStatusPending) }}
                        >
                          {githubLineText(cpGithubContext, cpPushStatusPending)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Branch Access block — shown only when a push policy is configured */}
                  {remoteRepository?.pushPolicy && (
                    <BranchAccessBlock
                      policy={remoteRepository.pushPolicy}
                      currentBranch={currentBranch}
                      isHttps={isHttpsGitHubRemoteUrl(cpSelectedRemote.url)}
                    />
                  )}

                  {/* Combined verdict: the union of commit-gate and push-gate issues */}
                  {cpIssues.length > 0 && (
                    <div
                      data-testid="commit-and-push-issues"
                      className="gw-card gw-workflow-card gw-workflow-card--flush gw-commit-issues"
                      aria-live="polite"
                    >
                      {cpBlockers.map((issue) => (
                        <SafetyIssueRow
                          key={issue.code}
                          issue={issue}
                          testIdPrefix="commit-and-push"
                        />
                      ))}
                      {cpWarnings.map((issue) => (
                        <SafetyIssueRow
                          key={issue.code}
                          issue={issue}
                          testIdPrefix="commit-and-push"
                        />
                      ))}
                    </div>
                  )}

                  {cpRemediations.length > 0 && (
                    <div
                      data-testid="commit-and-push-remediations"
                      className="gw-toolbar gw-commit-remediations"
                      style={{ marginBottom: '16px' }}
                    >
                      {cpRemediations.map((rem) => (
                        <RemediationButton
                          key={rem.action}
                          remediation={rem}
                          repoPath={remoteRepository?.localPath ?? activeRepo?.localPath}
                          assignedProfileId={remoteRepository?.assignedProfileId}
                          remote={cpSelectedRemote.name}
                          branch={currentBranch ?? undefined}
                          onSuccess={refreshBothStores}
                        />
                      ))}
                    </div>
                  )}

                  {commitAndPushVerdict?.canCommitAndPush &&
                    !cpPushStatusPending &&
                    !cpOutgoingCommitsPending && (
                      <div
                        className="gw-notice gw-notice--success gw-workflow-notice gw-workflow-notice--success"
                        role="status"
                        style={{ marginBottom: '16px' }}
                      >
                        {STR.PUSH_SAFE_TO_PUSH(cpGithubContext !== undefined)}
                      </div>
                    )}

                  {/* Actions */}
                  <div className="gw-toolbar gw-workflow-actions gw-workflow-actions--end">
                    <button
                      ref={cpCancelRef}
                      type="button"
                      data-testid="commit-and-push-cancel-btn"
                      onClick={handleCancelCommitAndPush}
                      className="gw-button gw-button--secondary gw-workflow-button"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="commit-and-push-confirm-btn"
                      onClick={() => void handleConfirmCommitAndPush()}
                      disabled={
                        !commitAndPushVerdict?.canCommitAndPush ||
                        cpPushStatusPending ||
                        cpOutgoingCommitsPending
                      }
                      className="gw-button gw-button--primary gw-workflow-button"
                    >
                      {cpPushStatusPending ? STR.PUSH_GH_VERIFYING : 'Confirm'}
                    </button>
                  </div>
                </>
              )
            )}
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
