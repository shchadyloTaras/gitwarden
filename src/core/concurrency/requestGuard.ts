/**
 * A reusable version of the monotonic-request-id pattern already used by
 * headerGuardStore: each in-flight request captures a token at start; a caller checks
 * `isCurrent(token)` before painting its result so a slower, superseded request can
 * never overwrite a newer one's data. Pure and dependency-free (AGENTS.md #1).
 */
export interface RequestTracker {
  /** Start a new request; returns the token this request must present to paint its result. */
  begin(): number
  /** True if `token` is still the most recently begun request (i.e. not superseded). */
  isCurrent(token: number): boolean
}

export function createRequestTracker(): RequestTracker {
  let current = 0
  return {
    begin(): number {
      current += 1
      return current
    },
    isCurrent(token: number): boolean {
      return token === current
    },
  }
}
