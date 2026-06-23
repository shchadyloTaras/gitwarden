import { describe, it, expect } from 'vitest'
import { parsePorcelainV2 } from '../../src/core/parsers/PorcelainParser'

// Helper: build a NUL-delimited fixture buffer from an array of tokens.
// Each token in the array becomes a NUL-terminated record, mirroring -z output.
function fixture(...tokens: string[]): Buffer {
  return Buffer.from(tokens.map((t) => t + '\0').join(''), 'utf8')
}

describe('parsePorcelainV2', () => {
  it('parses branch headers correctly', () => {
    const buf = fixture(
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1'
    )
    const status = parsePorcelainV2(buf)
    expect(status.branch).toBe('main')
    expect(status.upstream).toBe('origin/main')
    expect(status.ahead).toBe(2)
    expect(status.behind).toBe(1)
    expect(status.files).toHaveLength(0)
  })

  it('handles detached HEAD (branch undefined)', () => {
    const buf = fixture('# branch.head (detached)')
    const status = parsePorcelainV2(buf)
    expect(status.branch).toBeUndefined()
  })

  it('returns zeros for ahead/behind when no upstream', () => {
    const buf = fixture('# branch.head main')
    const status = parsePorcelainV2(buf)
    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
    expect(status.upstream).toBeUndefined()
  })

  it('parses a file that is staged AND further modified in the worktree (X≠. and Y≠.)', () => {
    // XY = "MM" — added to index (staged edit) and also modified in worktree
    const buf = fixture(
      '# branch.head main',
      '1 MM N... 100644 100644 100644 abc123 def456 src/app.ts'
    )
    const status = parsePorcelainV2(buf)
    expect(status.files).toHaveLength(1)
    const f = status.files[0]
    expect(f.path).toBe('src/app.ts')
    expect(f.indexStatus).toBe('modified')
    expect(f.worktreeStatus).toBe('modified')
  })

  it('parses a staged addition (AM — added in index, modified in worktree)', () => {
    const buf = fixture(
      '# branch.head feature',
      '1 AM N... 000000 100644 100644 0000000 abc1234 new-file.ts'
    )
    const status = parsePorcelainV2(buf)
    const f = status.files[0]
    expect(f.indexStatus).toBe('added')
    expect(f.worktreeStatus).toBe('modified')
  })

  it('parses a rename entry consuming the extra NUL token for origPath', () => {
    // Rename: 2 R. ... R100 newname.ts\0oldname.ts\0
    const buf = fixture(
      '# branch.head main',
      '2 R. N... 100644 100644 100644 abc123 def456 R100 new/name.ts',
      'old/name.ts' // origPath — separate NUL-delimited token
    )
    const status = parsePorcelainV2(buf)
    expect(status.files).toHaveLength(1)
    const f = status.files[0]
    expect(f.path).toBe('new/name.ts')
    expect(f.originalPath).toBe('old/name.ts')
    expect(f.indexStatus).toBe('renamed')
    expect(f.worktreeStatus).toBe('unmodified')
  })

  it('parses an untracked file', () => {
    const buf = fixture('# branch.head main', '? untracked.ts')
    const status = parsePorcelainV2(buf)
    expect(status.files).toHaveLength(1)
    const f = status.files[0]
    expect(f.path).toBe('untracked.ts')
    expect(f.indexStatus).toBe('untracked')
    expect(f.worktreeStatus).toBe('untracked')
  })

  it('parses a conflict (unmerged) entry', () => {
    // u AA N... 100644 100644 100644 100644 hash1 hash2 hash3 conflicted.ts
    const buf = fixture(
      '# branch.head main',
      'u AA N... 100644 100644 100644 100644 aaaa bbbb cccc conflicted.ts'
    )
    const status = parsePorcelainV2(buf)
    expect(status.files).toHaveLength(1)
    const f = status.files[0]
    expect(f.path).toBe('conflicted.ts')
    expect(f.indexStatus).toBe('conflicted')
    expect(f.worktreeStatus).toBe('conflicted')
  })

  it('parses a path with spaces', () => {
    const buf = fixture('# branch.head main', '1 M. N... 100644 100644 100644 abc def src/my file with spaces.ts')
    const status = parsePorcelainV2(buf)
    expect(status.files[0].path).toBe('src/my file with spaces.ts')
  })

  it('parses a path with unicode characters', () => {
    const buf = fixture('# branch.head main', '? src/компонент/файл.ts')
    const status = parsePorcelainV2(buf)
    expect(status.files[0].path).toBe('src/компонент/файл.ts')
  })

  it('skips ignored entries (!)', () => {
    const buf = fixture('# branch.head main', '! dist/bundle.js', '? real.ts')
    const status = parsePorcelainV2(buf)
    expect(status.files).toHaveLength(1)
    expect(status.files[0].path).toBe('real.ts')
  })

  it('handles multiple entries of mixed types', () => {
    const buf = fixture(
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +0 -0',
      '1 M. N... 100644 100644 100644 aaa bbb modified.ts',
      '1 .D N... 100644 100644 100644 ccc ddd deleted.ts',
      '2 R. N... 100644 100644 100644 eee fff R100 renamed-new.ts',
      'renamed-old.ts',
      '? untracked.ts',
      'u UU N... 100644 100644 100644 100644 g h i conflict.ts'
    )
    const status = parsePorcelainV2(buf)
    expect(status.files).toHaveLength(5)

    const [mod, del, ren, unt, con] = status.files
    expect(mod.indexStatus).toBe('modified')
    expect(mod.worktreeStatus).toBe('unmodified')
    expect(del.indexStatus).toBe('unmodified')
    expect(del.worktreeStatus).toBe('deleted')
    expect(ren.path).toBe('renamed-new.ts')
    expect(ren.originalPath).toBe('renamed-old.ts')
    expect(unt.indexStatus).toBe('untracked')
    expect(con.indexStatus).toBe('conflicted')
    expect(con.worktreeStatus).toBe('conflicted')
  })

  it('returns empty status for empty output (brand new empty repo)', () => {
    const buf = fixture('# branch.head main')
    const status = parsePorcelainV2(buf)
    expect(status.files).toHaveLength(0)
    expect(status.branch).toBe('main')
  })
})
