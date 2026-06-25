// Deterministic change-review copy (Phase 33). User-facing "why" strings for
// findings produced without AI — kept in core so the scanner stays pure and
// testable. Renderer UI labels live in strings.ts.

import type { AiReviewCategory } from './types.js'

export function whySecretDetected(ruleLabel: string, file: string): string {
  return `Staged changes in ${file} match a ${ruleLabel.toLowerCase()} pattern. Committing secrets can expose credentials in Git history.`
}

export function whyRiskyFile(file: string): string {
  return `${file} is a sensitive path (env, key, or credential file). Double-check before committing.`
}

export function whyMigration(file: string): string {
  return `${file} looks like a database migration. Migrations are hard to revert once pushed.`
}

export function whyLockfile(file: string): string {
  return `${file} is a dependency lockfile. Large lockfile diffs are easy to merge incorrectly.`
}

export function whyGenerated(file: string): string {
  return `${file} looks generated or build output. Generated artifacts usually belong in .gitignore.`
}

export function whyMissingTests(sourceFile: string): string {
  return `${sourceFile} changed without a matching test file in this commit. Consider adding or updating tests.`
}

export function whyDestructive(file: string, deletedLines: number): string {
  return `${file} removes ${deletedLines} line${deletedLines === 1 ? '' : 's'} with little or no replacement. Review for accidental deletions.`
}

export const CATEGORY_LABELS: Record<AiReviewCategory, string> = {
  'secret-like': 'Secret-like changes',
  'risky-file': 'Risky files',
  migration: 'Migrations',
  lockfile: 'Lockfiles',
  generated: 'Generated files',
  'missing-tests': 'Missing tests',
  destructive: 'Destructive changes',
}
