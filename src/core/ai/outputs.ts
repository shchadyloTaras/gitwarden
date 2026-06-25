import {
  AiChangeReviewSchema,
  AiChangeSummarySchema,
  AiCommitDraftSchema,
  AiHistorySummaryAiResponseSchema,
  AiPushBriefAiResponseSchema,
  AiRepoBriefAiResponseSchema,
  AiFailureExplanationAiResponseSchema,
  AiAgenticProposalSchema,
  AiSafetyExplanationSchema,
} from './schemas.js'
import type {
  AiChangeReview,
  AiChangeSummary,
  AiCommitDraft,
  AiHistorySummary,
  AiPushBrief,
  AiRepoBrief,
  AiAgenticProposal,
  AiSafetyExplanation,
} from './types.js'

/** Fail-closed parsing for Smart Commit Assistant adapter output (Phase 32). */
export function parseCommitDraft(raw: unknown): AiCommitDraft {
  return AiCommitDraftSchema.parse(raw)
}

/** Fail-closed parsing for staged-change summary adapter output (Phase 32). */
export function parseChangeSummary(raw: unknown): AiChangeSummary {
  return AiChangeSummarySchema.parse(raw)
}

export const COMMIT_DRAFT_TASK_INSTRUCTION =
  'Draft a commit message for the staged changes. Return JSON with: conventional (Conventional Commits subject line), plain (plain-language subject), summary (one concise sentence), and optional body (longer explanation or bullet points). English only. Do not commit — advisory output only.'

export const CHANGE_SUMMARY_TASK_INSTRUCTION =
  'Summarize the staged changes for the developer. Return JSON with: summary (one short paragraph) and highlights (array of concise bullet strings). English only. Advisory only — do not suggest committing.'

/** Fail-closed parsing for Change Review Assistant adapter output (Phase 33). */
export function parseChangeReview(raw: unknown): AiChangeReview {
  return AiChangeReviewSchema.parse(raw)
}

export const CHANGE_REVIEW_TASK_INSTRUCTION =
  'Review the staged changes for risk before commit. Return JSON with: findings (array of objects with category one of secret-like, risky-file, migration, lockfile, generated, missing-tests, destructive; source must be "ai"; confidence low|medium|high; optional file path; why explaining why it matters), and optional overall (one-line impression). English only. Advisory only — never claim the changes are safe if secrets might be present.'

/** Fail-closed parsing for Safety Copilot adapter output (Phase 34). */
export function parseSafetyExplanation(raw: unknown): Pick<AiSafetyExplanation, 'explanation'> {
  return AiSafetyExplanationSchema.parse(raw)
}

export const SAFETY_EXPLAIN_TASK_INSTRUCTION =
  'Explain the safety issue identified in the context (see safetyIssueCode) in plain language for a developer. Return JSON with: explanation (string). English only. Advisory only — never suggest bypassing GitWarden safety gates, never auto-apply fixes, and only point users at existing controls: set local identity, switch active profile, assign repo profile, reconnect GitHub, stage changes, write a commit message, resolve conflicts, configure remotes, or review staged changes for secrets.'

/** Fail-closed parsing for Push Brief adapter output (Phase 35). */
export function parsePushBriefAiResponse(
  raw: unknown
): Pick<AiPushBrief, 'summary' | 'highlights'> {
  return AiPushBriefAiResponseSchema.parse(raw)
}

export const PUSH_BRIEF_TASK_INSTRUCTION =
  'Summarize the commits ahead of upstream that will be published on push. Return JSON with: summary (one short paragraph explaining what will be published) and highlights (array of concise bullet strings, one per notable commit or theme). English only. Advisory only — never include tokens, API keys, passwords, or credential material. Do not change push identity facts.'

/** Fail-closed parsing for History Intelligence adapter output (Phase 35). */
export function parseHistorySummaryAiResponse(raw: unknown): Omit<AiHistorySummary, 'source'> {
  return AiHistorySummaryAiResponseSchema.parse(raw)
}

export const HISTORY_SUMMARY_TASK_INSTRUCTION =
  'Draft history intelligence from the recent commits in context. Return JSON with: releaseNotesDraft (user-facing release notes draft), branchActivity (short paragraph on recent branch activity), and changelogDraft (changelog-style bullet list). English only. Advisory only — never include tokens, API keys, passwords, or credential material.'

/** Fail-closed parsing for Repo Brief adapter output (Phase 36). */
export function parseRepoBriefAiResponse(
  raw: unknown
): Partial<
  Pick<AiRepoBrief, 'likelyBuildCommands' | 'likelyTestCommands' | 'buildHint' | 'testHint'>
> & { projectSummary: string } {
  return AiRepoBriefAiResponseSchema.parse(raw)
}

export const REPO_BRIEF_TASK_INSTRUCTION =
  'Generate a project onboarding brief from the allowlisted files and recent commits in context. Return JSON with: projectSummary (short overview), likelyBuildCommands (array of suggested build/dev commands — do NOT run them), likelyTestCommands (array of suggested test/lint commands — do NOT run them), buildHint (one sentence), testHint (one sentence). English only. Never include secrets or credential material.'

/** Fail-closed parsing for Failure Explainer adapter output (Phase 37). */
export function parseFailureExplanationAiResponse(raw: unknown): { explanation: string } {
  return AiFailureExplanationAiResponseSchema.parse(raw)
}

export const FAILURE_EXPLAIN_TASK_INSTRUCTION =
  'Explain the Git or tool failure in context in plain language with actionable next steps. Return JSON with: explanation (string). English only. Advisory only — never suggest bypassing GitWarden safety gates, never run shell commands, and only point users at existing app controls.'

/** Fail-closed parsing for Agentic proposal adapter output (Phase 39). */
export function parseAgenticProposal(raw: unknown): AiAgenticProposal {
  return AiAgenticProposalSchema.parse(raw)
}

export const AGENTIC_PROPOSAL_TASK_INSTRUCTION =
  'Propose allowlisted helper actions for the repository context. Return JSON with: summary (string), actions (array of { kind: write-repo-file|suggest-navigation|copy-command, optional target, optional command }), fileEdits (array of { path, optional before, after }). Never propose push, staging, identity changes, shell execution, or .git/config writes. English only.'
