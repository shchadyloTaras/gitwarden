import React, { useEffect, useMemo, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useSafetyCenterStore } from '../store/safetyCenterStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useAppStore } from '../store/appStore'
import SafetyIssueRow from '../components/SafetyIssueRow'
import { matchesAnyPattern } from '../../core/safety/branchPatterns'
import type { SafetyIssue } from '../../core/types'
import { STR } from '../strings'
import './workflowScreens.css'

function ScopeLabel({ scope }: { scope: string | undefined }): React.ReactElement {
  if (!scope) return <span style={{ color: 'var(--gw-text-dim, #52525b)' }}>—</span>
  const color = scope === 'local' ? 'var(--gw-success, #4ade80)' : 'var(--gw-warning, #fbbf24)'
  return (
    <span className="gw-safety-scope" style={{ color }}>
      ({scope})
    </span>
  )
}

function Verdict({ ok, testId }: { ok: boolean; testId: string }): React.ReactElement {
  return (
    <span
      data-testid={testId}
      className="gw-ai-status"
      style={{
        fontWeight: 600,
        color: ok ? 'var(--gw-success, #4ade80)' : 'var(--gw-danger, #f87171)',
      }}
    >
      {ok ? '✓ Yes' : '✗ No'}
    </span>
  )
}

function IssueRow({
  issue,
}: {
  issue: import('../../core/types').SafetyIssue
}): React.ReactElement {
  return <SafetyIssueRow issue={issue} testIdPrefix="safety" />
}

export default function SafetyCenterScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  // Live branch from the app-wide store (updated the instant a switch succeeds) — used only
  // to retrigger the load effect below; the checks themselves read the store's own
  // `currentBranch`, fetched together with identityCheck/pushCheck in the same load() call.
  const liveCurrentBranch = useAppStore((s) => s.currentBranch)
  const setActiveRepo = useAppStore((s) => s.setActiveRepo)
  const updateRepo = useRepositoriesStore((s) => s.updateRepo)
  const { profiles, activeProfileId } = useProfilesStore()
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const {
    repository,
    activeProfile,
    assignedProfile,
    identity,
    remotes,
    currentBranch,
    identityCheck,
    pushCheck,
    loading,
    error,
    load,
  } = useSafetyCenterStore()

  const activeProfile_ = profiles.find((p) => p.id === activeProfileId) ?? null

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo, activeProfile_, profiles)
  }, [activeRepo, liveCurrentBranch, activeProfile_, load, profiles])

  // Deduplicate issues from both checks, preserving order (identity first, then push-only)
  const allIssues = useMemo(() => {
    const seen = new Set<string>()
    const combined: SafetyIssue[] = []
    for (const issue of [...(identityCheck?.issues ?? []), ...(pushCheck?.issues ?? [])]) {
      if (!seen.has(issue.code)) {
        seen.add(issue.code)
        combined.push(issue)
      }
    }
    return combined
  }, [identityCheck, pushCheck])

  const canCommit = identityCheck?.canCommit ?? false
  const canPush = pushCheck?.canPush ?? false

  const profileMismatch =
    activeProfile && assignedProfile && activeProfile.id !== assignedProfile.id
  const repoUnassigned = repository && !repository.assignedProfileId

  const handleAssignToActiveProfile = async () => {
    if (!repository || !activeProfile_) return
    setAssigning(true)
    setAssignError(null)
    try {
      await updateRepo(repository.id, { assignedProfileId: activeProfile_.id })
      const updated =
        useRepositoriesStore.getState().repos.find((r) => r.id === repository.id) ?? null
      if (updated) {
        setActiveRepo(updated)
        await load(updated.localPath, updated, activeProfile_, profiles)
      }
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : String(err))
    } finally {
      setAssigning(false)
    }
  }

  return (
    <section
      data-testid="screen-safety-center"
      className="gw-page gw-workflow-page"
      aria-labelledby="safety-page-title"
      aria-busy={loading}
    >
      <header className="gw-page-header gw-workflow-page-header">
        <h1 id="safety-page-title" className="gw-page-title gw-workflow-page-title">
          Safety Center
        </h1>
      </header>

      {loading && (
        <div className="gw-empty-state gw-workflow-state" role="status">
          Loading…
        </div>
      )}

      {error && (
        <div
          className="gw-notice gw-notice--danger gw-workflow-notice gw-workflow-notice--danger"
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && !repository && !activeRepo && (
        <div className="gw-empty-state gw-workflow-empty">
          Add a repository to run the identity audit.
        </div>
      )}

      {!loading && repository && (
        <div className="gw-workflow-stack">
          {/* Profiles card */}
          <section
            className="gw-card gw-workflow-card gw-workflow-card--flush gw-safety-card"
            aria-labelledby="safety-profiles-title"
          >
            <h2 id="safety-profiles-title" className="gw-safety-card-heading">
              Profiles
            </h2>
            <div className="gw-safety-row">
              <span className="gw-safety-label">Active profile</span>
              <span
                data-testid="safety-active-profile-name"
                className="gw-safety-value"
                style={{
                  color: activeProfile ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-dim, #52525b)',
                }}
              >
                {activeProfile ? activeProfile.displayName : '—'}
              </span>
            </div>
            <div className="gw-safety-row">
              <span className="gw-safety-label">Assigned profile</span>
              <span
                data-testid="safety-assigned-profile-name"
                className="gw-safety-value"
                style={{
                  color: assignedProfile
                    ? profileMismatch
                      ? 'var(--gw-danger, #f87171)'
                      : 'var(--gw-text, #f4f4f5)'
                    : 'var(--gw-text-dim, #52525b)',
                }}
              >
                {assignedProfile ? assignedProfile.displayName : '—'}
              </span>
            </div>
            {profileMismatch && (
              <div
                className="gw-notice gw-notice--danger gw-workflow-notice--danger gw-safety-inline-notice"
                role="alert"
              >
                This repository is assigned to <strong>{assignedProfile!.displayName}</strong>, but
                your active profile is <strong>{activeProfile!.displayName}</strong>.
              </div>
            )}
            {repoUnassigned && activeProfile_ && (
              <div className="gw-safety-assignment-actions">
                <button
                  type="button"
                  data-testid="safety-assign-repo-btn"
                  data-tooltip={STR.TT_SAFETY_ASSIGN_REPO}
                  onClick={() => void handleAssignToActiveProfile()}
                  disabled={assigning}
                  className="gw-button gw-button--primary gw-workflow-button"
                >
                  {assigning ? 'Assigning…' : `Assign this repo to ${activeProfile_.displayName}`}
                </button>
                {assignError && (
                  <div
                    role="alert"
                    style={{
                      marginTop: '6px',
                      color: 'var(--gw-danger, #f87171)',
                    }}
                  >
                    {assignError}
                  </div>
                )}
              </div>
            )}
            {repoUnassigned && !activeProfile_ && (
              <div
                data-testid="safety-assign-repo-hint"
                className="gw-notice gw-notice--warning gw-workflow-notice--warning gw-safety-inline-notice"
              >
                Select or create a profile in Profiles, then assign this repository to it.
              </div>
            )}
          </section>

          {/* Identity card */}
          <section
            className="gw-card gw-workflow-card gw-workflow-card--flush gw-safety-card"
            aria-labelledby="safety-identity-title"
          >
            <h2 id="safety-identity-title" className="gw-safety-card-heading">
              Git Identity
            </h2>
            <div className="gw-safety-row">
              <span className="gw-safety-label">user.name</span>
              <span data-testid="safety-identity-name" className="gw-safety-value">
                {identity?.userName ?? (
                  <span style={{ color: 'var(--gw-danger, #f87171)' }}>not set</span>
                )}
                <ScopeLabel scope={identity?.nameSource} />
              </span>
            </div>
            <div className="gw-safety-row">
              <span className="gw-safety-label">user.email</span>
              <span data-testid="safety-identity-email" className="gw-safety-value">
                {identity?.userEmail ?? (
                  <span style={{ color: 'var(--gw-danger, #f87171)' }}>not set</span>
                )}
                <ScopeLabel scope={identity?.emailSource} />
              </span>
            </div>
            {identity?.emailSource && identity.emailSource !== 'local' && (
              <div
                data-testid="safety-identity-scope-warning"
                className="gw-notice gw-notice--warning gw-workflow-notice--warning gw-safety-inline-notice"
              >
                Your Git identity is inherited from global config, not set for this repository.
              </div>
            )}
          </section>

          {/* Remote & Branch card */}
          <section
            className="gw-card gw-workflow-card gw-workflow-card--flush gw-safety-card"
            aria-labelledby="safety-remote-title"
          >
            <h2 id="safety-remote-title" className="gw-safety-card-heading">
              Remote &amp; Branch
            </h2>
            <div className="gw-safety-row">
              <span className="gw-safety-label">Current branch</span>
              <span data-testid="safety-current-branch" className="gw-safety-value">
                {currentBranch ?? '—'}
              </span>
            </div>
            <div className="gw-safety-row">
              <span className="gw-safety-label">Auth method</span>
              <span className="gw-safety-value">
                {activeProfile?.authenticationMethod === 'token' ? 'Token' : 'SSH'}
              </span>
            </div>
            {remotes.length === 0 ? (
              <div className="gw-safety-row" style={{ color: 'var(--gw-text-dim, #52525b)' }}>
                No remotes configured
              </div>
            ) : (
              remotes.map((r) => (
                <div key={r.name} className="gw-safety-row">
                  <span className="gw-safety-label">{r.name}</span>
                  <span className="gw-safety-value">
                    <span
                      data-testid={`safety-remote-host-${r.name}`}
                      style={{ color: 'var(--gw-purple, #a78bfa)' }}
                    >
                      {r.host ?? 'local'}
                    </span>
                    <span style={{ color: 'var(--gw-text-dim, #52525b)', marginLeft: '6px' }}>
                      {r.url.length > 50 ? r.url.slice(0, 50) + '…' : r.url}
                    </span>
                  </span>
                </div>
              ))
            )}
          </section>

          {/* Branch Access card — only when a push policy is configured */}
          {repository?.pushPolicy && (
            <section
              data-testid="safety-branch-access-card"
              className="gw-card gw-workflow-card gw-workflow-card--flush gw-safety-card"
              aria-labelledby="safety-branch-access-title"
            >
              <h2 id="safety-branch-access-title" className="gw-safety-card-heading">
                {STR.BRANCH_ACCESS_SECTION_TITLE}
              </h2>
              <div className="gw-safety-row">
                <span className="gw-safety-label">{STR.BRANCH_ACCESS_MODE_LABEL}</span>
                <span className="gw-safety-value">
                  {repository.pushPolicy.mode === 'branchScoped'
                    ? STR.PUSH_POLICY_MODE_BRANCH_SCOPED
                    : STR.PUSH_POLICY_MODE_UNRESTRICTED}
                </span>
              </div>
              {repository.pushPolicy.allowedBranchPatterns.length > 0 && (
                <div className="gw-safety-row">
                  <span className="gw-safety-label">
                    {STR.BRANCH_ACCESS_ALLOWED_PATTERNS_LABEL}
                  </span>
                  <span
                    data-testid="safety-branch-access-allowed"
                    className="gw-safety-value gw-workflow-mono"
                    style={{ fontSize: 12 }}
                  >
                    {repository.pushPolicy.allowedBranchPatterns.join(', ')}
                  </span>
                </div>
              )}
              {repository.pushPolicy.blockedBranchPatterns.length > 0 && (
                <div className="gw-safety-row">
                  <span className="gw-safety-label">
                    {STR.BRANCH_ACCESS_BLOCKED_PATTERNS_LABEL}
                  </span>
                  <span
                    data-testid="safety-branch-access-blocked"
                    className="gw-safety-value gw-workflow-mono"
                    style={{ fontSize: 12 }}
                  >
                    {repository.pushPolicy.blockedBranchPatterns.join(', ')}
                  </span>
                </div>
              )}
              <div className="gw-safety-row">
                <span className="gw-safety-label">{STR.BRANCH_ACCESS_CURRENT_BRANCH_LABEL}</span>
                <span
                  data-testid="safety-branch-access-verdict"
                  style={{
                    fontWeight: 600,
                    color: currentBranch
                      ? matchesAnyPattern(
                          currentBranch,
                          repository.pushPolicy.blockedBranchPatterns
                        )
                        ? 'var(--gw-danger, #f87171)'
                        : 'var(--gw-success, #4ade80)'
                      : 'var(--gw-text-dim, #52525b)',
                    fontSize: 14,
                  }}
                >
                  {currentBranch
                    ? matchesAnyPattern(currentBranch, repository.pushPolicy.blockedBranchPatterns)
                      ? `${currentBranch} · ${STR.BRANCH_BADGE_BLOCKED}`
                      : repository.pushPolicy.mode === 'branchScoped' &&
                          repository.pushPolicy.allowedBranchPatterns.length > 0 &&
                          matchesAnyPattern(
                            currentBranch,
                            repository.pushPolicy.allowedBranchPatterns
                          )
                        ? `${currentBranch} · ${STR.BRANCH_BADGE_ALLOWED}`
                        : currentBranch
                    : '—'}
                </span>
              </div>
            </section>
          )}

          {/* Verdict card */}
          <section
            className="gw-card gw-workflow-card gw-workflow-card--flush gw-safety-card"
            aria-labelledby="safety-verdict-title"
          >
            <h2 id="safety-verdict-title" className="gw-safety-card-heading">
              Verdict
            </h2>
            <div className="gw-safety-row">
              <span className="gw-safety-label">Can commit (identity)</span>
              <Verdict ok={canCommit} testId="safety-can-commit" />
            </div>
            <div className="gw-safety-row">
              <span className="gw-safety-label">Can push</span>
              <Verdict ok={canPush} testId="safety-can-push" />
            </div>
          </section>

          {/* Issues */}
          {allIssues.length > 0 && (
            <section
              className="gw-card gw-workflow-card gw-workflow-card--flush gw-safety-card"
              aria-labelledby="safety-issues-title"
              aria-live="polite"
            >
              <h2 id="safety-issues-title" className="gw-safety-card-heading">
                Issues ({allIssues.length})
              </h2>
              {allIssues.map((issue) => (
                <IssueRow key={issue.code} issue={issue} />
              ))}
            </section>
          )}

          {allIssues.length === 0 && identityCheck && pushCheck && (
            <div
              className="gw-notice gw-notice--success gw-workflow-notice gw-workflow-notice--success"
              role="status"
            >
              ✓ No identity issues detected. This repository is safe to commit and push.
            </div>
          )}
        </div>
      )}
    </section>
  )
}
