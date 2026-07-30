import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, stat, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import type { GitError } from '../../src/main/git/ErrorMapper'
import { GitService } from '../../src/main/services/GitService'
import { removeTempDir } from '../fixtures/tempDir'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('GitService.mergeBranch integration (Phase 82)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gs-merge-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    await removeTempDir(tmpDir)
  })

  it('fast-forwards when the target branch is a direct ancestor', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')

    await git(repoPath, 'checkout', '-b', 'feature')
    await writeFile(path.join(repoPath, 'feature.txt'), 'feature work\n')
    await git(repoPath, 'add', 'feature.txt')
    await git(repoPath, 'commit', '-m', 'feature commit')

    await git(repoPath, 'checkout', 'main')
    await expect(service.mergeBranch(repoPath, 'feature')).resolves.toBeUndefined()

    expect(await git(repoPath, 'show', '-s', '--format=%s', 'HEAD')).toBe('feature commit')
    expect(await git(repoPath, 'show', 'HEAD:feature.txt')).toBe('feature work')
  })

  it('creates a merge commit for a true 3-way (non-fast-forwardable) merge', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')

    await git(repoPath, 'checkout', '-b', 'feature')
    await writeFile(path.join(repoPath, 'feature.txt'), 'feature work\n')
    await git(repoPath, 'add', 'feature.txt')
    await git(repoPath, 'commit', '-m', 'feature commit')

    await git(repoPath, 'checkout', 'main')
    await writeFile(path.join(repoPath, 'main-only.txt'), 'main work\n')
    await git(repoPath, 'add', 'main-only.txt')
    await git(repoPath, 'commit', '-m', 'main commit')

    await expect(service.mergeBranch(repoPath, 'feature')).resolves.toBeUndefined()

    const parents = await git(repoPath, 'show', '-s', '--format=%P', 'HEAD')
    expect(parents.split(' ')).toHaveLength(2)
    expect(await git(repoPath, 'show', 'HEAD:feature.txt')).toBe('feature work')
    expect(await git(repoPath, 'show', 'HEAD:main-only.txt')).toBe('main work')
  })

  it('rejects a conflicting merge as mergeConflict and leaves the repo mid-merge', async () => {
    await writeFile(path.join(repoPath, 'clash.txt'), 'base\n')
    await git(repoPath, 'add', 'clash.txt')
    await git(repoPath, 'commit', '-m', 'c1')

    await git(repoPath, 'checkout', '-b', 'feature')
    await writeFile(path.join(repoPath, 'clash.txt'), 'feature edit\n')
    await git(repoPath, 'commit', '-am', 'feature edit')

    await git(repoPath, 'checkout', 'main')
    await writeFile(path.join(repoPath, 'clash.txt'), 'main edit\n')
    await git(repoPath, 'commit', '-am', 'main edit')

    await expect(service.mergeBranch(repoPath, 'feature')).rejects.toMatchObject({
      code: 'mergeConflict',
    } satisfies Partial<GitError>)

    await expect(stat(path.join(repoPath, '.git', 'MERGE_HEAD'))).resolves.toBeDefined()
    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'clash.txt')
    expect(f?.indexStatus).toBe('conflicted')
    expect(f?.worktreeStatus).toBe('conflicted')
  })

  it('is a successful no-op when the branch is already up to date', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')
    await git(repoPath, 'branch', 'already-merged')

    const before = await git(repoPath, 'rev-parse', 'HEAD')
    await expect(service.mergeBranch(repoPath, 'already-merged')).resolves.toBeUndefined()
    expect(await git(repoPath, 'rev-parse', 'HEAD')).toBe(before)
  })
})
