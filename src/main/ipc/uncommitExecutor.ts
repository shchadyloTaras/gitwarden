// Uncommit to Working Changes — return-commit executor (Phase 78). Runs behind three
// dedicated, user-initiated `history:*` IPC channels — NOT the `remediation.ts`
// ExecutableAction model, per the plan (this is a general-purpose undo, not a diagnosed
// safety remediation). Injectable/unit-testable like remediationExecutor.ts. Re-derives
// eligibility from a fresh `getUncommitContext` read immediately before every mutation
// (never trusts a stale client-side read), and never touches a commit that is already on
// the remote-tracking branch — `evaluateUncommit` is the sole gate for that boundary.

import type { GitService } from '../services/GitService.js'
import {
  evaluateUncommit,
  type UncommitEligibility,
  type UncommitRefusal,
  type UncommitReturnState,
  type UncommitActionResult,
} from '../../core/history/uncommit.js'

export interface UncommitExecutorDeps {
  git: Pick<GitService, 'getUncommitContext' | 'resetMixed' | 'enqueueJob' | 'verifyHeadBranch'>
}

/** Refusal when the branch the caller saw (expectedHeadBranch) is no longer HEAD. */
const HEAD_MOVED_MESSAGE =
  'The branch changed since you opened this — refresh History and try again.'

const REFUSAL_MESSAGES: Record<UncommitRefusal, string> = {
  'nothing-unpushed': "There's nothing unpushed to return — this commit is already on the remote.",
  'dirty-tree':
    'Commit or discard your current changes first — returning a commit would mix it in with them.',
  'root-commit': "The repository's very first commit can't be returned this way.",
  'merge-commit': "Merge commits can't be returned this way.",
  'detached-head': "You're not on a branch right now (detached HEAD) — switch to a branch first.",
  'in-progress-op': "Finish the merge, rebase, or cherry-pick that's already in progress first.",
  'no-upstream-for-all':
    'This branch has never been pushed, so there is no way to tell which commits are unpushed. Try "Return last commit" instead.',
}

async function readEligibility(
  deps: UncommitExecutorDeps,
  repoPath: string
): Promise<UncommitEligibility> {
  const ctx = await deps.git.getUncommitContext(repoPath)
  return evaluateUncommit(ctx)
}

export async function getReturnState(
  deps: UncommitExecutorDeps,
  input: { repoPath: string }
): Promise<UncommitReturnState> {
  const ctx = await deps.git.getUncommitContext(input.repoPath)
  return { eligibility: evaluateUncommit(ctx), unpushedCount: ctx.unpushedCount }
}

export async function returnLastCommit(
  deps: UncommitExecutorDeps,
  input: { repoPath: string; expectedHeadBranch?: string }
): Promise<UncommitActionResult> {
  // W1 (critical): the eligibility read and the resetMixed write now run as ONE
  // enqueued job, so a queued write between them can't invalidate what eligibility
  // already decided. When the caller knows which branch it saw, verify HEAD is still
  // there before touching anything.
  return deps.git.enqueueJob(input.repoPath, async (exec) => {
    if (input.expectedHeadBranch) {
      const onExpected = await deps.git.verifyHeadBranch(input.repoPath, input.expectedHeadBranch)
      if (!onExpected) return { ok: false, message: HEAD_MOVED_MESSAGE }
    }
    const eligibility = await readEligibility(deps, input.repoPath)
    if (!eligibility.canReturnLast) {
      return { ok: false, message: REFUSAL_MESSAGES[eligibility.refusals.last!] }
    }
    await deps.git.resetMixed(input.repoPath, 'HEAD~1', exec)
    return { ok: true }
  })
}

export async function returnUnpushed(
  deps: UncommitExecutorDeps,
  input: { repoPath: string; expectedHeadBranch?: string }
): Promise<UncommitActionResult> {
  return deps.git.enqueueJob(input.repoPath, async (exec) => {
    if (input.expectedHeadBranch) {
      const onExpected = await deps.git.verifyHeadBranch(input.repoPath, input.expectedHeadBranch)
      if (!onExpected) return { ok: false, message: HEAD_MOVED_MESSAGE }
    }
    const eligibility = await readEligibility(deps, input.repoPath)
    if (!eligibility.canReturnAllUnpushed) {
      return { ok: false, message: REFUSAL_MESSAGES[eligibility.refusals.all!] }
    }
    await deps.git.resetMixed(input.repoPath, `HEAD~${eligibility.returnAllCount}`, exec)
    return { ok: true }
  })
}
