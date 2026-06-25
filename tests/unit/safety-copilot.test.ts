import { describe, it, expect } from 'vitest'
import {
  ALL_SAFETY_CODES,
  buildDeterministicSafetyExplanation,
  mergeSafetyExplanation,
  suggestedActionFor,
} from '../../src/core/ai/safetyCopilot'
import { explainSafetyIssue, SAFETY_ACTION_BY_CODE } from '../../src/core/ai/safetyCopilotMessages'
import type { SafetyCode } from '../../src/core/safety/SafetyCheckService'
import { SAFETY_MESSAGES } from '../../src/core/safety/safetyMessages'

describe('Safety Copilot', () => {
  it('has deterministic explanation copy for every SafetyCode', () => {
    for (const code of ALL_SAFETY_CODES) {
      const explanation = buildDeterministicSafetyExplanation(code)
      expect(explanation.code).toBe(code)
      expect(explanation.explanation.trim().length, code).toBeGreaterThan(20)
      expect(explanation.actionHint.trim().length, code).toBeGreaterThan(20)
      expect(explanation.source).toBe('deterministic')
      expect(explainSafetyIssue(code)).toBe(explanation.explanation)
    }
  })

  it('maps every SafetyCode to an allowlisted suggested action', () => {
    for (const code of ALL_SAFETY_CODES) {
      const action = suggestedActionFor(code)
      expect(SAFETY_ACTION_BY_CODE[code]).toBe(action)
      expect(action).toMatch(
        /^(set-local-identity|switch-active-profile|assign-repo-profile|reconnect-github|stage-changes|write-commit-message|resolve-conflicts|configure-remote|review-staged-changes)$/
      )
    }
  })

  it('covers the Phase 34 SafetyCode union from the plan', () => {
    const phase34Codes: SafetyCode[] = [
      'NO_ACTIVE_PROFILE',
      'REPO_UNASSIGNED',
      'PROFILE_MISMATCH',
      'IDENTITY_UNSET',
      'EMAIL_MISMATCH',
      'EMAIL_FROM_GLOBAL_ONLY',
      'NOTHING_STAGED',
      'EMPTY_MESSAGE',
      'HAS_CONFLICTS',
      'NO_REMOTE',
      'REMOTE_HOST_MISMATCH',
      'GITHUB_ACCOUNT_MISMATCH',
      'GITHUB_TOKEN_MISSING',
      'GITHUB_TOKEN_INVALID',
      'GITHUB_NOT_CONNECTED',
    ]
    for (const code of phase34Codes) {
      expect(ALL_SAFETY_CODES).toContain(code)
      expect(buildDeterministicSafetyExplanation(code).explanation).not.toBe(SAFETY_MESSAGES[code])
    }
  })

  it('keeps deterministic suggested action when merging AI text', () => {
    const deterministic = buildDeterministicSafetyExplanation('PROFILE_MISMATCH')
    const merged = mergeSafetyExplanation(deterministic, 'Switch profiles before you commit.')
    expect(merged.source).toBe('ai')
    expect(merged.explanation).toBe('Switch profiles before you commit.')
    expect(merged.suggestedAction).toBe('switch-active-profile')
    expect(merged.actionHint).toBe(deterministic.actionHint)
  })

  it('ignores blank AI explanation', () => {
    const deterministic = buildDeterministicSafetyExplanation('IDENTITY_UNSET')
    expect(mergeSafetyExplanation(deterministic, '   ')).toEqual(deterministic)
  })
})
