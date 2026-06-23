import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, symlink } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { PathValidator } from '../../src/main/git/PathValidator'

const execFileAsync = promisify(execFile)

describe('PathValidator', () => {
  let tmpDir: string
  let gitRepo: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-pv-'))
    gitRepo = path.join(tmpDir, 'repo')
    await mkdir(gitRepo)
    await execFileAsync('git', ['init', gitRepo])
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns the canonical path for a valid git repo', async () => {
    const result = await PathValidator.validate(gitRepo)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // Path should end with the repo name
    expect(path.basename(result)).toBe('repo')
  })

  it('resolves a symlink to the real path', async () => {
    const link = path.join(tmpDir, 'repo-link')
    await symlink(gitRepo, link)
    const result = await PathValidator.validate(link)
    // Should resolve to the real path, not the symlink
    expect(result).not.toBe(link)
  })

  it('rejects a relative path', async () => {
    await expect(PathValidator.validate('./relative/path')).rejects.toThrow('absolute')
  })

  it('rejects an empty string', async () => {
    await expect(PathValidator.validate('')).rejects.toThrow()
  })

  it('rejects a path that does not exist', async () => {
    await expect(PathValidator.validate('/this/path/does/not/exist/xyz123')).rejects.toThrow()
  })

  it('rejects a directory with no .git', async () => {
    const noGit = path.join(tmpDir, 'not-a-repo')
    await mkdir(noGit)
    await expect(PathValidator.validate(noGit)).rejects.toThrow('not a Git repository')
  })
})
