// Deterministic History Intelligence copy (Phase 35).

import type { GitCommit } from '../types.js'

export function releaseNotesDraftFromCommits(commits: GitCommit[], branch?: string): string {
  if (commits.length === 0) {
    return branch
      ? `No commits on ${branch} yet — release notes will appear here once history exists.`
      : 'No commits yet — release notes will appear here once history exists.'
  }
  const header = branch ? `Draft release notes for ${branch}` : 'Draft release notes'
  const bullets = commits.slice(0, 12).map((c) => `- ${c.message} (${c.shortHash})`)
  return [header, ...bullets].join('\n')
}

export function branchActivityFromCommits(commits: GitCommit[], branch?: string): string {
  if (commits.length === 0) {
    return branch ? `No recent activity on ${branch}.` : 'No recent branch activity.'
  }
  const authors = Array.from(new Set(commits.map((c) => c.authorName)))
  const branchLabel = branch ?? 'this branch'
  return `${commits.length} recent commit${commits.length === 1 ? '' : 's'} on ${branchLabel} by ${authors.join(', ')}. Latest: "${commits[0]?.message ?? ''}" (${commits[0]?.shortHash ?? ''}).`
}

export function changelogDraftFromCommits(commits: GitCommit[]): string {
  if (commits.length === 0) return 'No changes to list yet.'
  return commits
    .slice(0, 15)
    .map((c) => `* ${c.shortHash} — ${c.message} — ${c.authorName}`)
    .join('\n')
}
