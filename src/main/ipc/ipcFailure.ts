// Pure helper (no Electron import): map a thrown error to the IpcResult failure
// envelope. Kept OUT of ipc-handlers.ts (which imports Electron) so the envelope
// logic is unit-testable under plain Vitest.

import { GitError } from '../git/ErrorMapper.js'
import type { GitErrorCode } from '../../core/types.js'
import {
  isRemediableGitErrorCode,
  remediationForGitError,
  type Remediation,
} from '../../core/safety/remediation.js'

/** The failure half of IpcResult — `error` string preserved, structured fields optional. */
export interface IpcFailure {
  error: string
  code?: GitErrorCode
  remediation?: Remediation
}

/**
 * Build the failure envelope. The `error` STRING is preserved exactly
 * (`err.message`) for backward compatibility; a GitError additionally contributes
 * its `code`, and a remediable code its `remediation` from the core model.
 */
export function toIpcFailure(err: unknown): IpcFailure {
  const error = err instanceof Error ? err.message : String(err)
  if (err instanceof GitError) {
    const failure: IpcFailure = { error, code: err.code }
    if (isRemediableGitErrorCode(err.code)) {
      failure.remediation = remediationForGitError(err.code)
    }
    return failure
  }
  return { error }
}
