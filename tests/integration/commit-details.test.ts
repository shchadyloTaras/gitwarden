import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('GitService.getCommitDetails integration (Phase 111)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gs-commit-details-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns authoritative metadata and a modified file for a normal commit', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'v1\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'init')

    await writeFile(path.join(repoPath, 'base.txt'), 'v2\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'update base')
    const hash = await git(repoPath, 'rev-parse', 'HEAD')
    const parentHash = await git(repoPath, 'rev-parse', 'HEAD~1')

    const details = await service.getCommitDetails(repoPath, hash)

    expect(details.commit.fullHash).toBe(hash)
    expect(details.commit.message).toBe('update base')
    expect(details.commit.authorName).toBe('Test User')
    expect(details.commit.authorEmail).toBe('test@example.com')
    expect(details.parentHashes).toEqual([parentHash])
    expect(details.files).toEqual([{ status: 'modified', path: 'base.txt' }])
    expect(details.patch).toContain('-v1')
    expect(details.patch).toContain('+v2')
  })

  it('reports every file as added for a root commit', async () => {
    await writeFile(path.join(repoPath, 'root.txt'), 'first content\n')
    await git(repoPath, 'add', 'root.txt')
    await git(repoPath, 'commit', '-m', 'root commit')
    const hash = await git(repoPath, 'rev-parse', 'HEAD')

    const details = await service.getCommitDetails(repoPath, hash)

    expect(details.parentHashes).toEqual([])
    expect(details.files).toEqual([{ status: 'added', path: 'root.txt' }])
    expect(details.patch).toContain('+first content')
  })

  it('detects a rename with a similarity score', async () => {
    await writeFile(path.join(repoPath, 'old.ts'), 'export const a = 1\n')
    await git(repoPath, 'add', 'old.ts')
    await git(repoPath, 'commit', '-m', 'init')

    await git(repoPath, 'mv', 'old.ts', 'new.ts')
    await git(repoPath, 'commit', '-m', 'rename file')
    const hash = await git(repoPath, 'rev-parse', 'HEAD')

    const details = await service.getCommitDetails(repoPath, hash)

    expect(details.files).toEqual([
      { status: 'renamed', path: 'new.ts', previousPath: 'old.ts', similarity: 100 },
    ])
  })

  it('detects a deletion', async () => {
    await writeFile(path.join(repoPath, 'gone.txt'), 'temporary\n')
    await git(repoPath, 'add', 'gone.txt')
    await git(repoPath, 'commit', '-m', 'init')

    await git(repoPath, 'rm', 'gone.txt')
    await git(repoPath, 'commit', '-m', 'remove file')
    const hash = await git(repoPath, 'rev-parse', 'HEAD')

    const details = await service.getCommitDetails(repoPath, hash)

    expect(details.files).toEqual([{ status: 'deleted', path: 'gone.txt' }])
  })

  it('preserves a Unicode file path', async () => {
    const fileName = 'файл з пробілами 🎉.txt'
    await writeFile(path.join(repoPath, fileName), 'content\n')
    await git(repoPath, 'add', fileName)
    await git(repoPath, 'commit', '-m', 'add unicode file')
    const hash = await git(repoPath, 'rev-parse', 'HEAD')

    const details = await service.getCommitDetails(repoPath, hash)

    expect(details.files).toEqual([{ status: 'added', path: fileName }])
  })

  it('reports a binary file truthfully with a binary-diff marker', async () => {
    await writeFile(path.join(repoPath, 'asset.bin'), Buffer.from([0x00, 0x01, 0x02, 0xff]))
    await git(repoPath, 'add', 'asset.bin')
    await git(repoPath, 'commit', '-m', 'add binary asset')
    const hash = await git(repoPath, 'rev-parse', 'HEAD')

    const details = await service.getCommitDetails(repoPath, hash)

    expect(details.files).toEqual([{ status: 'added', path: 'asset.bin' }])
    expect(details.patch).toContain('Binary files')
  })

  it('uses first-parent semantics for a merge commit', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'base\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')

    await git(repoPath, 'checkout', '-b', 'feature')
    await writeFile(path.join(repoPath, 'feature.txt'), 'feature work\n')
    await git(repoPath, 'add', 'feature.txt')
    await git(repoPath, 'commit', '-m', 'feature commit')
    const featureHash = await git(repoPath, 'rev-parse', 'HEAD')

    await git(repoPath, 'checkout', 'main')
    await writeFile(path.join(repoPath, 'main-only.txt'), 'main work\n')
    await git(repoPath, 'add', 'main-only.txt')
    await git(repoPath, 'commit', '-m', 'c2')
    const mainHash = await git(repoPath, 'rev-parse', 'HEAD')

    await git(repoPath, 'merge', '--no-edit', 'feature')
    const mergeHash = await git(repoPath, 'rev-parse', 'HEAD')

    const details = await service.getCommitDetails(repoPath, mergeHash)

    expect(details.commit.fullHash).toBe(mergeHash)
    expect(details.parentHashes).toEqual([mainHash, featureHash])
    // First-parent diff (mergeHash vs mainHash) shows only what the merge itself
    // introduced relative to main — the feature file, not main-only.txt (already on main).
    expect(details.files).toEqual([{ status: 'added', path: 'feature.txt' }])
  })

  it('does not mutate the working tree (read-only)', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'v1\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'init')
    const hash = await git(repoPath, 'rev-parse', 'HEAD')

    await service.getCommitDetails(repoPath, hash)

    expect(await git(repoPath, 'status', '--porcelain')).toBe('')
  })
})
