// Pure types for the release-changelog tooling (no Node/Electron/DOM imports).
// See docs/superpowers/specs/2026-06-28-changelog-release-automation-design.md.

/** One commit parsed from `git log`, with the files it changed. */
export interface Commit {
  hash: string
  subject: string
  body: string
  files: string[]
}

/** Semantic-version bump magnitude implied by a set of commits. */
export type BumpKind = 'major' | 'minor' | 'patch' | 'none'

/** Result of rolling the `[Unreleased]` section into a dated version section. */
export interface RollResult {
  /** The rewritten changelog text. */
  text: string
  /** True when `## [<version>]` already existed, so nothing changed (idempotent re-run). */
  alreadyRolled: boolean
}
