// AI Connections — pure core domain types (Phase 28).
//
// No node/electron/DOM imports. These types define the *contracts* for the
// advisory AI layer: connection records, capabilities, provider detection,
// the declarative Custom HTTP mapping, and the per-feature structured outputs
// that later phases parse adapter responses into. See
// docs/plans/ai-integration-plan.md §5.
//
// Secret material is NEVER part of these types: an AiConnection (including its
// `baseUrl`, the send destination) is non-secret JSON; API keys and custom
// header secrets are referenced only by `connectionId` and live in the
// encrypted AiCredentialStore (Phase 29).

/** Built-in adapter kinds plus the Custom HTTP escape hatch (§6). */
export type AiConnectionKind =
  | 'openrouter'
  | 'openai-compatible'
  | 'anthropic'
  | 'ollama'
  | 'custom-http'

/**
 * Per-request privacy posture. Default is `preview-each`: the user sees the
 * exact post-redaction payload AND destination host before each sensitive send.
 * `preview-first-run` confirms structure only on the first run and is a
 * conscious downgrade (diff content changes commit to commit). `off` disables
 * the preview entirely. See §4.
 */
export type AiPrivacyMode = 'off' | 'preview-each' | 'preview-first-run'

/**
 * Retention attestation for a connection's endpoint. `unknown` must be
 * explicitly accepted by the user (`user-accepted`) before sends are allowed on
 * the default path. Local (loopback) connections are surfaced as the safest. §4.
 */
export type AiRetentionState = 'zero-retention' | 'unknown' | 'user-accepted'

/** Every advisory feature that can build a request. The AI owns no Git action. */
export type AiRequestKind =
  | 'commit-draft'
  | 'change-summary'
  | 'change-review'
  | 'safety-explain'
  | 'push-brief'
  | 'history-summary'
  | 'repo-brief'
  | 'failure-explain'
  | 'agentic-proposal'

/**
 * What a connection's adapter/endpoint can do.
 *
 * `localOnly` is DERIVED from the resolved host (loopback), NOT from `kind`: an
 * `openai-compatible` connection pointed at `http://localhost:1234/v1` is just
 * as local as Ollama. Use `deriveLocalOnly()` from `./transport` to compute it. §4.
 */
export interface AiConnectionCapabilities {
  structuredOutput: boolean
  streaming: boolean
  modelList: boolean
  usage: boolean
  /** Derived from the base URL resolving to loopback — never inferred from kind. */
  localOnly: boolean
}

/**
 * A named, reusable provider configuration. Non-secret JSON, stored as a list
 * (`AiConnection[]`) even though the MVP UI exposes a single active connection.
 * `baseUrl` is the send destination and is intentionally non-secret so the send
 * preview can show the host (a `baseUrl` change is a recipient change — §4,
 * SECURITY.md). Secrets are referenced only by `id` via AiCredentialStore.
 */
export interface AiConnection {
  id: string
  name: string
  kind: AiConnectionKind
  /** The connection-level enable flag — the weakest in the precedence chain. */
  enabled: boolean
  /** Send destination. Optional for adapters with a fixed endpoint (e.g. anthropic). */
  baseUrl?: string
  defaultModel?: string
  privacyMode: AiPrivacyMode
  retention: AiRetentionState
  capabilities: AiConnectionCapabilities
  /** Declarative request/response mapping for `custom-http` connections only. */
  customHttpMapping?: CustomHttpMapping
  createdAt: string // ISO
  updatedAt: string // ISO
}

/**
 * The ONLY credential information that may cross back to the renderer. The raw
 * secret never leaves the main process after save; the renderer sees a masked
 * preview and which fields are stored.
 */
export interface AiCredentialMetadata {
  connectionId: string
  label: string
  maskedPreview: string // e.g. "••••cdef" — never the raw secret
  secretFields: string[] // e.g. ["apiKey"] or ["Authorization"]
  updatedAt: string // ISO
}

export type AiDetectionConfidence = 'high' | 'medium' | 'low'

/**
 * Result of key-prefix provider detection (Phase 29). This is UX, NOT a security
 * boundary — a forged prefix only changes which adapter we try; it grants
 * nothing. The renderer receives this plus a masked key label, never the raw key.
 */
export interface AiProviderDetection {
  kind: AiConnectionKind | 'unknown'
  confidence: AiDetectionConfidence
  reason: string
  suggestedBaseUrl?: string
}

/**
 * Response-mapping strings are a SAFE JSONPath subset: dotted-key and
 * numeric-index navigation only (`$.choices[0].message.content`). No filter
 * (`?(…)`), script, or wildcard expressions — the parser rejects them rather
 * than silently ignoring them. See `./jsonpath` and §6.3.
 */
export interface CustomHttpResponseMapping {
  text: string
  inputTokens?: string
  outputTokens?: string
}

/**
 * The declarative Custom HTTP mapping (§6.3). NOT code: no arbitrary JS, no
 * file reads, no shell. Only the constrained placeholders (see `./customHttp`)
 * and the safe JSONPath subset for response extraction.
 */
export interface CustomHttpMapping {
  method: 'POST'
  url: string
  headersTemplate: Record<string, string>
  bodyTemplate?: unknown
  responseMapping: CustomHttpResponseMapping
}

/** One chat-style message sent to an adapter. */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Renderer-safe model metadata returned by `ai:listModels`. */
export interface AiModelInfo {
  id: string
  label?: string
  structuredOutput: boolean
  recommended?: boolean
  localOnly: boolean
}

/** Renderer-safe connection probe result. It never contains request headers or secrets. */
export interface AiConnectionTestResult {
  connectionId: string
  ok: boolean
  localOnly: boolean
  models: AiModelInfo[]
  message?: string
}

/** Token/cost estimate surfaced before a send and after a response. */
export interface AiUsageEstimate {
  inputTokens: number
  outputTokens?: number
  estCostUsd?: number
  warnings?: string[]
  requiresExplicitWarning?: boolean
}

/** IPC-safe input for estimating usage before a send. */
export interface AiUsageEstimateRequest {
  connectionId: string
  kind: AiRequestKind
  messages?: AiMessage[]
  prompt?: string
  model?: string
  maxOutputTokens?: number
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  expensiveSendAcknowledged?: boolean
}

export type AiReviewCategory =
  | 'secret-like'
  | 'risky-file'
  | 'migration'
  | 'lockfile'
  | 'generated'
  | 'missing-tests'
  | 'destructive'

/** A finding's provenance. A model `all-clear` can never clear a deterministic finding. */
export type AiFindingSource = 'deterministic' | 'ai'

export type AiConfidence = 'low' | 'medium' | 'high'

/** One change-review finding (Phase 33). `source` keeps AI vs deterministic distinct. */
export interface AiReviewFinding {
  category: AiReviewCategory
  source: AiFindingSource
  confidence: AiConfidence
  file?: string
  why: string
}

// ── Per-feature structured outputs (parsed from adapter responses, fail-closed) ──

/**
 * Smart Commit Assistant output (Phase 32). The user explicitly inserts one of
 * these; the AI never commits.
 */
export interface AiCommitDraft {
  /** A Conventional Commits subject line, e.g. "feat(core): add AI contracts". */
  conventional: string
  /** A plain-language subject line. */
  plain: string
  /** A concise summary of the staged changes. */
  summary: string
  /** Optional commit body (longer explanation / bullet points). */
  body?: string
}

/** "Summarize staged changes" output (Phase 32). */
export interface AiChangeSummary {
  summary: string
  highlights: string[]
}

/** Change Review Assistant output (Phase 33). AI findings carry `source: 'ai'`. */
export interface AiChangeReview {
  findings: AiReviewFinding[]
  /** Optional one-line overall impression. Advisory only. */
  overall?: string
}

/**
 * Allowlisted app controls the Safety Copilot may point at (Phase 34).
 * The AI never applies these — it only tells the user where to go.
 */
export type SafetySuggestedAction =
  | 'set-local-identity'
  | 'switch-active-profile'
  | 'assign-repo-profile'
  | 'reconnect-github'
  | 'stage-changes'
  | 'write-commit-message'
  | 'resolve-conflicts'
  | 'configure-remote'
  | 'review-staged-changes'

/** Safety Copilot explanation for one SafetyCode (Phase 34). */
export interface AiSafetyExplanation {
  code: string
  explanation: string
  suggestedAction: SafetySuggestedAction
  actionHint: string
  source: 'deterministic' | 'ai'
}

/** Token-free push identity facts for Push Brief (Phase 35). */
export interface AiPushIdentityContext {
  remoteName: string
  branch: string
  remoteHost?: string
  activeProfileName?: string
  activeProfileEmail?: string
  assignedProfileName?: string
  identityName?: string
  identityEmail?: string
  github?: {
    assignedLogin?: string
    effectiveLogin?: string
    hasToken: boolean
    tokenInvalid: boolean
  }
}

/** Push Brief — commits ahead of upstream before explicit push confirmation (Phase 35). */
export interface AiPushBrief {
  summary: string
  highlights: string[]
  commitCount: number
  identityNote: string
  source: 'deterministic' | 'ai'
}

/** History Intelligence — release notes, branch activity, changelog drafts (Phase 35). */
export interface AiHistorySummary {
  releaseNotesDraft: string
  branchActivity: string
  changelogDraft: string
  source: 'deterministic' | 'ai'
}

/** Metadata for one allowlisted file included in a repo brief (Phase 36). */
export interface AiAllowlistedFile {
  path: string
  byteLength: number
}

/** Repo Onboarding Assistant output (Phase 36). Commands are inferred, never executed. */
export interface AiRepoBrief {
  projectSummary: string
  likelyBuildCommands: string[]
  likelyTestCommands: string[]
  buildHint: string
  testHint: string
  includedFiles: string[]
  source: 'deterministic' | 'ai'
}

/** Allowlisted app controls the Failure Explainer may point at (Phase 37). */
export type FailureSuggestedAction =
  | 'check-network'
  | 'review-auth'
  | 'configure-remote'
  | 'switch-branch'
  | 'resolve-conflicts'
  | 'stage-changes'
  | 'review-staged-changes'
  | 'open-safety-center'
  | 'open-repositories'
  | 'open-settings'
  | 'none'

/** Failure Explainer output for Git errors or pasted tool output (Phase 37). */
export interface AiFailureExplanation {
  code: string
  category: string
  explanation: string
  suggestedAction: FailureSuggestedAction
  actionHint: string
  source: 'deterministic' | 'ai'
}

/** Export/import template — no secrets, no runtime ids (Phase 38). */
export interface AiConnectionTemplateExport {
  version: 1
  name: string
  kind: AiConnectionKind
  baseUrl?: string
  defaultModel?: string
  privacyMode: AiPrivacyMode
  retention: AiRetentionState
  customHttpMapping?: CustomHttpMapping
}

/** One proposed file edit in an agentic proposal (Phase 39). */
export interface AiAgenticFileEdit {
  path: string
  before?: string
  after: string
}

/** One allowlisted action in an agentic proposal (Phase 39). */
export interface AiAgenticAction {
  kind: 'write-repo-file' | 'suggest-navigation' | 'copy-command'
  target?: string
  command?: string
}

/** Agentic proposal — previewed and confirmed before any execution (Phase 39). */
export interface AiAgenticProposal {
  summary: string
  actions: AiAgenticAction[]
  fileEdits: AiAgenticFileEdit[]
}
