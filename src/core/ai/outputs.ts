import { AiChangeSummarySchema, AiCommitDraftSchema } from './schemas.js'
import type { AiChangeSummary, AiCommitDraft } from './types.js'

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
