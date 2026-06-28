// The single pure decision behind the update button: given the running version and the latest
// release (or none), classify the situation. The main-process service does the impure work
// (fetch GitHub, parse JSON) and then defers to this so the "show the button?" rule is testable
// in isolation and can never disagree between the header and Settings.

import type { ReleaseInfo, UpdateCheckResult } from './types.js'
import { isNewerVersion } from './version.js'

/**
 * @param currentVersion the running app version (e.g. from `app.getVersion()`)
 * @param release        the latest published release, or null when none is published yet
 */
export function evaluateUpdate(
  currentVersion: string,
  release: ReleaseInfo | null
): UpdateCheckResult {
  if (!release) return { status: 'no-releases', currentVersion }
  if (isNewerVersion(release.version, currentVersion)) {
    return { status: 'update-available', currentVersion, release }
  }
  return { status: 'up-to-date', currentVersion }
}
