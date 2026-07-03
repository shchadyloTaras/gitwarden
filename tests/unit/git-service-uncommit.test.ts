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

describe('GitService uncommit primitives integration', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gs-uncommit-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  /** A local bare repo as the "remote", with `main` pushed and tracking set up. */
  async function setUpTrackedRemote(): Promise<{ remote: string }> {
    const remote = path.join(tmpDir, 'remote.git')
    await execFileAsync('git', ['init', '--bare', '-b', 'main', remote])
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')
    await git(repoPath, 'remote', 'add', 'origin', remote)
    await git(repoPath, 'push', '-u', 'origin', 'main')
    return { remote }
  }

  describe('getUnpushedCount', () => {
    it('reports hasUpstream: false and the full local count before the first push', async () => {
      const remote = path.join(tmpDir, 'remote.git')
      await execFileAsync('git', ['init', '--bare', '-b', 'main', remote])
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      await git(repoPath, 'remote', 'add', 'origin', remote)

      const result = await service.getUnpushedCount(repoPath, 'origin', 'main')
      expect(result).toEqual({ count: 1, hasUpstream: false })
    })

    it('reports hasUpstream: true and count 0 right after a push', async () => {
      await setUpTrackedRemote()
      const result = await service.getUnpushedCount(repoPath, 'origin', 'main')
      expect(result).toEqual({ count: 0, hasUpstream: true })
    })

    it('counts commits made after the push as unpushed', async () => {
      await setUpTrackedRemote()
      await writeFile(path.join(repoPath, 'second.txt'), 'two\n')
      await git(repoPath, 'add', 'second.txt')
      await git(repoPath, 'commit', '-m', 'c2')

      const result = await service.getUnpushedCount(repoPath, 'origin', 'main')
      expect(result).toEqual({ count: 1, hasUpstream: true })
    })
  })

  describe('resetMixed', () => {
    it('returns a single unpushed commit as unstaged changes and drops ahead by 1', async () => {
      await setUpTrackedRemote()
      await writeFile(path.join(repoPath, 'second.txt'), 'two\n')
      await git(repoPath, 'add', 'second.txt')
      await git(repoPath, 'commit', '-m', 'c2')
      expect((await service.getStatus(repoPath)).ahead).toBe(1)

      await service.resetMixed(repoPath, 'HEAD~1')

      const status = await service.getStatus(repoPath)
      expect(status.ahead).toBe(0)
      const f = status.files.find((c) => c.path === 'second.txt')
      expect(f).toBeDefined()
      expect(f!.worktreeStatus).toBe('untracked')
    })

    it('collapses three unpushed commits into one unstaged working set', async () => {
      await setUpTrackedRemote()
      for (const name of ['c2', 'c3', 'c4']) {
        await writeFile(path.join(repoPath, `${name}.txt`), `${name}\n`)
        await git(repoPath, 'add', `${name}.txt`)
        await git(repoPath, 'commit', '-m', name)
      }
      expect((await service.getStatus(repoPath)).ahead).toBe(3)

      await service.resetMixed(repoPath, 'HEAD~3')

      const status = await service.getStatus(repoPath)
      expect(status.ahead).toBe(0)
      for (const name of ['c2', 'c3', 'c4']) {
        const f = status.files.find((c) => c.path === `${name}.txt`)
        expect(f).toBeDefined()
        expect(f!.worktreeStatus).toBe('untracked')
      }
    })
  })

  describe('getUncommitContext', () => {
    it('reports headIsMerge: true on a real merge commit', async () => {
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      await git(repoPath, 'checkout', '-b', 'feature')
      await writeFile(path.join(repoPath, 'feature.txt'), 'feature\n')
      await git(repoPath, 'add', 'feature.txt')
      await git(repoPath, 'commit', '-m', 'feature-commit')
      await git(repoPath, 'checkout', 'main')
      await writeFile(path.join(repoPath, 'main-only.txt'), 'main\n')
      await git(repoPath, 'add', 'main-only.txt')
      await git(repoPath, 'commit', '-m', 'main-commit')
      await git(repoPath, 'merge', '--no-edit', 'feature')

      const ctx = await service.getUncommitContext(repoPath)
      expect(ctx.headIsMerge).toBe(true)
    })

    it('reports headIsRoot: true on the very first commit', async () => {
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')

      const ctx = await service.getUncommitContext(repoPath)
      expect(ctx.headIsRoot).toBe(true)
      expect(ctx.headIsMerge).toBe(false)
    })

    it('reports hasUpstream: false with no remote configured', async () => {
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      await writeFile(path.join(repoPath, 'second.txt'), 'two\n')
      await git(repoPath, 'add', 'second.txt')
      await git(repoPath, 'commit', '-m', 'c2')

      const ctx = await service.getUncommitContext(repoPath)
      expect(ctx.hasUpstream).toBe(false)
      expect(ctx.unpushedCount).toBe(2)
      expect(ctx.headIsRoot).toBe(false)
    })
  })
})
