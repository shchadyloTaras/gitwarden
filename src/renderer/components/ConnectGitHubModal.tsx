import React, { useEffect, useRef, useState } from 'react'
import type { GitHubAccount, GitHubAuthErrorCode, GitHubDeviceCode } from '../../core/types'
import { STR } from '../strings'
import { useDialogFocus } from '../hooks/useDialogFocus'

type Status = 'starting' | 'awaitingUser' | 'authorized' | 'denied' | 'expired' | 'error'

/** Ignore extra focus/visibility events within this window of the last trigger. */
const RETURN_CHECK_DEBOUNCE_MS = 1000
/** How long "Checking…" stays up before settling back to "Waiting…" if no event arrives. */
const CHECKING_FALLBACK_MS = 2000

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
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const modalRef = useRef<HTMLElement>(null)
  const cancelActionRef = useRef<HTMLButtonElement>(null)
  const terminalActionRef = useRef<HTMLButtonElement>(null)
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
      // Any progress clears a "Checking…" spinner started by a return-focus poke.
      if (checkingTimeoutRef.current) clearTimeout(checkingTimeoutRef.current)
      setChecking(false)
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

  // Clear any pending "Copied!" reset timer when the modal unmounts.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  // The instant the window regains focus (or the tab becomes visible) while we're still
  // waiting on the user, ask main for one immediate bypass poll and show an active
  // "Checking…" state — instead of leaving the static "Waiting…" line up for however long
  // is left of the current poll interval. Debounced so a burst of focus/visibility events
  // (e.g. alt-tabbing around) triggers at most one poke.
  useEffect(() => {
    let debounced = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    function triggerReturnCheck(): void {
      if (debounced) return
      debounced = true
      debounceTimer = setTimeout(() => {
        debounced = false
      }, RETURN_CHECK_DEBOUNCE_MS)

      if (statusRef.current !== 'awaitingUser') return
      setChecking(true)
      void window.api.github.refreshDeviceAuth(profileId)
      if (checkingTimeoutRef.current) clearTimeout(checkingTimeoutRef.current)
      checkingTimeoutRef.current = setTimeout(() => setChecking(false), CHECKING_FALLBACK_MS)
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') triggerReturnCheck()
    }

    window.addEventListener('focus', triggerReturnCheck)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', triggerReturnCheck)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (debounceTimer) clearTimeout(debounceTimer)
      if (checkingTimeoutRef.current) clearTimeout(checkingTimeoutRef.current)
    }
  }, [profileId])

  function handleOpenGitHub(): void {
    if (deviceCode) void window.api.shell.openExternal(deviceCode.verificationUri)
  }

  async function handleCopyCode(): Promise<void> {
    if (!deviceCode) return
    try {
      await navigator.clipboard.writeText(deviceCode.userCode)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard write can reject if the document isn't focused; fail silently.
    }
  }

  function handleCancel(): void {
    void window.api.github.cancelDeviceAuth(profileId)
    onClose()
  }

  function handleRetry(): void {
    setAttempt((a) => a + 1)
  }

  useDialogFocus(true, modalRef, status === 'authorized' ? onClose : handleCancel, cancelActionRef)

  const isTerminalFailure = status === 'denied' || status === 'expired' || status === 'error'
  const isReauth = status === 'error' && errorCode === 'tokenInvalid'
  const terminalErrorText = isReauth
    ? STR.GITHUB_MODAL_REAUTH
    : status === 'denied'
      ? STR.GITHUB_MODAL_DENIED
      : status === 'expired'
        ? STR.GITHUB_MODAL_EXPIRED
        : STR.GITHUB_MODAL_ERROR
  const liveStatusText =
    status === 'starting'
      ? STR.GITHUB_MODAL_STARTING
      : status === 'awaitingUser'
        ? checking
          ? STR.GITHUB_MODAL_CHECKING
          : STR.GITHUB_MODAL_WAITING
        : status === 'authorized'
          ? STR.GITHUB_MODAL_SUCCESS(authorizedLogin ?? '')
          : terminalErrorText

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (status === 'authorized' || isTerminalFailure) terminalActionRef.current?.focus()
      else cancelActionRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isTerminalFailure, status])

  return (
    <div
      data-testid="github-connect-overlay"
      className="gw-dialog-backdrop"
      style={overlayStyle}
      onClick={status === 'authorized' ? onClose : handleCancel}
    >
      <section
        ref={modalRef}
        data-testid="github-connect-modal"
        className="gw-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-connect-title"
        tabIndex={-1}
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="github-connect-title" style={titleStyle}>
          {status === 'authorized' ? STR.GITHUB_MODAL_SUCCESS_TITLE : STR.GITHUB_MODAL_TITLE}
        </h2>

        <p className="gw-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {liveStatusText}
        </p>

        {status === 'starting' && (
          <p data-testid="github-connect-status" style={bodyStyle}>
            {STR.GITHUB_MODAL_STARTING}
          </p>
        )}

        {status === 'awaitingUser' && deviceCode && (
          <div data-testid="github-connect-status">
            <p style={bodyStyle}>{STR.GITHUB_MODAL_ENTER_CODE}</p>
            <div style={codeRowStyle}>
              <div data-testid="github-connect-user-code" style={codeStyle}>
                {deviceCode.userCode}
              </div>
              <button
                type="button"
                data-testid="github-connect-copy"
                onClick={handleCopyCode}
                aria-label={STR.GITHUB_MODAL_COPY_CODE_LABEL}
                style={copyBtn}
              >
                {copied ? STR.GITHUB_MODAL_COPIED : STR.GITHUB_MODAL_COPY_BTN}
              </button>
            </div>
            <p
              data-testid="github-connect-waiting-line"
              className="gw-github-connect__status-line"
              style={{ ...bodyStyle, marginTop: 12 }}
            >
              {checking && (
                <span
                  data-testid="github-connect-loader"
                  className="gw-github-connect__loader"
                  aria-hidden="true"
                />
              )}
              <span>{checking ? STR.GITHUB_MODAL_CHECKING : STR.GITHUB_MODAL_WAITING}</span>
            </p>
            <p style={hintStyle}>{STR.GITHUB_MODAL_NO_ACCOUNT_HINT}</p>
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
            {terminalErrorText}
          </p>
        )}

        <div style={actionsStyle}>
          {(status === 'starting' || status === 'awaitingUser') && (
            <>
              <button
                ref={cancelActionRef}
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
                ref={terminalActionRef}
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
                ref={terminalActionRef}
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
  background: 'var(--gw-overlay)',
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
  boxShadow: '0 22px 70px var(--gw-shadow)',
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
  fontSize: 14,
  lineHeight: 1.55,
}

const hintStyle: React.CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--gw-text-dim, #52525b)',
  fontSize: 12,
  lineHeight: 1.5,
}

const codeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 8,
  marginTop: 12,
}

const codeStyle: React.CSSProperties = {
  flex: 1,
  margin: 0,
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

const copyBtn: React.CSSProperties = {
  flexShrink: 0,
  padding: '0 16px',
  background: 'var(--gw-surface2, #27272a)',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 6,
  color: 'var(--gw-text, #f4f4f5)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
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
  color: 'var(--gw-on-solid, #fff)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
}

const secondaryBtn: React.CSSProperties = {
  padding: '6px 14px',
  background: 'none',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
  fontSize: 14,
}
