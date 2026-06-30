import { describe, it, expect } from 'vitest'
import {
  remediationForSafetyCode,
  remediationForGitError,
  EXECUTABLE_ACTIONS,
  type NavTarget,
  type RemediableGitErrorCode,
} from '../../src/core/safety/remediation.js'
import { SAFETY_ACTION_BY_CODE } from '../../src/core/ai/safetyCopilotMessages.js'
import type { SafetyCode } from '../../src/core/safety/SafetyCheckService.js'
import type { SafetySuggestedAction } from '../../src/core/ai/types.js'

// The authoritative, total list of safety codes: SAFETY_ACTION_BY_CODE is a
// Record<SafetyCode, …>, so its keys ARE every SafetyCode the engine can emit.
const ALL_SAFETY_CODES = Object.keys(SAFETY_ACTION_BY_CODE) as SafetyCode[]
const NAV_TARGETS: NavTarget[] = [
  'repositories',
  'commit',
  'status',
  'remote',
  'branches',
  'profiles',
]

describe('remediationForSafetyCode', () => {
  it('yields a Remediation for EVERY SafetyCode with no default gap', () => {
    expect(ALL_SAFETY_CODES.length).toBeGreaterThan(0)
    for (const code of ALL_SAFETY_CODES) {
      const r = remediationForSafetyCode(code)
      // Derived from the existing map, not a forked code→action table.
      expect(r.action).toBe(SAFETY_ACTION_BY_CODE[code])
      expect(['executable', 'navigate']).toContain(r.kind)
    }
  })

  it('marks a remediation executable IFF its action is in EXECUTABLE_ACTIONS', () => {
    for (const code of ALL_SAFETY_CODES) {
      const r = remediationForSafetyCode(code)
      expect(r.kind === 'executable').toBe(EXECUTABLE_ACTIONS.has(r.action))
    }
  })

  it('gives every navigate remediation a valid navigateTo, and none to executables', () => {
    for (const code of ALL_SAFETY_CODES) {
      const r = remediationForSafetyCode(code)
      if (r.kind === 'navigate') {
        expect(r.navigateTo).toBeDefined()
        expect(NAV_TARGETS).toContain(r.navigateTo)
      } else {
        expect(r.navigateTo).toBeUndefined()
      }
    }
  })

  it('matches the decided executable/navigate table for representative codes', () => {
    // Executable, in-app, no navigation.
    expect(remediationForSafetyCode('IDENTITY_UNSET')).toEqual({
      action: 'set-local-identity',
      kind: 'executable',
    })
    expect(remediationForSafetyCode('PROFILE_MISMATCH')).toEqual({
      action: 'switch-active-profile',
      kind: 'executable',
    })
    expect(remediationForSafetyCode('GITHUB_TOKEN_INVALID')).toEqual({
      action: 'reconnect-github',
      kind: 'executable',
    })
    // Navigate, each to its decided screen.
    expect(remediationForSafetyCode('REPO_UNASSIGNED')).toEqual({
      action: 'assign-repo-profile',
      kind: 'navigate',
      navigateTo: 'repositories',
    })
    expect(remediationForSafetyCode('HAS_CONFLICTS')).toEqual({
      action: 'resolve-conflicts',
      kind: 'navigate',
      navigateTo: 'status',
    })
    expect(remediationForSafetyCode('NO_REMOTE')).toEqual({
      action: 'configure-remote',
      kind: 'navigate',
      navigateTo: 'remote',
    })
    expect(remediationForSafetyCode('PROTECTED_BRANCH_PUSH')).toEqual({
      action: 'switch-branch',
      kind: 'navigate',
      navigateTo: 'branches',
    })
    expect(remediationForSafetyCode('PUSH_POLICY_INCOMPLETE')).toEqual({
      action: 'edit-push-policy',
      kind: 'navigate',
      navigateTo: 'repositories',
    })
  })
})

describe('remediationForGitError', () => {
  it('wrong-account push → executable switch-profile-and-retry-push', () => {
    expect(remediationForGitError('pushRejectedWrongAccount')).toEqual({
      action: 'switch-profile-and-retry-push',
      kind: 'executable',
    })
  })

  it('authentication failure (token rejected/expired) → executable reconnect-github', () => {
    expect(remediationForGitError('authenticationFailed')).toEqual({
      action: 'reconnect-github',
      kind: 'executable',
    })
  })

  it('dubious ownership (moved repo folder) → navigate/explain-only → repositories', () => {
    const r = remediationForGitError('dubiousOwnership')
    expect(r.kind).toBe('navigate')
    expect(r.navigateTo).toBe('repositories')
  })

  it('maps every RemediableGitErrorCode to a Remediation', () => {
    const codes: RemediableGitErrorCode[] = [
      'pushRejectedWrongAccount',
      'authenticationFailed',
      'dubiousOwnership',
    ]
    for (const c of codes) {
      const r = remediationForGitError(c)
      expect(['executable', 'navigate']).toContain(r.kind)
      if (r.kind === 'navigate') expect(NAV_TARGETS).toContain(r.navigateTo)
    }
  })
})

describe('EXECUTABLE_ACTIONS', () => {
  it('contains exactly the four in-app fixes', () => {
    const expected: SafetySuggestedAction[] = [
      'set-local-identity',
      'switch-active-profile',
      'reconnect-github',
      'switch-profile-and-retry-push',
    ]
    expect(EXECUTABLE_ACTIONS.size).toBe(expected.length)
    for (const a of expected) expect(EXECUTABLE_ACTIONS.has(a)).toBe(true)
  })

  it("includes 'switch-profile-and-retry-push'", () => {
    expect(EXECUTABLE_ACTIONS.has('switch-profile-and-retry-push')).toBe(true)
  })
})
