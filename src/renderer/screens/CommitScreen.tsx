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
