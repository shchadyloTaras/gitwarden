import type { Commit, BumpKind } from './types.js'
import { parseVersion } from '../updates/version.js'

// Field/record separators for the `git log --format` string the release script runs. Defined here
// so the parser and its producer (scripts/release-changelog.ts) agree on the wire format.
export const FIELD_SEP = '\x1f' // US — between hash / subject / body / files
export const RECORD_SEP = '\x1e' // RS — before each commit record

/**
 * Parse the output of
 *   git log <range> --format=%x1e%H%x1f%s%x1f%b%x1f --name-only
 * Each record starts with RECORD_SEP; its first three FIELD_SEP-delimited fields are hash, subject,
 * body; the remainder is the newline-separated file list. Splitting on FIELD_SEP (never "\n") keeps
 * multi-line bodies intact.
 */
export function parseGitLog(raw: string): Commit[] {
  return raw
    .split(RECORD_SEP)
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((r) => {
      const [hash = '', subject = '', body = '', filesBlob = ''] = r.split(FIELD_SEP)
      const files = filesBlob
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f !== '')
      return { hash: hash.trim(), subject: subject.trim(), body: body.trim(), files }
    })
}

/**
 * Drop commits that only touch the landing site. A commit is "landing-only" iff it changed at least
 * one file and EVERY changed path starts with "landing/". Everything else is kept (it touches the
 * app). Commits with no detected files are kept — we cannot prove they are landing-only.
 */
export function filterAppCommits(commits: Commit[]): Commit[] {
  return commits.filter(
    (c) => c.files.length === 0 || !c.files.every((f) => f.startsWith('landing/'))
  )
}

/**
 * Advisory SemVer bump implied by the (already app-filtered) commits, from Conventional Commit
 * subjects/bodies: 'major' on a "!" marker or "BREAKING CHANGE"; else 'minor' on any "feat"; else
 * 'patch'; 'none' when there are no commits. Advisory only — the human confirms the version.
 */
export function suggestBump(commits: Commit[]): BumpKind {
  if (commits.length === 0) return 'none'
  let hasFeat = false
  for (const commit of commits) {
    const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(commit.subject)
    if (match?.[3] === '!' || /(^|\n)BREAKING CHANGE/.test(commit.body)) return 'major'
    if (match?.[1] === 'feat') hasFeat = true
  }
  return hasFeat ? 'minor' : 'patch'
}

/**
 * Compute the next version string from the current one and a bump kind, applying the repo's pre-1.0
 * policy (docs/release-checklist.md): while major === 0, a 'major' bump is softened to 'minor' (the
 * public API has not stabilised). Returns null for 'none' or an unparseable current version.
 */
export function nextVersion(current: string, kind: BumpKind): string | null {
  if (kind === 'none') return null
  const parsed = parseVersion(current)
  if (!parsed) return null
  let { major, minor, patch } = parsed
  const effective = kind === 'major' && major === 0 ? 'minor' : kind
  if (effective === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (effective === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `${major}.${minor}.${patch}`
}
