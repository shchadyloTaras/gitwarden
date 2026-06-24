import React, { useEffect, useMemo, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useRemoteStore } from '../store/remoteStore'
import { useAppStore } from '../store/appStore'
import { safetyCheckService } from '../../core/safety/SafetyCheckService'
import type { GitHubPushContext } from '../../core/safety/SafetyCheckService'
import { isHttpsGitHubRemoteUrl } from '../../core/github/remoteUrl'
import type { GitRemote } from '../../core/types'
import { STR } from '../strings'

/** Renderer-side mirror of the main GitHubPushStatus (token-free). */
type PushStatus = { hasToken: boolean; tokenInvalid: boolean; effectiveLogin?: string }

export default function RemoteScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const { profiles, activeProfileId } = useProfilesStore()
  const {
    repository,
    remotes,
    currentBranch,
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
  } = useRemoteStore()

  const [showPushSheet, setShowPushSheet] = useState(false)
  const [selectedRemote, setSelectedRemote] = useState<GitRemote | null>(null)
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushStatusPending, setPushStatusPending] = useState(false)

  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  const assignedProfile = repository?.assignedProfileId
    ? profiles.find((p) => p.id === repository.assignedProfileId)
    : undefined

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [load, activeRepo])

  // The GitHub HTTPS-token push context for the selected remote — only engaged for an
  // HTTPS GitHub remote, so SSH/file remotes are unaffected.
  const githubContext = useMemo((): GitHubPushContext | undefined => {
    if (!selectedRemote || !isHttpsGitHubRemoteUrl(selectedRemote.url)) return undefined
    return {
      httpsToGitHub: true,
      assignedLogin: assignedProfile?.linkedGitHub?.login,
      hasToken: pushStatus?.hasToken ?? false,
      tokenInvalid: pushStatus?.tokenInvalid ?? false,
      effectiveLogin: pushStatus?.effectiveLogin,
    }
  }, [selectedRemote, assignedProfile, pushStatus])

  // Compute push safety for the selected remote
  const pushSafetyResult = useMemo(() => {
    if (!repository || !identity || !selectedRemote) return null
    return safetyCheckService.checkPush({
      repository,
      activeProfile,
      identity,
      remotes: [selectedRemote],
      currentBranch: currentBranch ?? undefined,
      // Withhold the context until the token is verified so we don't flash a stale verdict.
      github: pushStatusPending ? undefined : githubContext,
    })
  }, [
    repository,
    identity,
    activeProfile,
    selectedRemote,
    currentBranch,
    githubContext,
    pushStatusPending,
  ])

  const handleOpenPushSheet = (remote: GitRemote) => {
    clearMessages()
    setSelectedRemote(remote)
    setShowPushSheet(true)
    setPushStatus(null)

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
  }

  const handleClosePushSheet = () => {
    setShowPushSheet(false)
    setSelectedRemote(null)
    setPushStatus(null)
    setPushStatusPending(false)
  }

  const handleConfirmPush = async () => {
    if (
      !selectedRemote ||
      !currentBranch ||
      pushStatusPending ||
      pushSafetyResult?.canPush === false
    )
      return
    setShowPushSheet(false)
    await doRemotePush(selectedRemote.name, currentBranch)
  }

  const pushBlockers = pushSafetyResult?.issues.filter((i) => i.severity === 'blocker') ?? []
  const pushWarnings = pushSafetyResult?.issues.filter((i) => i.severity === 'warning') ?? []

  return (
    <div
      data-testid="screen-remote"
      style={{ padding: '24px', maxWidth: '720px', fontFamily: 'inherit' }}
    >
      <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600 }}>Remote</h2>

      {loading && (
        <div style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>Loading…</div>
      )}

      {!loading && !repository && !activeRepo && (
        <div style={{ color: '#666', fontSize: '13px' }}>Add a repository to get started.</div>
      )}

      {!loading && repository && (
        <>
          {/* Current branch */}
          {currentBranch && (
            <div style={{ marginBottom: '16px', fontSize: '13px', color: '#aaa' }}>
              Branch:{' '}
              <span
                data-testid="remote-current-branch"
                style={{ color: '#60a5fa', fontFamily: 'monospace' }}
              >
                {currentBranch}
              </span>
            </div>
          )}

          {/* Remotes list */}
          {remotes.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
              No remotes configured for this repository.
            </div>
          ) : (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                Remotes ({remotes.length})
              </div>
              {remotes.map((remote) => (
                <div
                  key={remote.name}
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    borderRadius: '4px',
                    padding: '12px',
                    marginBottom: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          color: '#e0e0e0',
                          fontWeight: 600,
                        }}
                      >
                        {remote.name}
                      </span>
                      <span
                        style={{
                          marginLeft: '10px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          color: '#666',
                        }}
                      >
                        {remote.url}
                      </span>
                      {remote.host && (
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '11px',
                            color: '#888',
                            background: '#252525',
                            padding: '1px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {remote.host}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        data-testid="remote-op-fetch"
                        onClick={() => doFetch(remote.name)}
                        disabled={
                          fetchLoading === remote.name || pullLoading !== null || pushLoading
                        }
                        style={{
                          background: '#252525',
                          color: '#ccc',
                          border: '1px solid #333',
                          borderRadius: '4px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          cursor: fetchLoading === remote.name ? 'wait' : 'pointer',
                        }}
                      >
                        {fetchLoading === remote.name ? 'Fetching…' : 'Fetch'}
                      </button>

                      {currentBranch && (
                        <button
                          data-testid="remote-op-pull"
                          onClick={() => doPull(remote.name, currentBranch)}
                          disabled={
                            pullLoading === remote.name || fetchLoading !== null || pushLoading
                          }
                          style={{
                            background: '#252525',
                            color: '#ccc',
                            border: '1px solid #333',
                            borderRadius: '4px',
                            padding: '5px 10px',
                            fontSize: '12px',
                            cursor: pullLoading === remote.name ? 'wait' : 'pointer',
                          }}
                        >
                          {pullLoading === remote.name ? 'Pulling…' : 'Pull'}
                        </button>
                      )}

                      {currentBranch && (
                        <button
                          data-testid="remote-op-push"
                          onClick={() => handleOpenPushSheet(remote)}
                          disabled={fetchLoading !== null || pullLoading !== null || pushLoading}
                          style={{
                            background: '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 10px',
                            fontSize: '12px',
                            cursor: pushLoading ? 'wait' : 'pointer',
                          }}
                        >
                          {pushLoading ? 'Pushing…' : 'Push'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div
              data-testid="remote-success"
              style={{
                padding: '10px 14px',
                background: '#1a2d1b',
                border: '1px solid #2d4a2d',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#4ade80',
                marginBottom: '12px',
              }}
            >
              ✓ {successMessage}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              data-testid="remote-error"
              style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}
            >
              {error}
            </div>
          )}
        </>
      )}

      {/* Push confirmation sheet (modal overlay) */}
      {showPushSheet && selectedRemote && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            data-testid="remote-push-sheet"
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '24px',
              width: '500px',
              maxHeight: '85vh',
              overflowY: 'auto',
              fontFamily: 'inherit',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>
              Push to {selectedRemote.name}
            </h3>

            {/* Details table */}
            <div
              style={{
                background: '#111',
                border: '1px solid #2a2a2a',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '12px',
                lineHeight: 1.8,
              }}
            >
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
                <div style={{ display: 'flex', gap: '8px' }} data-testid="remote-push-github-line">
                  <span style={{ color: '#666', minWidth: '110px', flexShrink: 0 }}>
                    {STR.PUSH_GH_LABEL}
                  </span>
                  <span style={{ color: githubLineColor(githubContext, pushStatusPending) }}>
                    {githubLineText(githubContext, pushStatusPending)}
                  </span>
                </div>
              )}
            </div>

            {/* Safety issues */}
            {pushSafetyResult && pushSafetyResult.issues.length > 0 && (
              <div
                style={{
                  border: '1px solid #2a2a2a',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '16px',
                }}
              >
                {pushBlockers.map((issue) => (
                  <div
                    key={issue.code}
                    data-testid="remote-push-blocker"
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
                {pushWarnings.map((issue) => (
                  <div
                    key={issue.code}
                    data-testid="remote-push-warning"
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
              </div>
            )}

            {pushSafetyResult?.canPush && pushSafetyResult.issues.length === 0 && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#1a2d1b',
                  border: '1px solid #2d4a2d',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#4ade80',
                  marginBottom: '16px',
                }}
              >
                ✓ Identity check passed — safe to push.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                data-testid="remote-push-cancel-btn"
                onClick={handleClosePushSheet}
                style={{
                  background: 'transparent',
                  color: '#aaa',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '7px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                data-testid="remote-push-confirm-btn"
                onClick={handleConfirmPush}
                disabled={!pushSafetyResult?.canPush || pushLoading || pushStatusPending}
                style={{
                  background: pushSafetyResult?.canPush && !pushStatusPending ? '#3b82f6' : '#333',
                  color: pushSafetyResult?.canPush && !pushStatusPending ? '#fff' : '#555',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '7px 16px',
                  fontSize: '13px',
                  cursor:
                    pushSafetyResult?.canPush && !pushStatusPending ? 'pointer' : 'not-allowed',
                }}
              >
                {pushStatusPending ? STR.PUSH_GH_VERIFYING : 'Confirm Push'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
  if (pending) return '#888'
  const ok =
    github.hasToken &&
    !github.tokenInvalid &&
    (github.assignedLogin === undefined ||
      github.effectiveLogin === undefined ||
      github.assignedLogin === github.effectiveLogin)
  return ok ? '#4ade80' : '#f87171'
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
    <div style={{ display: 'flex', gap: '8px' }}>
      <span style={{ color: '#666', minWidth: '110px', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: '#ccc',
          fontFamily: mono ? 'monospace' : 'inherit',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}
