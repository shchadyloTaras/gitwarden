// Merge a Branch (Phase 83): the git:merge channel's core logic, kept OUT of
// ipc-handlers.ts (which imports Electron) so it's unit-testable under plain
// Vitest, mirroring ipcFailure.ts. Clean-tree pre-check refuses a dirty tree with
// a plain message up front instead of letting git fail with a confusing "local
// changes would be overwritten." A real `mergeConflict` GitError is NOT caught
// here — it propagates so the caller's `wrap()`/`toIpcFailure` attaches the
// `resolve-conflicts` remediation automatically.

import type { GitService } from '../services/GitService.js'

export interface GitMergeDeps {
  git: Pick<GitService, 'getStatus' | 'mergeBranch'>
}

export async function runGitMerge(
  deps: GitMergeDeps,
  repoPath: string,
  branch: string
): Promise<void> {
  const status = await deps.git.getStatus(repoPath)
  if (status.files.length > 0) {
    throw new Error('Commit or stash your changes before merging this branch in.')
  }
  await deps.git.mergeBranch(repoPath, branch)
}
