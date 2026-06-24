import React, { useEffect, useMemo, useState } from 'react'
import { useProfilesStore } from '../store/profilesStore'
import { useRemoteStore } from '../store/remoteStore'
import { useAppStore } from '../store/appStore'
import { safetyCheckService } from '../../core/safety/SafetyCheckService'
import type { GitRemote } from '../../core/types'

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

  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [load, activeRepo])

  // Compute push safety for the selected remote
  const pushSafetyResult = useMemo(() => {
    if (!repository || !identity || !selectedRemote) return null
    return safetyCheckService.checkPush({
      repository,
      activeProfile,
      identity,
      remotes: [selectedRemote],
      currentBranch: currentBranch ?? undefined,
    })
  }, [repository, identity, activeProfile, selectedRemote, currentBranch])

  const assignedProfile = repository?.assignedProfileId
    ? profiles.find((p) => p.id === repository.assignedProfileId)
    : undefined

  const handleOpenPushSheet = (remote: GitRemote) => {
    clearMessages()
    setSelectedRemote(remote)
    setShowPushSheet(true)
  }

  const handleClosePushSheet = () => {
    setShowPushSheet(false)
    setSelectedRemote(null)
  }

  const handleConfirmPush = async () => {
    if (!selectedRemote || !currentBranch || pushSafetyResult?.canPush === false) return
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
                disabled={!pushSafetyResult?.canPush || pushLoading}
                style={{
                  background: pushSafetyResult?.canPush ? '#3b82f6' : '#333',
                  color: pushSafetyResult?.canPush ? '#fff' : '#555',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '7px 16px',
                  fontSize: '13px',
                  cursor: pushSafetyResult?.canPush ? 'pointer' : 'not-allowed',
                }}
              >
                Confirm Push
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
