import React, { useState } from 'react'
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
      // Resolve EMAIL_MISMATCH/IDENTITY_UNSET by writing the ACTIVE profile's identity
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
  }

  // Defensive: disable when the action's required target is missing.
  const missingTarget =
    !repoPath ||
    (remediation.action === 'set-local-identity' && !activeProfile) ||
    (remediation.action === 'switch-active-profile' && !assignedProfileId) ||
    (remediation.action === 'reconnect-github' && !assignedProfileId)

  const run = async () => {
    if (pending || missingTarget || !repoPath) return
    setPending(true)
    setDeviceCode(null)
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
      if (result.deviceCode) setDeviceCode(result.deviceCode)
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
      {deviceCode && (
        <div data-testid="remediation-device-code" style={HINT}>
          {STR.REMEDIATION_DEVICE_CODE(deviceCode.userCode, deviceCode.verificationUri)}
        </div>
      )}
    </div>
  )
}
