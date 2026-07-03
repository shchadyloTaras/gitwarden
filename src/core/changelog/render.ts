import type { RollResult } from './types.js'

/**
 * Roll the (agent-filled) "## Unreleased" section into a dated version section:
 *   - rename "## Unreleased" → "## <version> — <date>" (carrying its content down with it),
 *   - insert a fresh empty "## Unreleased" above it.
 * Version headings are plain text (no reference-link brackets, no compare links) — the source repo
 * is private, so version-compare links would be dead. Idempotent: if "## <version>" already exists,
 * returns the text unchanged with alreadyRolled = true. Throws if there is no "## Unreleased" heading.
 */
export function rollUnreleased(changelogText: string, version: string, date: string): RollResult {
  if (new RegExp(`^## ${escapeRegExp(version)} `, 'm').test(changelogText)) {
    return { text: changelogText, alreadyRolled: true }
  }

  const unreleased = /^## Unreleased[^\n]*$/m
  if (!unreleased.test(changelogText)) {
    throw new Error('rollUnreleased: no "## Unreleased" heading found')
  }

  const text = changelogText.replace(unreleased, `## Unreleased\n\n## ${version} — ${date}`)
  return { text, alreadyRolled: false }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
