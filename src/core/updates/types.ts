// Update-notifier domain types (pure — no Node/Electron/DOM).
//
// GitWarden's "notifier-only" update path (docs/plans/distribution-release-plan.md Phase 44,
// scaled to detection-only because in-app install needs code signing / Phase 43): on launch the
// app asks GitHub for the latest published release, compares it to the running version, and shows
// an "Update" button ONLY when a newer release exists. Clicking opens the release page for a
// manual download. All version math lives here so it runs under plain Vitest.

/** A published release discovered from the update source (GitHub Releases). */
export interface ReleaseInfo {
  /** Raw git tag, e.g. "v0.2.0". */
  tag: string
  /** Parsed semantic version without the leading "v", e.g. "0.2.0". */
  version: string
  /** Human-facing release name; falls back to the tag when GitHub leaves it null. */
  name: string
  /** URL of the release page, used for the manual-download click. */
  url: string
  /** ISO publish timestamp, when GitHub provides one. */
  publishedAt?: string
}

/**
 * Outcome of an update check — a discriminated union so the renderer only has to test
 * `status === 'update-available'` to decide whether to surface the button. The check is
 * "soft": network/parse failures resolve to `error` rather than throwing, so a flaky
 * connection never nags the user — it just leaves the button hidden.
 */
export type UpdateCheckResult =
  | { status: 'update-available'; currentVersion: string; release: ReleaseInfo }
  | { status: 'up-to-date'; currentVersion: string }
  | { status: 'no-releases'; currentVersion: string }
  | { status: 'error'; currentVersion: string; error: string }
