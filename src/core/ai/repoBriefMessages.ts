import type { GitCommit } from '../types.js'

export function repoBriefSummary(
  repoName: string,
  includedFiles: string[],
  recentCommits: GitCommit[]
): string {
  const fileList =
    includedFiles.length > 0 ? includedFiles.join(', ') : 'no allowlisted config files found'
  const commitHint =
    recentCommits.length > 0
      ? `Latest commit: ${recentCommits[0].shortHash} — ${recentCommits[0].message}`
      : 'No recent commits loaded.'
  return `${repoName}: project brief from allowlisted files (${fileList}). ${commitHint}`
}

export function repoBriefBuildHint(commands: string[]): string {
  if (commands.length === 0) return 'No build scripts detected in allowlisted package.json.'
  return `Likely build/dev commands (not run): ${commands.join('; ')}`
}

export function repoBriefTestHint(commands: string[]): string {
  if (commands.length === 0) return 'No test scripts detected in allowlisted package.json.'
  return `Likely test/lint commands (not run): ${commands.join('; ')}`
}
