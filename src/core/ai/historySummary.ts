// History Intelligence — deterministic release-notes / activity / changelog drafts (Phase 35).
// Pure core: works offline with AI disabled.

import type { GitCommit } from '../types.js'
import {
  branchActivityFromCommits,
  changelogDraftFromCommits,
  releaseNotesDraftFromCommits,
} from './historySummaryMessages.js'
import type { AiHistorySummary } from './types.js'

export function buildDeterministicHistorySummary(
  commits: GitCommit[],
  branch?: string
): AiHistorySummary {
  return {
    releaseNotesDraft: releaseNotesDraftFromCommits(commits, branch),
    branchActivity: branchActivityFromCommits(commits, branch),
    changelogDraft: changelogDraftFromCommits(commits),
    source: 'deterministic',
  }
}

/** AI may rewrite the three draft sections; structure stays advisory-only. */
export function mergeHistorySummary(
  deterministic: AiHistorySummary,
  ai?: Partial<Pick<AiHistorySummary, 'releaseNotesDraft' | 'branchActivity' | 'changelogDraft'>>
): AiHistorySummary {
  const releaseNotesDraft = ai?.releaseNotesDraft?.trim() || deterministic.releaseNotesDraft
  const branchActivity = ai?.branchActivity?.trim() || deterministic.branchActivity
  const changelogDraft = ai?.changelogDraft?.trim() || deterministic.changelogDraft
  const changed =
    releaseNotesDraft !== deterministic.releaseNotesDraft ||
    branchActivity !== deterministic.branchActivity ||
    changelogDraft !== deterministic.changelogDraft
  if (!changed) return deterministic
  return {
    releaseNotesDraft,
    branchActivity,
    changelogDraft,
    source: 'ai',
  }
}
