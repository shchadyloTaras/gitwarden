// Merge a Branch (Phase 83): the git:merge channel's core logic, kept OUT of
// ipc-handlers.ts (which imports Electron) so it's unit-testable under plain
// Vitest, mirroring ipcFailure.ts. Clean-tree pre-check refuses a dirty tree with
// a plain message up front instead of letting git fail with a confusing "local
// changes would be overwritten." A real `mergeConflict` GitError is NOT caught
// here — it propagates so the caller's `wrap()`/`toIpcFailure` attaches the
// `resolve-conflicts` remediation automatically.

import type { GitService } from '../services/GitService.js'

export interface GitMergeDeps {
  git: Pick<GitService, 'getStatus' | 'mergeBranch' | 'enqueueJob' | 'verifyHeadBranch'>
}

/**
 * Phase 91 (W8): verify HEAD → clean-tree check → merge, all inside one enqueued job.
 * Closes the TOCTOU where a queued write between the old read-only `getStatus` check
 * and the queued `mergeBranch` write could land the merge on a branch that moved, or
 * re-dirty a tree the pre-check had just declared clean.
 */
export async function runGitMerge(
  deps: GitMergeDeps,
  repoPath: string,
  branch: string,
  expectedTargetBranch?: string
): Promise<void> {
  return deps.git.enqueueJob(repoPath, async (exec) => {
    if (expectedTargetBranch) {
      const onExpected = await deps.git.verifyHeadBranch(repoPath, expectedTargetBranch)
      if (!onExpected) {
        throw new Error('The branch changed since you opened this — refresh and try again.')
      }
    }
    const status = await deps.git.getStatus(repoPath)
    if (status.files.length > 0) {
      throw new Error('Commit or stash your changes before merging this branch in.')
    }
    await deps.git.mergeBranch(repoPath, branch, exec)
  })
}
