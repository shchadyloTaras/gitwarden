import type { RollResult } from './types.js'

/**
 * Roll the (agent-filled) "## [Unreleased]" section into a dated version section:
 *   - rename "## [Unreleased]" → "## [<version>] — <date>" (carrying its content down with it),
 *   - insert a fresh empty "## [Unreleased]" above it,
 *   - add a link reference for the new version at the top of the bottom link block.
 * Idempotent: if "## [<version>]" already exists, returns the text unchanged with alreadyRolled =
 * true. Throws if there is no "## [Unreleased]" heading. When `prevTag` is empty (first release) the
 * link points at the release-tag page instead of a compare range (matching the existing [0.1.0] style).
 */
export function rollUnreleased(
  changelogText: string,
  version: string,
  date: string,
  repoUrl: string,
  prevTag: string
): RollResult {
  if (new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm').test(changelogText)) {
    return { text: changelogText, alreadyRolled: true }
  }

  const unreleased = /^## \[Unreleased\][^\n]*$/m
  if (!unreleased.test(changelogText)) {
    throw new Error('rollUnreleased: no "## [Unreleased]" heading found')
  }

  let text = changelogText.replace(unreleased, `## [Unreleased]\n\n## [${version}] — ${date}`)

  const link = prevTag
    ? `[${version}]: ${repoUrl}/compare/${prevTag}...v${version}`
    : `[${version}]: ${repoUrl}/releases/tag/v${version}`

  const firstRef = /^\[\d+\.\d+\.\d+\]:/m
  if (firstRef.test(text)) {
    text = text.replace(firstRef, `${link}\n$&`)
  } else {
    text = `${text.replace(/\n*$/, '')}\n\n${link}\n`
  }
  return { text, alreadyRolled: false }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
