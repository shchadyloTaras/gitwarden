import React, { useEffect, useRef, useState } from 'react'
import type {
  Remediation,
  RemediationResult,
  ExecutableAction,
} from '../../core/safety/remediation'
import type { GitErrorCode, GitHubDeviceCode } from '../../core/types'
import { useAppStore, type NavScreen } from '../store/appStore'
import { useProfilesStore } from '../store/profilesStore'
import { STR } from '../strings'

/** A failure surfaced by an executable fix (a thrown GitError, or an in-app refusal). */
export interface RemediationFailure {
  message: string
  code?: GitErrorCode
  remediation?: Remediation
}

interface RemediationButtonProps {
  /** The deterministic remediation (from the core model) this button renders. */
  remediation: Remediation
  /** The repo the fix acts on (required for executable actions). */
  repoPath?: string
  /** The repo's assigned profile id — target of switch / retry-push / reconnect. */
  assignedProfileId?: string
  /** Push target (for switch-profile-and-retry-push). */
  remote?: string
  branch?: string
  /** Override the auto-generated test id. */
  testId?: string
  /** The executable fix completed successfully (e.g. profile switched, push landed). */
  onSuccess?: (result: RemediationResult) => void
  /** The fix threw a (re-diagnosed) GitError, or was refused in-app. */
  onFailure?: (failure: RemediationFailure) => void
}

const PRIMARY_BTN: React.CSSProperties = {
  background: 'var(--gw-primary, #2563eb)',
  color: 'var(--gw-on-solid, #fff)',
  border: 'none',
  borderRadius: '4px',
  padding: '6px 12px',
  fontSize: '14px',
}

const LINK_BTN: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--gw-primary, #60a5fa)',
  border: '1px solid var(--gw-primary, #2563eb)',
  borderRadius: '4px',
  padding: '6px 12px',
  fontSize: '14px',
  cursor: 'pointer',
}

const HINT: React.CSSProperties = {
  marginTop: '4px',
  fontSize: '14px',
  color: 'var(--gw-text-dim, #52525b)',
}

/** How long "Authorized as @…" stays up before onSuccess fires (Phase 103) — long
 * enough for a human to actually read it, short enough not to feel stuck. */
const AUTHORIZED_DISPLAY_MS = 1500

/**
 * Data-driven remediation affordance (Phase 67). Given a `Remediation` from the core
 * model, it renders EITHER a one-click fix button (`kind: 'executable'` → the
 * `remediation:execute` IPC, with a pending state) OR a "Go to …" navigation link
 * (`kind: 'navigate'`). It replaces the bespoke per-issue buttons so every issue's fix
 * is driven by the model, not hand-wired per code. Works with AI disabled.
 */
export default function RemediationButton({
  remediation,
  repoPath,
  assignedProfileId,
  remote,
  branch,
  testId,
  onSuccess,
  onFailure,
}: RemediationButtonProps): React.ReactElement {
  const navigate = useAppStore((s) => s.navigate)
  const profiles = useProfilesStore((s) => s.profiles)
  const activeProfileId = useProfilesStore((s) => s.activeProfileId)
  const reloadProfiles = useProfilesStore((s) => s.load)
  const [pending, setPending] = useState(false)
  const [deviceCode, setDeviceCode] = useState<GitHubDeviceCode | null>(null)
  /** Set once the REAL 'authorized' event lands (Phase 103) — distinct from `deviceCode`
   * merely being issued, which is not success yet. */
  const [authorizedLogin, setAuthorizedLogin] = useState<string | null>(null)

  // Keep the latest callbacks without re-subscribing the auth-event listener below —
  // same pattern ConnectGitHubModal.tsx already uses for the identical problem: the
  // wait for the user to actually authorize can be arbitrarily long (real-world, not
  // just the 1.5s display delay), so a parent re-render mid-wait must not leave this
  // effect calling a stale onSuccess/onFailure/reloadProfiles closure.
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  const onFailureRef = useRef(onFailure)
  onFailureRef.current = onFailure
  const reloadProfilesRef = useRef(reloadProfiles)
  reloadProfilesRef.current = reloadProfiles

  // Phase 103: while this reconnect's device code is showing, wait for the REAL
  // 'authorized' event (or a terminal failure) — never assume success just because a
  // code was issued. Only the profile this remediation targets is watched. Declared
  // before the navigate/executable branch below (rules-of-hooks — every hook must run
  // on every render); reads `remediation.action` directly since the narrowed
  // `ExecutableAction` isn't computed until after that branch.
  useEffect(() => {
    if (remediation.action !== 'reconnect-github' || !deviceCode || !assignedProfileId) return
    let authorizedTimer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = window.api.github.onAuthEvent((event) => {
      if (event.profileId !== assignedProfileId) return
      if (event.status === 'authorized') {
        if (event.identity) setAuthorizedLogin(event.identity.login)
        // Let the user actually SEE "Authorized as @…" before onSuccess can trigger a
        // caller's reload/dismiss (e.g. clearMessages() on the recovery banner, which
        // removes this button from the tree entirely) — otherwise the confirmation
        // never gets a chance to paint. This is the actual fix: the code+confirmation
        // must be readable, not just technically rendered for zero perceivable time.
        authorizedTimer = setTimeout(() => {
          void reloadProfilesRef.current().then(() => onSuccessRef.current?.({ ok: true }))
        }, AUTHORIZED_DISPLAY_MS)
      } else if (
        event.status === 'denied' ||
        event.status === 'expired' ||
        event.status === 'error'
      ) {
        setDeviceCode(null)
        onFailureRef.current?.({ message: STR.RECONNECT_INTERRUPTED_MESSAGE })
      }
    })
    return () => {
      if (authorizedTimer) clearTimeout(authorizedTimer)
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSuccess/onFailure/reloadProfiles are re-subscribed only when the flow itself restarts (remediation.action/deviceCode/assignedProfileId), not on every parent re-render
  }, [remediation.action, deviceCode, assignedProfileId])

  // ── navigate: open the right screen ──────────────────────────────────────────
  if (remediation.kind === 'navigate') {
    const target = remediation.navigateTo ?? 'repositories'
    return (
      <button
        data-testid={testId ?? `remediation-navigate-${remediation.action}`}
        onClick={() => navigate(target as NavScreen)}
        style={LINK_BTN}
      >
        {STR.REMEDIATION_GO_TO(STR.REMEDIATION_NAV_LABEL[target] ?? target)} →
      </button>
    )
  }

  // ── executable: resolve the target profile id + label per action ─────────────
  // kind === 'executable' ⟺ action ∈ EXECUTABLE_ACTIONS (the core model guarantees this),
  // so narrowing to ExecutableAction is sound and makes the switch exhaustive.
  const action = remediation.action as ExecutableAction
  const activeProfile = profiles.find((p) => p.id === activeProfileId)
  const assignedProfile = profiles.find((p) => p.id === assignedProfileId)
  const assignedName = assignedProfile?.displayName ?? STR.REMEDIATION_ASSIGNED_PROFILE_FALLBACK

  let profileId: string | undefined
  let label = ''
  switch (action) {
    case 'set-local-identity':
      // Resolve NAME_MISMATCH/EMAIL_MISMATCH/IDENTITY_UNSET by writing the ACTIVE profile's identity
      // (the safety check compares the repo identity against the active profile).
      profileId = activeProfileId ?? undefined
      label = activeProfile
        ? STR.REMEDIATION_SET_IDENTITY(
            activeProfile.displayName,
            activeProfile.gitAuthorName,
            activeProfile.gitAuthorEmail
          )
        : STR.REMEDIATION_SET_IDENTITY_GENERIC
      break
    case 'switch-active-profile':
      profileId = assignedProfileId
      label = STR.REMEDIATION_SWITCH_PROFILE(assignedName)
      break
    case 'switch-profile-and-retry-push':
      profileId = undefined // the executor pins to the assigned profile
      label = STR.REMEDIATION_SWITCH_AND_PUSH(assignedName)
      break
    case 'reconnect-github':
      profileId = assignedProfileId
      label = STR.REMEDIATION_RECONNECT
      break
    case 'merge-remote-into-local':
      profileId = undefined // purely local; no profile targeting
      label =
        remote && branch
          ? STR.REMEDIATION_MERGE_REMOTE(remote, branch)
          : STR.REMEDIATION_MERGE_REMOTE_GENERIC
      break
  }

  // Defensive: disable when the action's required target is missing.
  const missingTarget =
    !repoPath ||
    (remediation.action === 'set-local-identity' && !activeProfile) ||
    (remediation.action === 'switch-active-profile' && !assignedProfileId) ||
    (remediation.action === 'reconnect-github' && !assignedProfileId) ||
    (remediation.action === 'merge-remote-into-local' && (!remote || !branch))

  const run = async () => {
    if (pending || missingTarget || !repoPath) return
    setPending(true)
    setDeviceCode(null)
    setAuthorizedLogin(null)
    try {
      const res = await window.api.remediation.execute({
        action,
        repoPath,
        profileId,
        remote,
        branch,
      })
      // Keep the renderer's active-profile state in sync with any settings change the
      // executor made (e.g. switch-active-profile / switch-profile-and-retry-push).
      await reloadProfiles()
      if (!res.ok) {
        // The action threw a GitError (e.g. the retry-push was rejected again) — the
        // envelope carries a fresh code + remediation for re-diagnosis.
        onFailure?.({ message: res.error, code: res.code, remediation: res.remediation })
        return
      }
      const result = res.data
      if (result.deviceCode) {
        // Phase 103: getting a device code is NOT success yet — the user still has to
        // enter it on GitHub. Show it and WAIT for the real 'authorized' event (below)
        // before calling onSuccess, so a caller's reload/dismiss can never unmount this
        // hint before the user has had a chance to use the code.
        setDeviceCode(result.deviceCode)
        return
      }
      if (result.ok) {
        onSuccess?.(result)
      } else {
        // In-app refusal (e.g. retry-push on an unassigned repo → assign first).
        onFailure?.({ message: result.message ?? '', remediation: result.remediation })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <button
        data-testid={testId ?? `remediation-executable-${remediation.action}`}
        onClick={run}
        disabled={pending || missingTarget}
        style={{
          ...PRIMARY_BTN,
          cursor: pending ? 'wait' : missingTarget ? 'not-allowed' : 'pointer',
          opacity: missingTarget ? 0.6 : 1,
        }}
      >
        {pending ? STR.REMEDIATION_FIXING : label}
      </button>
      {remediation.action === 'set-local-identity' && (
        <div style={HINT}>{STR.REMEDIATION_LOCAL_ONLY_HINT}</div>
      )}
      {remediation.action === 'merge-remote-into-local' && (
        <div style={HINT}>{STR.REMEDIATION_MERGE_LOCAL_ONLY_HINT}</div>
      )}
      {deviceCode && !authorizedLogin && (
        <div data-testid="remediation-device-code" style={HINT}>
          {STR.REMEDIATION_DEVICE_CODE(deviceCode.userCode, deviceCode.verificationUri)}
        </div>
      )}
      {authorizedLogin && (
        <div
          data-testid="remediation-device-code-authorized"
          style={{ ...HINT, color: 'var(--gw-success, #4ade80)' }}
        >
          {STR.REMEDIATION_AUTHORIZED_AS(authorizedLogin)}
        </div>
      )}
    </div>
  )
}
