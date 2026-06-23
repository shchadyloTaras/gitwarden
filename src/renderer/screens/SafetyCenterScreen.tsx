import React, { useEffect, useMemo, useState } from 'react'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useProfilesStore } from '../store/profilesStore'
import { useSafetyCenterStore } from '../store/safetyCenterStore'
import type { SafetyIssue } from '../../core/types'

function ScopeLabel({ scope }: { scope: string | undefined }): React.ReactElement {
  if (!scope) return <span style={{ color: '#555' }}>—</span>
  const color = scope === 'local' ? '#4ade80' : '#fbbf24'
  return <span style={{ color, fontSize: '11px', marginLeft: '6px' }}>({scope})</span>
}

function Verdict({ ok, testId }: { ok: boolean; testId: string }): React.ReactElement {
  return (
    <span
      data-testid={testId}
      style={{
        fontWeight: 600,
        color: ok ? '#4ade80' : '#f87171',
        fontSize: '13px',
      }}
    >
      {ok ? '✓ Yes' : '✗ No'}
    </span>
  )
}

function IssueRow({ issue }: { issue: SafetyIssue }): React.ReactElement {
  const isBlocker = issue.severity === 'blocker'
  return (
    <div
      data-testid={`safety-issue-${issue.code}`}
      style={{
        padding: '8px 12px',
        background: isBlocker ? '#2d1b1b' : '#2d2a1b',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        fontSize: '13px',
        color: isBlocker ? '#f87171' : '#fbbf24',
      }}
    >
      <span style={{ flexShrink: 0 }}>{isBlocker ? '⛔' : '⚠'}</span>
      <span>{issue.message}</span>
    </div>
  )
}

const CARD: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: '6px',
  marginBottom: '16px',
  overflow: 'hidden',
}

const CARD_HEADER: React.CSSProperties = {
  padding: '8px 12px',
  background: '#111',
  borderBottom: '1px solid #2a2a2a',
  fontSize: '11px',
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const CARD_ROW: React.CSSProperties = {
  padding: '7px 12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #1e1e1e',
  fontSize: '13px',
}

const LABEL: React.CSSProperties = { color: '#888', flexShrink: 0, marginRight: '8px' }
const VALUE: React.CSSProperties = { color: '#e0e0e0', textAlign: 'right', wordBreak: 'break-all' }

export default function SafetyCenterScreen(): React.ReactElement {
  const { repos, load: loadRepos } = useRepositoriesStore()
  const { profiles, activeProfileId } = useProfilesStore()
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

  const [selectedRepoId, setSelectedRepoId] = useState<string>('')

  const activeProfile_ = profiles.find((p) => p.id === activeProfileId) ?? null

  useEffect(() => {
    void loadRepos()
  }, [loadRepos])

  useEffect(() => {
    const repo = repos.find((r) => r.id === selectedRepoId)
    if (repo) void load(repo.localPath, repo, activeProfile_, profiles)
  }, [activeProfile_, load, profiles, repos, selectedRepoId])

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

  return (
    <div
      data-testid="screen-safety-center"
      style={{ padding: '24px', maxWidth: '720px', fontFamily: 'inherit' }}
    >
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600 }}>Safety Center</h2>

      {/* Repository picker */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>
          Repository
        </label>
        <select
          data-testid="safety-repo-select"
          value={selectedRepoId}
          onChange={(e) => setSelectedRepoId(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#e0e0e0',
            fontSize: '13px',
          }}
        >
          <option value="">— Select a repository —</option>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>Loading…</div>
      )}

      {error && (
        <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '16px' }}>{error}</div>
      )}

      {!loading && !repository && !selectedRepoId && (
        <div style={{ color: '#666', fontSize: '13px' }}>
          Select a repository to run the identity audit.
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
                style={{ ...VALUE, color: activeProfile ? '#e0e0e0' : '#555' }}
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
                  color: assignedProfile ? (profileMismatch ? '#f87171' : '#e0e0e0') : '#555',
                }}
              >
                {assignedProfile ? assignedProfile.displayName : '—'}
              </span>
            </div>
            {profileMismatch && (
              <div
                style={{
                  padding: '7px 12px',
                  background: '#2d1b1b',
                  fontSize: '12px',
                  color: '#f87171',
                }}
              >
                This repository is assigned to <strong>{assignedProfile!.displayName}</strong>, but
                your active profile is <strong>{activeProfile!.displayName}</strong>.
              </div>
            )}
          </div>

          {/* Identity card */}
          <div style={CARD}>
            <div style={CARD_HEADER}>Git Identity</div>
            <div style={CARD_ROW}>
              <span style={LABEL}>user.name</span>
              <span data-testid="safety-identity-name" style={VALUE}>
                {identity?.userName ?? <span style={{ color: '#f87171' }}>not set</span>}
                <ScopeLabel scope={identity?.nameSource} />
              </span>
            </div>
            <div style={CARD_ROW}>
              <span style={LABEL}>user.email</span>
              <span data-testid="safety-identity-email" style={VALUE}>
                {identity?.userEmail ?? <span style={{ color: '#f87171' }}>not set</span>}
                <ScopeLabel scope={identity?.emailSource} />
              </span>
            </div>
            {identity?.emailSource && identity.emailSource !== 'local' && (
              <div
                data-testid="safety-identity-scope-warning"
                style={{
                  padding: '7px 12px',
                  background: '#2d2a1b',
                  fontSize: '12px',
                  color: '#fbbf24',
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
              <div style={{ ...CARD_ROW, color: '#555', fontSize: '13px' }}>
                No remotes configured
              </div>
            ) : (
              remotes.map((r) => (
                <div key={r.name} style={CARD_ROW}>
                  <span style={LABEL}>{r.name}</span>
                  <span style={{ ...VALUE, fontSize: '12px' }}>
                    <span data-testid={`safety-remote-host-${r.name}`} style={{ color: '#a78bfa' }}>
                      {r.host ?? 'local'}
                    </span>
                    <span style={{ color: '#555', marginLeft: '6px' }}>
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
                background: '#1a2d1b',
                border: '1px solid #2d4a2d',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#4ade80',
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
