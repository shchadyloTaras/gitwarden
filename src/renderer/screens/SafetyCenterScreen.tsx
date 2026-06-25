import React, { useEffect, useMemo, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useSafetyCenterStore } from '../store/safetyCenterStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useAppStore } from '../store/appStore'
import SafetyIssueRow from '../components/SafetyIssueRow'
import type { SafetyIssue } from '../../core/types'

function ScopeLabel({ scope }: { scope: string | undefined }): React.ReactElement {
  if (!scope) return <span style={{ color: 'var(--gw-text-dim, #52525b)' }}>—</span>
  const color = scope === 'local' ? 'var(--gw-success, #4ade80)' : 'var(--gw-warning, #fbbf24)'
  return <span style={{ color, fontSize: '11px', marginLeft: '6px' }}>({scope})</span>
}

function Verdict({ ok, testId }: { ok: boolean; testId: string }): React.ReactElement {
  return (
    <span
      data-testid={testId}
      style={{
        fontWeight: 600,
        color: ok ? 'var(--gw-success, #4ade80)' : 'var(--gw-danger, #f87171)',
        fontSize: '13px',
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

const CARD: React.CSSProperties = {
  background: 'var(--gw-surface, #18181b)',
  border: '1px solid var(--gw-border, #27272a)',
  borderRadius: '6px',
  marginBottom: '16px',
  overflow: 'hidden',
}

const CARD_HEADER: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--gw-bg, #09090b)',
  borderBottom: '1px solid var(--gw-border, #27272a)',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--gw-text-faint, #71717a)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const CARD_ROW: React.CSSProperties = {
  padding: '7px 12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--gw-surface, #18181b)',
  fontSize: '13px',
}

const LABEL: React.CSSProperties = {
  color: 'var(--gw-text-faint, #71717a)',
  flexShrink: 0,
  marginRight: '8px',
}
const VALUE: React.CSSProperties = {
  color: 'var(--gw-text, #f4f4f5)',
  textAlign: 'right',
  wordBreak: 'break-all',
}

export default function SafetyCenterScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
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
  }, [activeRepo, activeProfile_, load, profiles])

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
    <div
      data-testid="screen-safety-center"
      style={{ padding: '24px', maxWidth: '720px', fontFamily: 'inherit' }}
    >
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600 }}>Safety Center</h2>

      {loading && (
        <div
          style={{ color: 'var(--gw-text-faint, #71717a)', fontSize: '13px', marginBottom: '16px' }}
        >
          Loading…
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--gw-danger, #f87171)', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {!loading && !repository && !activeRepo && (
        <div style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: '13px' }}>
          Add a repository to run the identity audit.
        </div>
      )}

      {!loading && repository && (
        <>
          {/* Profiles card */}
          <div style={CARD}>
            <div style={CARD_HEADER}>Profiles</div>
            <div style={CARD_ROW}>
              <span style={LABEL}>Active profile</span>
              <span
                data-testid="safety-active-profile-name"
                style={{
                  ...VALUE,
                  color: activeProfile ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-dim, #52525b)',
                }}
              >
                {activeProfile ? activeProfile.displayName : '—'}
              </span>
            </div>
            <div style={CARD_ROW}>
              <span style={LABEL}>Assigned profile</span>
              <span
                data-testid="safety-assigned-profile-name"
                style={{
                  ...VALUE,
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
                style={{
                  padding: '7px 12px',
                  background: 'var(--gw-danger-bg, #450a0a)',
                  fontSize: '12px',
                  color: 'var(--gw-danger, #f87171)',
                }}
              >
                This repository is assigned to <strong>{assignedProfile!.displayName}</strong>, but
                your active profile is <strong>{activeProfile!.displayName}</strong>.
              </div>
            )}
            {repoUnassigned && activeProfile_ && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--gw-accent-soft, #1e1b4b)',
                  borderTop: '1px solid var(--gw-border, #27272a)',
                }}
              >
                <button
                  data-testid="safety-assign-repo-btn"
                  onClick={() => void handleAssignToActiveProfile()}
                  disabled={assigning}
                  style={{
                    background: 'var(--gw-primary, #2563eb)',
                    color: 'var(--gw-on-solid, #fff)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: assigning ? 'wait' : 'pointer',
                  }}
                >
                  {assigning ? 'Assigning…' : `Assign this repo to ${activeProfile_.displayName}`}
                </button>
                {assignError && (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
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
                style={{
                  padding: '7px 12px',
                  background: 'var(--gw-warning-bg, #422006)',
                  fontSize: '12px',
                  color: 'var(--gw-warning, #fbbf24)',
                }}
              >
                Select or create a profile in Profiles, then assign this repository to it.
              </div>
            )}
          </div>

          {/* Identity card */}
          <div style={CARD}>
            <div style={CARD_HEADER}>Git Identity</div>
            <div style={CARD_ROW}>
              <span style={LABEL}>user.name</span>
              <span data-testid="safety-identity-name" style={VALUE}>
                {identity?.userName ?? (
                  <span style={{ color: 'var(--gw-danger, #f87171)' }}>not set</span>
                )}
                <ScopeLabel scope={identity?.nameSource} />
              </span>
            </div>
            <div style={CARD_ROW}>
              <span style={LABEL}>user.email</span>
              <span data-testid="safety-identity-email" style={VALUE}>
                {identity?.userEmail ?? (
                  <span style={{ color: 'var(--gw-danger, #f87171)' }}>not set</span>
                )}
                <ScopeLabel scope={identity?.emailSource} />
              </span>
            </div>
            {identity?.emailSource && identity.emailSource !== 'local' && (
              <div
                data-testid="safety-identity-scope-warning"
                style={{
                  padding: '7px 12px',
                  background: 'var(--gw-warning-bg, #422006)',
                  fontSize: '12px',
                  color: 'var(--gw-warning, #fbbf24)',
                }}
              >
                Your Git identity is inherited from global config, not set for this repository.
              </div>
            )}
          </div>

          {/* Remote & Branch card */}
          <div style={CARD}>
            <div style={CARD_HEADER}>Remote &amp; Branch</div>
            <div style={CARD_ROW}>
              <span style={LABEL}>Current branch</span>
              <span data-testid="safety-current-branch" style={VALUE}>
                {currentBranch ?? '—'}
              </span>
            </div>
            <div style={CARD_ROW}>
              <span style={LABEL}>Auth method</span>
              <span style={VALUE}>
                {activeProfile?.authenticationMethod === 'token' ? 'Token' : 'SSH'}
              </span>
            </div>
            {remotes.length === 0 ? (
              <div style={{ ...CARD_ROW, color: 'var(--gw-text-dim, #52525b)', fontSize: '13px' }}>
                No remotes configured
              </div>
            ) : (
              remotes.map((r) => (
                <div key={r.name} style={CARD_ROW}>
                  <span style={LABEL}>{r.name}</span>
                  <span style={{ ...VALUE, fontSize: '12px' }}>
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
          </div>

          {/* Verdict card */}
          <div style={CARD}>
            <div style={CARD_HEADER}>Verdict</div>
            <div style={CARD_ROW}>
              <span style={LABEL}>Can commit (identity)</span>
              <Verdict ok={canCommit} testId="safety-can-commit" />
            </div>
            <div style={{ ...CARD_ROW, borderBottom: 'none' }}>
              <span style={LABEL}>Can push</span>
              <Verdict ok={canPush} testId="safety-can-push" />
            </div>
          </div>

          {/* Issues */}
          {allIssues.length > 0 && (
            <div style={CARD}>
              <div style={CARD_HEADER}>Issues ({allIssues.length})</div>
              {allIssues.map((issue) => (
                <IssueRow key={issue.code} issue={issue} />
              ))}
            </div>
          )}

          {allIssues.length === 0 && identityCheck && pushCheck && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--gw-success-bg, #052e16)',
                border: '1px solid var(--gw-success-border, #2d4a2d)',
                borderRadius: '6px',
                fontSize: '13px',
                color: 'var(--gw-success, #4ade80)',
              }}
            >
              ✓ No identity issues detected. This repository is safe to commit and push.
            </div>
          )}
        </>
      )}
    </div>
  )
}
