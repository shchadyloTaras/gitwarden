/**
 * Pure predicate for long-duration throttles (AGENTS.md #1) — e.g. "only re-check
 * for updates if the last check was ≥24h ago" (Phase 95, W28). `now`/`lastAt` are
 * passed in rather than read from `Date.now()` here, so the decision stays testable
 * without faking timers.
 *
 * Short-duration UI debounces (≤ a few seconds) use a live boolean+setTimeout flag
 * instead (see `ConnectGitHubModal.tsx`'s return-focus poke) — a timer that has to
 * survive app sleep/wake across 24h is impractical, which is why long-duration
 * throttles need this timestamp-comparison approach instead.
 */
export function isStale(lastAt: number | null, now: number, thresholdMs: number): boolean {
  return lastAt === null || now - lastAt >= thresholdMs
}
