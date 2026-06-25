import {
  assertSafeAgenticRepoPath,
  isAllowlistedAgenticAction,
  isAllowlistedNavigationTarget,
} from './agenticActions.js'
import { AiAgenticProposalSchema } from './schemas.js'
import type { AiAgenticProposal } from './types.js'

/** Fail closed if the proposal references a non-allowlisted action or unsafe path. */
export function validateAgenticProposal(raw: unknown): AiAgenticProposal {
  const parsed = AiAgenticProposalSchema.parse(raw)
  for (const action of parsed.actions) {
    if (!isAllowlistedAgenticAction(action.kind)) {
      throw new Error(`Non-allowlisted agentic action: ${action.kind}`)
    }
    if (action.kind === 'suggest-navigation') {
      if (!action.target || !isAllowlistedNavigationTarget(action.target)) {
        throw new Error(`Non-allowlisted navigation target: ${action.target ?? '(missing)'}`)
      }
    }
    if (action.kind === 'copy-command' && !action.command?.trim()) {
      throw new Error('copy-command actions require a command string.')
    }
    if (action.kind === 'write-repo-file' && action.target) {
      assertSafeAgenticRepoPath(action.target)
    }
  }
  for (const edit of parsed.fileEdits) {
    assertSafeAgenticRepoPath(edit.path)
  }
  return parsed
}
