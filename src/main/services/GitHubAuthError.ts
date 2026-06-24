// Shared typed error for the GitHub auth/identity feature.
//
// `code` mirrors the pure `GitHubAuthErrorCode` (core/types) so the renderer can
// switch on a stable string regardless of which main-process service threw it:
// the device-flow state machine (Phase 23) and the REST identity client (Phase 24)
// both raise this. Kept in its own module so neither service depends on the other.

import type { GitHubAuthErrorCode } from '../../core/types.js'

/** Typed terminal error from the GitHub auth/identity flow; `code` mirrors GitHubAuthErrorCode. */
export class GitHubAuthError extends Error {
  constructor(
    readonly code: GitHubAuthErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'GitHubAuthError'
  }
}
