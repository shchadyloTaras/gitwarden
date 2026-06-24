import React, { useEffect, useMemo } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useCommitStore } from '../store/commitStore'
import { useAppStore } from '../store/appStore'
import { safetyCheckService } from '../../core/safety/SafetyCheckService'

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

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [load, activeRepo])

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

  return (
    <div
      data-testid="screen-commit"
      style={{ padding: '24px', maxWidth: '720px', fontFamily: 'inherit' }}
    >
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600 }}>Commit</h2>

      {loading && (
        <div style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>Loading…</div>
      )}

      {!loading && !repository && !activeRepo && (
        <div style={{ color: '#666', fontSize: '13px' }}>Add a repository to get started.</div>
      )}

      {!loading && repository && (
        <>
          {/* Staged changes summary */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>
              Staged Changes ({stagedFiles.length})
            </div>
            <div
              data-testid="commit-staged-summary"
              style={{
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '4px',
                padding: stagedFiles.length ? '8px' : '10px 12px',
                fontSize: '13px',
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            >
              {stagedFiles.length === 0 ? (
                <span style={{ color: '#555' }}>No staged changes</span>
              ) : (
                stagedFiles.map((f) => (
                  <div key={f.path} style={{ color: '#4ade80', padding: '2px 0' }}>
                    + {f.path}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Commit message */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}
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
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#e0e0e0',
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
                border: '1px solid #2a2a2a',
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
                    background: '#2d1b1b',
                    borderBottom: '1px solid #3d2020',
                    fontSize: '13px',
                    color: '#f87171',
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
                    background: '#2d2a1b',
                    borderBottom: '1px solid #3d3520',
                    fontSize: '13px',
                    color: '#fbbf24',
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
                    background: '#1a1a2e',
                    borderTop: blockers.length + warnings.length > 0 ? '1px solid #2a2a3a' : 'none',
                  }}
                >
                  <button
                    data-testid="commit-set-identity-btn"
                    onClick={handleSetIdentity}
                    disabled={identityLoading}
                    style={{
                      background: '#3b82f6',
                      color: '#fff',
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
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#666' }}>
                    This changes local repository Git config only, not global Git config.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Commit error */}
          {error && (
            <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
          )}

          {/* Success */}
          {committedHash && (
            <div
              data-testid="commit-success"
              style={{
                padding: '10px 14px',
                background: '#1a2d1b',
                border: '1px solid #2d4a2d',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#4ade80',
                marginBottom: '16px',
              }}
            >
              ✓ Committed {committedHash}
            </div>
          )}

          {/* Commit button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              data-testid="commit-btn"
              onClick={handleCommit}
              disabled={!safetyResult?.canCommit || commitLoading}
              style={{
                background: safetyResult?.canCommit ? '#3b82f6' : '#333',
                color: safetyResult?.canCommit ? '#fff' : '#555',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 20px',
                fontSize: '13px',
                cursor: safetyResult?.canCommit ? 'pointer' : 'not-allowed',
              }}
            >
              {commitLoading ? 'Committing…' : 'Commit Changes'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
