// Safety Copilot — deterministic explanations and suggested actions (Phase 34).
// Pure core: works with AI disabled. AI may enhance the explanation text only.

import type { SafetyCode } from '../safety/SafetyCheckService.js'
import type { SafetyIssue } from '../types.js'
import {
  SAFETY_ACTION_BY_CODE,
  actionHintFor,
  explainSafetyIssue,
} from './safetyCopilotMessages.js'
import type { AiSafetyExplanation } from './types.js'

/** Every SafetyCode the engine can emit — used for IPC validation and tests. */
export const ALL_SAFETY_CODES = [
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
  'STAGED_SECRET_DETECTED',
] as const satisfies readonly SafetyCode[]

export function suggestedActionFor(code: SafetyCode) {
  return SAFETY_ACTION_BY_CODE[code]
}

/**
 * Bare `/explain` (no argument) overview: explain every CURRENTLY active safety issue
 * for the repo deterministically — no AI send, works offline. Blockers are listed
 * before warnings and codes are deduped (the same code can surface in both the identity
 * and push checks). `/explain <CODE>` still gives the AI-enhanced deep dive on one issue.
 */
export function buildActiveSafetyIssuesExplanation(issues: SafetyIssue[]): string {
  const seen = new Set<string>()
  const unique = issues.filter((issue) => {
    if (seen.has(issue.code)) return false
    seen.add(issue.code)
    return true
  })
  if (unique.length === 0) {
    return 'No active safety issues for this repository right now. Pass a code (e.g. /explain IDENTITY_UNSET) or paste failing tool/build output after /explain.'
  }
  // Stable sort keeps engine order within a severity; blockers float to the top.
  const ordered = [...unique].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'blocker' ? -1 : 1
  )
  const sections = ordered.map((issue) => {
    const explanation = buildDeterministicSafetyExplanation(issue.code as SafetyCode)
    return `${issue.code}\n${explanation.explanation}\n\nSuggested: ${explanation.actionHint}`
  })
  return `${sections.join('\n\n')}\n\nTip: run /explain <CODE> for an AI-enhanced explanation of a single issue.`
}

/** Deterministic explanation — always available, even with AI disabled. */
export function buildDeterministicSafetyExplanation(code: SafetyCode): AiSafetyExplanation {
  return {
    code,
    explanation: explainSafetyIssue(code),
    suggestedAction: SAFETY_ACTION_BY_CODE[code],
    actionHint: actionHintFor(code),
    source: 'deterministic',
  }
}

/**
 * Merge AI-enhanced explanation text. The suggested action always stays
 * deterministic — the model cannot redirect the user to a non-allowlisted control.
 */
export function mergeSafetyExplanation(
  deterministic: AiSafetyExplanation,
  aiExplanation?: string
): AiSafetyExplanation {
  const trimmed = aiExplanation?.trim()
  if (!trimmed) return deterministic
  return {
    ...deterministic,
    explanation: trimmed,
    source: 'ai',
  }
}
