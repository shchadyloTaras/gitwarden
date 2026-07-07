import { create } from 'zustand'
import type { UpdateCheckResult } from '../../core/updates/types'
import { isStale } from '../../core/concurrency/staleness'

/** Re-check on window focus at most this often (Phase 95, W28) — the launch check
 * and the manual "Check for updates" button in Settings are never throttled. */
const FOCUS_RECHECK_THRESHOLD_MS = 24 * 60 * 60 * 1000

interface UpdatesStoreState {
  /** Latest check outcome, or null before the first check has resolved. */
  result: UpdateCheckResult | null
  checking: boolean
  /** When `check()` last actually ran, or null before the first check. */
  lastCheckedAt: number | null
  /**
   * Run an update check. Drives both the launch auto-check (App.tsx) and the manual
   * "Check for updates" button in Settings. Never rejects — a transport failure is folded
   * into an `error` result so the header button simply stays hidden.
   */
  check(): Promise<void>
  /**
   * The window-focus re-check (W28): runs `check()` only if the last one was ≥24h
   * ago, so alt-tabbing back into the app doesn't hammer GitHub's API every time.
   * `now` is passed in rather than read here, so the throttle decision stays
   * testable without faking timers.
   */
  checkIfStale(now: number): Promise<void>
}

export const useUpdatesStore = create<UpdatesStoreState>((set, get) => ({
  result: null,
  checking: false,
  lastCheckedAt: null,

  async check() {
    set({ checking: true })
    const res = await window.api.updates.check()
    set({
      checking: false,
      lastCheckedAt: Date.now(),
      result: res.ok ? res.data : { status: 'error', currentVersion: '', error: res.error },
    })
  },

  async checkIfStale(now) {
    if (!isStale(get().lastCheckedAt, now, FOCUS_RECHECK_THRESHOLD_MS)) return
    await get().check()
    // check() stamps its own real Date.now() — overwrite with the injected `now`
    // (the same value in production, since App.tsx passes Date.now() here too) so
    // this method's own throttle bookkeeping stays self-consistent and testable.
    set({ lastCheckedAt: now })
  },
}))
