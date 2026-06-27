/** Which AI assistant the fixture exercises. */
export type EvalAssistant = 'commit-draft' | 'change-review' | 'safety-copilot'

/**
 * Quality checks applied to the parsed AI response.
 * All fields are optional — only the ones present are checked.
 */
export interface EvalChecks {
  // ── commit-draft ──────────────────────────────────────────────────────────
  /** `conventional` and `plain` must each be ≤ this many characters. */
  conventionalMaxLength?: number
  /** Description part must start with an imperative verb (not past-tense or gerund). */
  imperativeMood?: boolean
  /** Subject must not contain a bare filename (.ts, .js, etc.). */
  noFileNamesInSubject?: boolean
  /** Subject must not contain secret-like content (token prefixes, PEM headers). */
  noSecrets?: boolean
  /** `conventional` must NOT match this regex pattern (expressed as a string). */
  notMatchingPattern?: string

  // ── change-review ─────────────────────────────────────────────────────────
  /** findings.length must be ≥ this value. */
  minFindings?: number
  /** findings.length must be ≤ this value (0 = no false positives allowed). */
  maxFindings?: number

  // ── safety-copilot (deterministic path) ───────────────────────────────────
  /** result.code must equal this value. */
  codeEquals?: string
  /** result.suggestedAction must be one of these values. */
  suggestedActionIn?: string[]
}

/** A single golden-set eval case. One file = one case. */
export interface EvalFixture {
  /** Short kebab-case identifier (becomes the test title). */
  name: string
  /** Human-readable description of what quality property this case proves. */
  description: string
  /** Which AI assistant is under test. */
  assistant: EvalAssistant
  /**
   * Scenario description used for documentation and as prompt context in live
   * mode (`GITWARDEN_EVAL_LIVE=1`). Not machine-parsed in offline mode.
   */
  input: {
    diff?: string
    safetyCode?: string
    activeProfile?: string
    assignedProfile?: string
    context?: string
  }
  /**
   * The expected AI response used by the offline eval adapter.
   * Must satisfy the assistant's Zod schema.
   * In live mode this field is ignored — the real adapter is called instead.
   */
  cannedResponse: unknown
  /** Quality properties to assert on the parsed response. */
  checks: EvalChecks
}
