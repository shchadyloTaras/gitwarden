// Push Brief — deterministic summaries for commits ahead of upstream (Phase 35).
// Pure core: works offline with AI disabled. Never includes token/credential material.

import type { GitCommit } from '../types.js'
import {
  formatPushIdentityNote,
  pushBriefHighlight,
  pushBriefSummary,
} from './pushBriefMessages.js'
import type { AiPushBrief, AiPushIdentityContext } from './types.js'

const MAX_DETERMINISTIC_HIGHLIGHTS = 8

export function buildDeterministicPushBrief(
  commitsAhead: GitCommit[],
  identity: AiPushIdentityContext
): AiPushBrief {
  const commitCount = commitsAhead.length
  return {
    summary: pushBriefSummary(commitCount, identity.remoteName, identity.branch),
    highlights: commitsAhead.slice(0, MAX_DETERMINISTIC_HIGHLIGHTS).map(pushBriefHighlight),
    commitCount,
    identityNote: formatPushIdentityNote(identity),
    source: 'deterministic',
  }
}

/** AI may enhance summary/highlights; identity note stays deterministic. */
export function mergePushBrief(
  deterministic: AiPushBrief,
  ai?: Pick<AiPushBrief, 'summary' | 'highlights'>
): AiPushBrief {
  const summary = ai?.summary?.trim() || deterministic.summary
  const highlights =
    ai?.highlights && ai.highlights.length > 0 ? ai.highlights : deterministic.highlights
  const changed =
    summary !== deterministic.summary ||
    highlights.length !== deterministic.highlights.length ||
    highlights.some((h, i) => h !== deterministic.highlights[i])
  if (!changed) return deterministic
  return {
    ...deterministic,
    summary,
    highlights,
    source: 'ai',
  }
}
