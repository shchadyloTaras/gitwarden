// Pure composition of the existing commit and push gates into one combined pre-flight
// verdict. No node/browser globals.

import type { SafetyCheckResult } from '../types.js'
import { safetyCheckService, type SafetyCheckService } from '../safety/SafetyCheckService.js'

export interface CommitAndPushGateInput {
  commit: Parameters<SafetyCheckService['checkCommit']>[0]
  push: Omit<Parameters<SafetyCheckService['checkPush']>[0], 'outgoingCommits'>
  /** Already-outgoing commits; undefined = still loading → push verdict withheld. */
  existingOutgoing?: { authorName: string; authorEmail: string }[]
}

export interface CommitAndPushVerdict {
  commit: SafetyCheckResult
  /** Evaluated with outgoing = existing + the hypothetical new commit authored by the
   *  effective identity; null while existingOutgoing is withheld. */
  push: SafetyCheckResult | null
  canCommitAndPush: boolean
}

/**
 * Composes `checkCommit` + `checkPush`, projecting the commit that Commit & Push is
 * about to create into `checkPush`'s outgoing-authorship gate BEFORE it exists — so a
 * wrong-identity commit is caught in the pre-flight sheet rather than after it lands.
 */
export function checkCommitAndPush(input: CommitAndPushGateInput): CommitAndPushVerdict {
  const commit = safetyCheckService.checkCommit(input.commit)

  if (input.existingOutgoing === undefined) {
    return { commit, push: null, canCommitAndPush: false }
  }

  const hypotheticalCommit = {
    authorName: input.commit.identity.userName ?? '',
    authorEmail: input.commit.identity.userEmail ?? '',
  }
  const push = safetyCheckService.checkPush({
    ...input.push,
    outgoingCommits: [...input.existingOutgoing, hypotheticalCommit],
  })

  return { commit, push, canCommitAndPush: commit.canCommit && push.canPush }
}
