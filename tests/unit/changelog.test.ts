import { describe, it, expect } from 'vitest'
import { parseGitLog, FIELD_SEP, RECORD_SEP } from '../../src/core/changelog/commits'

function record(hash: string, subject: string, body: string, files: string[]): string {
  return `${RECORD_SEP}${hash}${FIELD_SEP}${subject}${FIELD_SEP}${body}${FIELD_SEP}\n${files.join('\n')}\n`
}

describe('parseGitLog', () => {
  it('parses hash, subject, body and files for each commit record', () => {
    const raw =
      record('abc123', 'feat: a', 'body line', ['src/a.ts', 'src/b.ts']) +
      record('def456', 'fix: b', '', ['landing/x.astro'])
    expect(parseGitLog(raw)).toEqual([
      { hash: 'abc123', subject: 'feat: a', body: 'body line', files: ['src/a.ts', 'src/b.ts'] },
      { hash: 'def456', subject: 'fix: b', body: '', files: ['landing/x.astro'] },
    ])
  })

  it('returns an empty array for empty output', () => {
    expect(parseGitLog('')).toEqual([])
  })

  it('keeps a body that contains newlines intact and tolerates no files', () => {
    const raw = `${RECORD_SEP}h1${FIELD_SEP}sub${FIELD_SEP}line1\nline2${FIELD_SEP}\n`
    expect(parseGitLog(raw)).toEqual([
      { hash: 'h1', subject: 'sub', body: 'line1\nline2', files: [] },
    ])
  })
})

import { filterAppCommits } from '../../src/core/changelog/commits'

function c(
  subject: string,
  files: string[]
): { hash: string; subject: string; body: string; files: string[] } {
  return { hash: 'h', subject, body: '', files }
}

describe('filterAppCommits', () => {
  it('drops commits whose every file is under landing/', () => {
    const result = filterAppCommits([c('feat(landing): x', ['landing/a.astro', 'landing/b.css'])])
    expect(result).toEqual([])
  })

  it('keeps commits that touch any non-landing path (even mixed)', () => {
    const mixed = c('feat: x', ['src/a.ts', 'landing/b.astro'])
    const app = c('fix: y', ['src/b.ts'])
    expect(filterAppCommits([mixed, app])).toEqual([mixed, app])
  })

  it('keeps commits that report no files (cannot prove landing-only)', () => {
    const empty = c('chore: merge', [])
    expect(filterAppCommits([empty])).toEqual([empty])
  })
})

import { suggestBump } from '../../src/core/changelog/commits'

describe('suggestBump', () => {
  it('returns none for no commits', () => {
    expect(suggestBump([])).toBe('none')
  })

  it('returns patch when only fixes/chores are present', () => {
    expect(suggestBump([c('fix: a', ['src/a.ts']), c('chore: b', ['src/b.ts'])])).toBe('patch')
  })

  it('returns minor when any feat is present', () => {
    expect(suggestBump([c('fix: a', ['src/a.ts']), c('feat: b', ['src/b.ts'])])).toBe('minor')
  })

  it('returns major on a "!" marker', () => {
    expect(suggestBump([c('feat!: breaking', ['src/a.ts'])])).toBe('major')
  })

  it('returns major on a BREAKING CHANGE body', () => {
    expect(
      suggestBump([
        { hash: 'h', subject: 'fix: a', body: 'BREAKING CHANGE: x', files: ['src/a.ts'] },
      ])
    ).toBe('major')
  })

  it('returns major on a mid-body BREAKING CHANGE (newline branch)', () => {
    expect(
      suggestBump([
        {
          hash: 'h',
          subject: 'fix: a',
          body: 'some text\nBREAKING CHANGE: drops X',
          files: ['src/a.ts'],
        },
      ])
    ).toBe('major')
  })
})

import { nextVersion } from '../../src/core/changelog/commits'

describe('nextVersion', () => {
  it('bumps patch and minor normally', () => {
    expect(nextVersion('0.1.1', 'patch')).toBe('0.1.2')
    expect(nextVersion('0.1.1', 'minor')).toBe('0.2.0')
  })

  it('softens a major bump to minor while major is 0 (pre-1.0 policy)', () => {
    expect(nextVersion('0.1.1', 'major')).toBe('0.2.0')
  })

  it('bumps major normally once major >= 1', () => {
    expect(nextVersion('1.4.2', 'major')).toBe('2.0.0')
  })

  it('returns null for none or an unparseable current version', () => {
    expect(nextVersion('0.1.1', 'none')).toBeNull()
    expect(nextVersion('not-a-version', 'patch')).toBeNull()
  })
})

import { rollUnreleased } from '../../src/core/changelog/render'

const REPO = 'https://github.com/shchadyloTaras/gitwarden'
const SAMPLE = `# Changelog

## [Unreleased]

### Added

- New thing.

## [0.1.1] — 2026-06-28

### Fixed

- Old fix.

[0.1.1]: ${REPO}/compare/v0.1.0...v0.1.1
[0.1.0]: ${REPO}/releases/tag/v0.1.0
`

describe('rollUnreleased', () => {
  it('renames [Unreleased] to a dated version, re-opens an empty [Unreleased], and adds the link', () => {
    const { text, alreadyRolled } = rollUnreleased(SAMPLE, '0.2.0', '2026-06-30', REPO, 'v0.1.1')
    expect(alreadyRolled).toBe(false)
    expect(text).toContain('## [Unreleased]\n\n## [0.2.0] — 2026-06-30')
    expect(text).toContain('### Added\n\n- New thing.')
    expect(text).toContain(`[0.2.0]: ${REPO}/compare/v0.1.1...v0.2.0\n[0.1.1]:`)
    // exactly one [Unreleased] heading
    expect(text.match(/^## \[Unreleased\]/gm)?.length).toBe(1)
    // the freshly re-opened [Unreleased] is empty — next heading after it is [0.2.0]
    expect(text).toContain('## [Unreleased]\n\n## [0.2.0]')
    // section order: [Unreleased] → [0.2.0] → [0.1.1]
    const idxUnreleased = text.indexOf('## [Unreleased]')
    const idx020 = text.indexOf('## [0.2.0]')
    const idx011 = text.indexOf('## [0.1.1]')
    expect(idxUnreleased).toBeLessThan(idx020)
    expect(idx020).toBeLessThan(idx011)
  })

  it('is idempotent when the version section already exists', () => {
    const once = rollUnreleased(SAMPLE, '0.2.0', '2026-06-30', REPO, 'v0.1.1').text
    const twice = rollUnreleased(once, '0.2.0', '2026-06-30', REPO, 'v0.1.1')
    expect(twice.alreadyRolled).toBe(true)
    expect(twice.text).toBe(once)
  })

  it('uses a release-tag link when there is no previous tag (first release)', () => {
    const { text } = rollUnreleased(SAMPLE, '0.2.0', '2026-06-30', REPO, '')
    expect(text).toContain(`[0.2.0]: ${REPO}/releases/tag/v0.2.0`)
  })

  it('throws when there is no [Unreleased] heading', () => {
    expect(() =>
      rollUnreleased('# Changelog\n\n## [0.1.0] — x\n', '0.2.0', 'd', REPO, 'v0.1.0')
    ).toThrow(/Unreleased/)
  })
})
