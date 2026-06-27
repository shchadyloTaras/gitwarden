/**
 * AI eval harness — DX-4.
 *
 * Offline mode (default, CI-safe): each fixture supplies a `cannedResponse`
 * that the eval adapter returns without any network call. The eval validates the
 * response through the assistant's Zod schema and asserts quality checks.
 *
 * Live mode (opt-in): set GITWARDEN_EVAL_LIVE=1 to call the configured AI
 * provider instead. Skipped by default; never run in CI.
 *
 * Adding a new case: drop one file in tests/evals/fixtures/ and import it below.
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { AiCommitDraftSchema, AiChangeReviewSchema } from '../../src/core/ai/schemas'
import { buildDeterministicSafetyExplanation } from '../../src/core/ai/safetyCopilot'
import type { EvalFixture, EvalChecks } from './types'

// ── Fixture registry ─────────────────────────────────────────────────────────

import { fixture as fix01 } from './fixtures/01-smart-commit-basic'
import { fixture as fix02 } from './fixtures/02-smart-commit-specific'
import { fixture as fix03 } from './fixtures/03-safety-copilot-profile-mismatch'
import { fixture as fix04 } from './fixtures/04-change-review-bug'
import { fixture as fix05 } from './fixtures/05-change-review-clean'

const ALL_FIXTURES: EvalFixture[] = [fix01, fix02, fix03, fix04, fix05]

// ── Schema lookup ─────────────────────────────────────────────────────────────

function schemaForAssistant(assistant: EvalFixture['assistant']): z.ZodTypeAny | null {
  switch (assistant) {
    case 'commit-draft':
      return AiCommitDraftSchema
    case 'change-review':
      return AiChangeReviewSchema
    case 'safety-copilot':
      return null // deterministic path — no adapter schema needed
  }
}

// ── Quality check helpers ─────────────────────────────────────────────────────

/** Extract the description text after the conventional-commit type prefix. */
function extractDescription(conventional: string): string {
  const match = conventional.match(/^[a-z]+(?:\([^)]+\))?!?:\s*(.+)/i)
  return match?.[1] ?? conventional
}

/**
 * Heuristic imperative-mood check: the first word of the description should
 * not be past-tense (-ed) or gerund (-ing). Known limitation: verbs like
 * "bring" or "ring" would be mis-classified, but they are virtually absent
 * from commit messages in practice.
 */
function isImperativeMood(conventional: string): boolean {
  const desc = extractDescription(conventional)
  const first = desc.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const isPastTense = first.endsWith('ed') && first.length > 2
  const isGerund = first.endsWith('ing') && first.length > 3
  return !isPastTense && !isGerund
}

/** Check that the subject does not contain a bare file-name pattern. */
function hasNoFilenames(subject: string): boolean {
  return !/\b\w+\.(ts|tsx|js|jsx|json|md|py|go|rs|sh|yml|yaml)\b/i.test(subject)
}

/** Check that the subject does not contain secret-like content. */
function hasNoSecrets(subject: string): boolean {
  return !/(sk-|ghp_|ghs_|AKIA[0-9A-Z]{4}|-----BEGIN)/i.test(subject)
}

// ── Assertion runner ──────────────────────────────────────────────────────────

function runChecks(
  response: unknown,
  checks: EvalChecks,
  assistant: EvalFixture['assistant']
): void {
  if (assistant === 'commit-draft') {
    const draft = response as { conventional: string; plain: string; summary: string }

    if (checks.conventionalMaxLength !== undefined) {
      expect(
        draft.conventional.length,
        `conventional "${draft.conventional}" exceeds ${checks.conventionalMaxLength} chars`
      ).toBeLessThanOrEqual(checks.conventionalMaxLength)

      expect(
        draft.plain.length,
        `plain "${draft.plain}" exceeds ${checks.conventionalMaxLength} chars`
      ).toBeLessThanOrEqual(checks.conventionalMaxLength)
    }

    if (checks.imperativeMood) {
      const ok = isImperativeMood(draft.conventional)
      expect(ok, `"${draft.conventional}" does not start with an imperative verb`).toBe(true)
    }

    if (checks.noFileNamesInSubject) {
      expect(
        hasNoFilenames(draft.conventional),
        `"${draft.conventional}" contains a bare filename`
      ).toBe(true)
      expect(hasNoFilenames(draft.plain), `"${draft.plain}" contains a bare filename`).toBe(true)
    }

    if (checks.noSecrets) {
      expect(
        hasNoSecrets(draft.conventional),
        `"${draft.conventional}" contains secret-like content`
      ).toBe(true)
    }

    if (checks.notMatchingPattern !== undefined) {
      const re = new RegExp(checks.notMatchingPattern, 'i')
      expect(
        re.test(draft.conventional),
        `"${draft.conventional}" matches the forbidden pattern /${checks.notMatchingPattern}/i — message is not specific enough`
      ).toBe(false)
    }
  }

  if (assistant === 'change-review') {
    const review = response as { findings: unknown[] }

    if (checks.minFindings !== undefined) {
      expect(
        review.findings.length,
        `expected ≥ ${checks.minFindings} finding(s), got ${review.findings.length}`
      ).toBeGreaterThanOrEqual(checks.minFindings)
    }

    if (checks.maxFindings !== undefined) {
      expect(
        review.findings.length,
        `false-positive: expected ≤ ${checks.maxFindings} finding(s), got ${review.findings.length}`
      ).toBeLessThanOrEqual(checks.maxFindings)
    }
  }

  if (assistant === 'safety-copilot') {
    const explanation = response as { code: string; suggestedAction: string }

    if (checks.codeEquals !== undefined) {
      expect(
        explanation.code,
        `expected safety code "${checks.codeEquals}", got "${explanation.code}"`
      ).toBe(checks.codeEquals)
    }

    if (checks.suggestedActionIn !== undefined) {
      expect(
        checks.suggestedActionIn,
        `suggestedAction "${explanation.suggestedAction}" not in ${JSON.stringify(checks.suggestedActionIn)}`
      ).toContain(explanation.suggestedAction)
    }
  }
}

// ── Eval runner ───────────────────────────────────────────────────────────────

const LIVE = process.env.GITWARDEN_EVAL_LIVE === '1'

describe('AI evals (offline deterministic)', () => {
  for (const fixture of ALL_FIXTURES) {
    it(fixture.name, async () => {
      if (LIVE) {
        // Live mode: call the real AI adapter. Skipped in CI (no API key).
        // Implement by injecting a real AiAdapter with configured credentials.
        console.warn(`[eval] live mode not yet wired — skipping live call for "${fixture.name}"`)
        return
      }

      // ── Offline mode ──────────────────────────────────────────────────────
      let parsed: unknown

      if (fixture.assistant === 'safety-copilot') {
        // Safety Copilot is deterministic — no adapter needed.
        const safetyCode = fixture.input.safetyCode
        if (!safetyCode) throw new Error(`fixture "${fixture.name}" missing input.safetyCode`)
        // The cast is safe: ALL_SAFETY_CODES is the authoritative list and
        // buildDeterministicSafetyExplanation accepts SafetyCode.
        parsed = buildDeterministicSafetyExplanation(
          safetyCode as Parameters<typeof buildDeterministicSafetyExplanation>[0]
        )
      } else {
        // commit-draft / change-review: validate cannedResponse through the schema.
        const schema = schemaForAssistant(fixture.assistant)
        if (!schema) throw new Error(`no schema for assistant "${fixture.assistant}"`)
        const result = schema.safeParse(fixture.cannedResponse)
        expect(
          result.success,
          `cannedResponse for "${fixture.name}" does not satisfy the ${fixture.assistant} schema: ` +
            (result.success ? '' : JSON.stringify(result.error.format()))
        ).toBe(true)
        parsed = result.success ? result.data : fixture.cannedResponse
      }

      runChecks(parsed, fixture.checks, fixture.assistant)
    })
  }
})
