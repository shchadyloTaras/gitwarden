import { describe, it, expect } from 'vitest'
import {
  CommitDetailsParseError,
  parseCommitDetails,
  parseCommitMetadata,
  parseNameStatus,
} from '../../src/core/parsers/CommitDetailsParser'

// Metadata fixture: <fullHash>\0<shortHash>\0<authorName>\0<authorEmail>\0<date>\0<subject>\0<parentHashes>
function metadataFixture(fields: [string, string, string, string, string, string, string]): string {
  return fields.join('\0')
}

// Name-status fixture mirrors `--name-status -z`: each token individually NUL-terminated.
function nameStatusFixture(...tokens: string[]): string {
  return tokens.map((t) => t + '\0').join('')
}

describe('parseCommitMetadata', () => {
  it('parses a normal commit with one parent', () => {
    const raw = metadataFixture([
      'abc123full',
      'abc123',
      'Ada Lovelace',
      'ada@example.com',
      '2026-07-20T10:00:00+00:00',
      'Fix the thing',
      'parent1full',
    ])
    const { commit, parentHashes } = parseCommitMetadata(raw)
    expect(commit).toEqual({
      fullHash: 'abc123full',
      shortHash: 'abc123',
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      date: '2026-07-20T10:00:00+00:00',
      message: 'Fix the thing',
    })
    expect(parentHashes).toEqual(['parent1full'])
  })

  it('parses a root commit with zero parents', () => {
    const raw = metadataFixture([
      'root123full',
      'root123',
      'Ada Lovelace',
      'ada@example.com',
      '2026-01-01T00:00:00+00:00',
      'Initial commit',
      '',
    ])
    const { parentHashes } = parseCommitMetadata(raw)
    expect(parentHashes).toEqual([])
  })

  it('parses a merge commit with multiple parents', () => {
    const raw = metadataFixture([
      'merge123full',
      'merge123',
      'Ada Lovelace',
      'ada@example.com',
      '2026-07-20T10:00:00+00:00',
      'Merge branch feature',
      'parent1full parent2full',
    ])
    const { parentHashes } = parseCommitMetadata(raw)
    expect(parentHashes).toEqual(['parent1full', 'parent2full'])
  })

  it('preserves spaces and Unicode in author name and subject', () => {
    const raw = metadataFixture([
      'uni123full',
      'uni123',
      'Тарас Щадило',
      'taras@example.com',
      '2026-07-20T10:00:00+00:00',
      'Fix "quoted" path with spaces and emoji 🎉',
      '',
    ])
    const { commit } = parseCommitMetadata(raw)
    expect(commit.authorName).toBe('Тарас Щадило')
    expect(commit.message).toBe('Fix "quoted" path with spaces and emoji 🎉')
  })

  it('rejects malformed metadata with too few fields', () => {
    const raw = ['abc123full', 'abc123', 'Ada Lovelace'].join('\0')
    expect(() => parseCommitMetadata(raw)).toThrow(CommitDetailsParseError)
  })

  it('rejects malformed metadata with too many fields', () => {
    const raw =
      metadataFixture([
        'abc123full',
        'abc123',
        'Ada Lovelace',
        'ada@example.com',
        '2026-07-20T10:00:00+00:00',
        'Fix the thing',
        'parent1full',
      ]) + '\0extra'
    expect(() => parseCommitMetadata(raw)).toThrow(CommitDetailsParseError)
  })

  it('rejects metadata with a missing hash', () => {
    const raw = metadataFixture([
      '',
      'abc123',
      'Ada Lovelace',
      'ada@example.com',
      '2026-07-20T10:00:00+00:00',
      'Fix the thing',
      '',
    ])
    expect(() => parseCommitMetadata(raw)).toThrow(CommitDetailsParseError)
  })
})

describe('parseNameStatus', () => {
  it('parses added, modified, deleted, and type-changed files', () => {
    const raw = nameStatusFixture(
      'A',
      'src/new.ts',
      'M',
      'src/existing.ts',
      'D',
      'src/gone.ts',
      'T',
      'src/symlink-now-file.ts'
    )
    const files = parseNameStatus(raw)
    expect(files).toEqual([
      { status: 'added', path: 'src/new.ts' },
      { status: 'modified', path: 'src/existing.ts' },
      { status: 'deleted', path: 'src/gone.ts' },
      { status: 'typeChanged', path: 'src/symlink-now-file.ts' },
    ])
  })

  it('parses rename and copy records with similarity scores', () => {
    const raw = nameStatusFixture(
      'R100',
      'src/old-name.ts',
      'src/new-name.ts',
      'C075',
      'src/original.ts',
      'src/copy.ts'
    )
    const files = parseNameStatus(raw)
    expect(files).toEqual([
      {
        status: 'renamed',
        path: 'src/new-name.ts',
        previousPath: 'src/old-name.ts',
        similarity: 100,
      },
      { status: 'copied', path: 'src/copy.ts', previousPath: 'src/original.ts', similarity: 75 },
    ])
  })

  it('preserves spaces and Unicode paths', () => {
    const raw = nameStatusFixture('M', 'src/файл з пробілами.ts')
    const files = parseNameStatus(raw)
    expect(files).toEqual([{ status: 'modified', path: 'src/файл з пробілами.ts' }])
  })

  it('returns an empty array for empty file output', () => {
    expect(parseNameStatus('')).toEqual([])
  })

  it('preserves an unknown status code without dropping its path', () => {
    const raw = nameStatusFixture('X', 'src/mystery.ts')
    const files = parseNameStatus(raw)
    expect(files).toEqual([{ status: 'unknown', path: 'src/mystery.ts' }])
  })

  it('marks an unmerged (conflict) file', () => {
    const raw = nameStatusFixture('U', 'src/conflicted.ts')
    const files = parseNameStatus(raw)
    expect(files).toEqual([{ status: 'unmerged', path: 'src/conflicted.ts' }])
  })

  it('rejects a truncated rename record missing the new path', () => {
    const raw = 'R100\0src/old-name.ts\0'
    expect(() => parseNameStatus(raw)).toThrow(CommitDetailsParseError)
  })

  it('rejects a truncated copy record missing both paths', () => {
    const raw = 'C100\0'
    expect(() => parseNameStatus(raw)).toThrow(CommitDetailsParseError)
  })

  it('rejects a truncated single-path record missing its path', () => {
    const raw = 'M\0'
    expect(() => parseNameStatus(raw)).toThrow(CommitDetailsParseError)
  })
})

describe('parseCommitDetails', () => {
  it('assembles metadata, files, and patch into GitCommitDetails', () => {
    const metadataRaw = metadataFixture([
      'abc123full',
      'abc123',
      'Ada Lovelace',
      'ada@example.com',
      '2026-07-20T10:00:00+00:00',
      'Fix the thing',
      'parent1full',
    ])
    const nameStatusRaw = nameStatusFixture('M', 'src/existing.ts')
    const patch = '--- a/src/existing.ts\n+++ b/src/existing.ts\n@@ -1 +1 @@\n-old\n+new\n'

    const details = parseCommitDetails({ metadataRaw, nameStatusRaw, patch })

    expect(details.commit.fullHash).toBe('abc123full')
    expect(details.parentHashes).toEqual(['parent1full'])
    expect(details.files).toEqual([{ status: 'modified', path: 'src/existing.ts' }])
    expect(details.patch).toBe(patch)
  })

  it('passes a binary patch marker through unmodified', () => {
    const metadataRaw = metadataFixture([
      'bin123full',
      'bin123',
      'Ada Lovelace',
      'ada@example.com',
      '2026-07-20T10:00:00+00:00',
      'Add binary asset',
      '',
    ])
    const nameStatusRaw = nameStatusFixture('A', 'assets/logo.png')
    const patch = 'Binary files /dev/null and b/assets/logo.png differ\n'

    const details = parseCommitDetails({ metadataRaw, nameStatusRaw, patch })

    expect(details.files).toEqual([{ status: 'added', path: 'assets/logo.png' }])
    expect(details.patch).toBe(patch)
  })

  it('propagates a parse error from malformed metadata', () => {
    expect(() =>
      parseCommitDetails({ metadataRaw: 'not\0enough\0fields', nameStatusRaw: '', patch: '' })
    ).toThrow(CommitDetailsParseError)
  })
})
