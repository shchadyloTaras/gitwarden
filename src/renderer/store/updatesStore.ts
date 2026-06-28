import { create } from 'zustand'
import type { UpdateCheckResult } from '../../core/updates/types'

interface UpdatesStoreState {
  /** Latest check outcome, or null before the first check has resolved. */
  result: UpdateCheckResult | null
  checking: boolean
  /**
   * Run an update check. Drives both the launch auto-check (App.tsx) and the manual
   * "Check for updates" button in Settings. Never rejects — a transport failure is folded
   * into an `error` result so the header button simply stays hidden.
   */
  check(): Promise<void>
}

export const useUpdatesStore = create<UpdatesStoreState>((set) => ({
  result: null,
  checking: false,

  async check() {
    set({ checking: true })
    const res = await window.api.updates.check()
    set({
      checking: false,
      result: res.ok ? res.data : { status: 'error', currentVersion: '', error: res.error },
    })
  },
}))
