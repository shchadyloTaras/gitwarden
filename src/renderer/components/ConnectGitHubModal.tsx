import React, { useEffect, useRef, useState } from 'react'
import type { GitHubAccount, GitHubAuthErrorCode, GitHubDeviceCode } from '../../core/types'
import { STR } from '../strings'

type Status = 'starting' | 'awaitingUser' | 'authorized' | 'denied' | 'expired' | 'error'

interface ConnectGitHubModalProps {
  profileId: string
  /** The @login once authorized — drives the success message. */
  onAuthorized: (identity: GitHubAccount) => void | Promise<void>
  onClose: () => void
}

/**
 * Drives the OAuth Device Flow from the renderer (Phase 26). Subscribes to the
 * `github:authEvent` push channel, kicks off `startDeviceAuth` (which also opens the
 * browser in main), shows the user code + live status, and hands the resolved identity
 * back to the screen for auto-fill on success. Cancels the in-flight flow on Cancel or
 * unmount so no orphaned poll keeps running in main.
 */
export default function ConnectGitHubModal({
  profileId,
  onAuthorized,
  onClose,
}: ConnectGitHubModalProps): React.ReactElement {
  const [status, setStatus] = useState<Status>('starting')
  const [errorCode, setErrorCode] = useState<GitHubAuthErrorCode | undefined>(undefined)
  const [deviceCode, setDeviceCode] = useState<GitHubDeviceCode | null>(null)
  const [authorizedLogin, setAuthorizedLogin] = useState<string | null>(null)
  // Keep the latest callback without re-subscribing the event listener.
  const onAuthorizedRef = useRef(onAuthorized)
  onAuthorizedRef.current = onAuthorized

  // Subscribe + start the flow once per mount; retry re-runs it via `attempt`.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('starting')
    setErrorCode(undefined)
    setDeviceCode(null)

    const unsubscribe = window.api.github.onAuthEvent((event) => {
      if (cancelled || event.profileId !== profileId) return
      switch (event.status) {
        case 'awaitingUser':
          setStatus('awaitingUser')
          break
        case 'authorized':
          setStatus('authorized')
          if (event.identity) {
            setAuthorizedLogin(event.identity.login)
            void onAuthorizedRef.current(event.identity)
          }
          break
        case 'denied':
          setStatus('denied')
          break
        case 'expired':
          setStatus('expired')
          break
        case 'error':
          setStatus('error')
          setErrorCode(event.errorCode)
          break
        default:
          break
      }
    })

    void (async () => {
      const res = await window.api.github.startDeviceAuth(profileId)
      if (cancelled) return
      if (res.ok) {
        setDeviceCode(res.data)
        setStatus((s) => (s === 'starting' ? 'awaitingUser' : s))
      } else {
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [profileId, attempt])

  // Cancel any still-pending flow when the modal closes without authorizing.
  const statusRef = useRef(status)
  statusRef.current = status
  useEffect(() => {
    return () => {
      if (statusRef.current !== 'authorized') {
        void window.api.github.cancelDeviceAuth(profileId)
      }
    }
  }, [profileId])

  function handleOpenGitHub(): void {
    if (deviceCode) void window.api.shell.openExternal(deviceCode.verificationUri)
  }

  function handleCancel(): void {
    void window.api.github.cancelDeviceAuth(profileId)
    onClose()
  }

  function handleRetry(): void {
    setAttempt((a) => a + 1)
  }

  const isTerminalFailure = status === 'denied' || status === 'expired' || status === 'error'
  const isReauth = status === 'error' && errorCode === 'tokenInvalid'

  return (
    <div
      data-testid="github-connect-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="github-connect-title"
      style={overlayStyle}
      onClick={status === 'authorized' ? onClose : handleCancel}
    >
      <section
        data-testid="github-connect-modal"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="github-connect-title" style={titleStyle}>
          {status === 'authorized' ? STR.GITHUB_MODAL_SUCCESS_TITLE : STR.GITHUB_MODAL_TITLE}
        </h2>

        {status === 'starting' && (
          <p data-testid="github-connect-status" style={bodyStyle}>
            {STR.GITHUB_MODAL_STARTING}
          </p>
        )}

        {status === 'awaitingUser' && deviceCode && (
          <div data-testid="github-connect-status">
            <p style={bodyStyle}>{STR.GITHUB_MODAL_ENTER_CODE}</p>
            <div data-testid="github-connect-user-code" style={codeStyle}>
              {deviceCode.userCode}
            </div>
            <p style={{ ...bodyStyle, marginTop: 12 }}>{STR.GITHUB_MODAL_WAITING}</p>
          </div>
        )}

        {status === 'authorized' && (
          <p
            data-testid="github-connect-success"
            style={{ ...bodyStyle, color: 'var(--gw-success, #4ade80)' }}
          >
            {STR.GITHUB_MODAL_SUCCESS(authorizedLogin ?? '')}
          </p>
        )}

        {isTerminalFailure && (
          <p
            data-testid="github-connect-error"
            style={{ ...bodyStyle, color: 'var(--gw-danger, #f87171)' }}
          >
            {isReauth
              ? STR.GITHUB_MODAL_REAUTH
              : status === 'denied'
                ? STR.GITHUB_MODAL_DENIED
                : status === 'expired'
                  ? STR.GITHUB_MODAL_EXPIRED
                  : STR.GITHUB_MODAL_ERROR}
          </p>
        )}

        <div style={actionsStyle}>
          {(status === 'starting' || status === 'awaitingUser') && (
            <>
              <button
                type="button"
                data-testid="github-connect-cancel"
                onClick={handleCancel}
                style={secondaryBtn}
              >
                {STR.GITHUB_MODAL_CANCEL_BTN}
              </button>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                data-testid="github-connect-open"
                onClick={handleOpenGitHub}
                disabled={!deviceCode}
                style={primaryBtn}
              >
                {STR.GITHUB_MODAL_OPEN_BTN}
              </button>
            </>
          )}

          {isTerminalFailure && (
            <>
              <button
                type="button"
                data-testid="github-connect-close"
                onClick={onClose}
                style={secondaryBtn}
              >
                {STR.GITHUB_MODAL_CLOSE_BTN}
              </button>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                data-testid="github-connect-retry"
                onClick={handleRetry}
                style={primaryBtn}
              >
                {STR.GITHUB_MODAL_RETRY_BTN}
              </button>
            </>
          )}

          {status === 'authorized' && (
            <>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                data-testid="github-connect-done"
                onClick={onClose}
                style={primaryBtn}
              >
                {STR.GITHUB_MODAL_CLOSE_BTN}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  background: 'rgba(3, 7, 18, 0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const cardStyle: React.CSSProperties = {
  width: 380,
  maxWidth: 'calc(100vw - 32px)',
  background: 'var(--gw-surface, #18181b)',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 8,
  boxShadow: '0 22px 70px rgba(0, 0, 0, 0.38)',
  color: 'var(--gw-text, #f4f4f5)',
  padding: 22,
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 18,
  lineHeight: 1.25,
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--gw-text-muted, #a1a1aa)',
  fontSize: 13,
  lineHeight: 1.55,
}

const codeStyle: React.CSSProperties = {
  margin: '12px 0 0',
  padding: '12px 0',
  textAlign: 'center',
  fontFamily: 'monospace',
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '0.12em',
  color: 'var(--gw-text, #f4f4f5)',
  background: 'var(--gw-surface2, #27272a)',
  borderRadius: 6,
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 20,
}

const primaryBtn: React.CSSProperties = {
  padding: '6px 16px',
  background: 'var(--gw-accent, #6366f1)',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
}

const secondaryBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'none',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
  fontSize: 12,
}
