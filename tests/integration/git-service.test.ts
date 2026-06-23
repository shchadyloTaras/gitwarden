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

describe('GitService.getStatus integration', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gs-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns empty files and branch name for a fresh repo', async () => {
    const status = await service.getStatus(repoPath)
    expect(status.files).toHaveLength(0)
    expect(typeof status.branch === 'string' || status.branch === undefined).toBe(true)
    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
  })

  it('detects an untracked file', async () => {
    await writeFile(path.join(repoPath, 'hello.ts'), 'const x = 1')
    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'hello.ts')
    expect(f).toBeDefined()
    expect(f!.indexStatus).toBe('untracked')
    expect(f!.worktreeStatus).toBe('untracked')
  })

  it('detects a staged new file', async () => {
    await writeFile(path.join(repoPath, 'staged.ts'), 'export const a = 1')
    await git(repoPath, 'add', 'staged.ts')
    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'staged.ts')
    expect(f).toBeDefined()
    expect(f!.indexStatus).toBe('added')
    expect(f!.worktreeStatus).toBe('unmodified')
  })

  it('detects a file staged AND further modified in the worktree', async () => {
    // Create initial commit so we have a tracked file
    await writeFile(path.join(repoPath, 'base.ts'), 'v1')
    await git(repoPath, 'add', 'base.ts')
    await git(repoPath, 'commit', '-m', 'init')

    // Stage an edit
    await writeFile(path.join(repoPath, 'base.ts'), 'v2')
    await git(repoPath, 'add', 'base.ts')

    // Make another worktree change (not staged)
    await writeFile(path.join(repoPath, 'base.ts'), 'v3')

    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'base.ts')
    expect(f).toBeDefined()
    expect(f!.indexStatus).toBe('modified') // v1→v2 staged
    expect(f!.worktreeStatus).toBe('modified') // v2→v3 unstaged
  })

  it('detects a rename', async () => {
    await writeFile(path.join(repoPath, 'old.ts'), 'content')
    await git(repoPath, 'add', 'old.ts')
    await git(repoPath, 'commit', '-m', 'init')
    await git(repoPath, 'mv', 'old.ts', 'new.ts')

    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'new.ts')
    expect(f).toBeDefined()
    expect(f!.indexStatus).toBe('renamed')
    expect(f!.originalPath).toBe('old.ts')
  })

  it('detects a conflict (unmerged) entry', async () => {
    // Commit on trunk, create feature branch, then produce a merge conflict
    await git(repoPath, 'checkout', '-b', 'trunk')
    await writeFile(path.join(repoPath, 'clash.ts'), 'trunk content')
    await git(repoPath, 'add', 'clash.ts')
    await git(repoPath, 'commit', '-m', 'initial')

    await git(repoPath, 'checkout', '-b', 'feature')
    await writeFile(path.join(repoPath, 'clash.ts'), 'feature content')
    await git(repoPath, 'add', 'clash.ts')
    await git(repoPath, 'commit', '-m', 'feature edit')

    await git(repoPath, 'checkout', 'trunk')
    await writeFile(path.join(repoPath, 'clash.ts'), 'trunk different')
    await git(repoPath, 'add', 'clash.ts')
    await git(repoPath, 'commit', '-m', 'trunk edit')

    // merge will conflict; ignore the error
    await execFileAsync('git', ['-C', repoPath, 'merge', 'feature']).catch(() => {})

    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'clash.ts')
    expect(f).toBeDefined()
    expect(f!.indexStatus).toBe('conflicted')
    expect(f!.worktreeStatus).toBe('conflicted')
  })

  it('handles a path with spaces', async () => {
    const fileName = 'my file with spaces.ts'
    await writeFile(path.join(repoPath, fileName), 'hello')
    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === fileName)
    expect(f).toBeDefined()
    expect(f!.indexStatus).toBe('untracked')
  })

  it('handles a path with unicode characters', async () => {
    const fileName = 'файл.ts'
    await writeFile(path.join(repoPath, fileName), 'content')
    const status = await service.getStatus(repoPath)
    // git may quote unicode paths — parser must handle NUL-delimited paths with -z
    // (with -z git does NOT quote paths, so we get the raw unicode path)
    const f = status.files.find((c) => c.path === fileName)
    expect(f).toBeDefined()
    expect(f!.indexStatus).toBe('untracked')
  })
})
