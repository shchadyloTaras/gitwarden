// Uncommit to Working Changes — eligibility model (Phase 76). PURE core (AGENTS.md rule #1):
// no Node process/filesystem/Electron/browser APIs. Given a read-only snapshot of repo state,
// decides which of the two user-facing actions ("return last commit" / "return all unpushed
// commits") are allowed and why not. Human-facing copy stays OUT of core — the renderer maps
// each UncommitRefusal to a string.

export interface UncommitContext {
  /** Commits in `<remote>/<branch>..HEAD`; meaningless (not used for "all") when !hasUpstream. */
  unpushedCount: number
  /** Is there a remote-tracking branch to define "pushed" against? */
  hasUpstream: boolean
  /** `getStatus(...).files.length === 0` */
  workingTreeClean: boolean
  /** HEAD has ≥2 parents. */
  headIsMerge: boolean
  /** HEAD has no parent (`HEAD~1` doesn't resolve). */
  headIsRoot: boolean
  /** Any commit in `HEAD~unpushedCount..HEAD` is a merge (relevant to "all"). */
  rangeHasMerge: boolean
  /** Mid-merge/rebase/cherry-pick. */
  inProgressOp: boolean
  /** HEAD is not on a branch. */
  detachedHead: boolean
}

export type UncommitRefusal =
  | 'nothing-unpushed'
  | 'dirty-tree'
  | 'root-commit'
  | 'merge-commit'
  | 'detached-head'
  | 'in-progress-op'
  | 'no-upstream-for-all'

export interface UncommitEligibility {
  canReturnLast: boolean
  canReturnAllUnpushed: boolean
  /** = unpushedCount when canReturnAllUnpushed. */
  returnAllCount: number
  refusals: { last?: UncommitRefusal; all?: UncommitRefusal }
}

/** Shape of the `history:getReturnState` IPC read (Phase 78) — shared by main and preload. */
export interface UncommitReturnState {
  eligibility: UncommitEligibility
  unpushedCount: number
}

/** Shape of `history:returnLastCommit` / `history:returnUnpushed` (Phase 78). */
export interface UncommitActionResult {
  ok: boolean
  message?: string
}

/**
 * Global blocks (detached HEAD / in-progress op / dirty tree) refuse BOTH actions with the same
 * refusal. Beyond that, "last" and "all" are evaluated independently against their own rules.
 */
export function evaluateUncommit(ctx: UncommitContext): UncommitEligibility {
  const globalRefusal: UncommitRefusal | undefined = ctx.detachedHead
    ? 'detached-head'
    : ctx.inProgressOp
      ? 'in-progress-op'
      : !ctx.workingTreeClean
        ? 'dirty-tree'
        : undefined

  if (globalRefusal) {
    return {
      canReturnLast: false,
      canReturnAllUnpushed: false,
      returnAllCount: ctx.unpushedCount,
      refusals: { last: globalRefusal, all: globalRefusal },
    }
  }

  const lastRefusal: UncommitRefusal | undefined =
    ctx.unpushedCount < 1
      ? 'nothing-unpushed'
      : ctx.headIsMerge
        ? 'merge-commit'
        : ctx.headIsRoot
          ? 'root-commit'
          : undefined
  const canReturnLast = !lastRefusal

  const allRefusal: UncommitRefusal | undefined =
    ctx.unpushedCount < 1
      ? 'nothing-unpushed'
      : ctx.headIsMerge
        ? 'merge-commit'
        : ctx.headIsRoot
          ? 'root-commit'
          : !ctx.hasUpstream
            ? 'no-upstream-for-all'
            : ctx.rangeHasMerge
              ? 'merge-commit'
              : undefined
  const canReturnAllUnpushed = !allRefusal

  return {
    canReturnLast,
    canReturnAllUnpushed,
    returnAllCount: ctx.unpushedCount,
    refusals: { last: lastRefusal, all: allRefusal },
  }
}
