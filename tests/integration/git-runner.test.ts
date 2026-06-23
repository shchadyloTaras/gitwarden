import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, chmod } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitError } from '../../src/main/git/ErrorMapper'

const execFileAsync = promisify(execFile)

describe('GitRunner integration', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let runner: GitRunner

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gr-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', repoPath])
    await execFileAsync('git', ['-C', repoPath, 'config', 'user.name', 'Test User'])
    await execFileAsync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com'])
    runner = new GitRunner(gitPath)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('runs a real git command in a temp repo', async () => {
    const result = await runner.run({
      args: ['status', '--porcelain=v2', '-z', '--branch'],
      cwd: repoPath,
      readOnly: true,
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toBeInstanceOf(Buffer)
    // A fresh repo should reference the initial branch
    expect(result.stdout.toString()).toContain('branch.head')
  })

  it('captures stdout as Buffer and stderr as string', async () => {
    const result = await runner.run({
      args: ['rev-parse', '--is-inside-work-tree'],
      cwd: repoPath,
      readOnly: true,
    })
    expect(result.stdout).toBeInstanceOf(Buffer)
    expect(result.stdout.toString().trim()).toBe('true')
    expect(typeof result.stderr).toBe('string')
  })

  it('rejects with GitError on non-zero exit code', async () => {
    await expect(
      runner.run({
        args: ['checkout', 'nonexistent-branch-xyz-abc'],
        cwd: repoPath,
        readOnly: false,
      })
    ).rejects.toBeInstanceOf(GitError)
  })

  it('rejects with GitError carrying correct error code', async () => {
    const err = await runner
      .run({ args: ['checkout', 'nonexistent-xyz'], cwd: repoPath, readOnly: false })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitError)
    expect((err as GitError).code).toBe('branchNotFound')
  })

  it('serializes concurrent mutating ops per cwd', async () => {
    const p1 = runner.run({
      args: ['config', 'user.name', 'Alice'],
      cwd: repoPath,
      readOnly: false,
    })
    const p2 = runner.run({
      args: ['config', 'user.email', 'alice@example.com'],
      cwd: repoPath,
      readOnly: false,
    })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.code).toBe(0)
    expect(r2.code).toBe(0)

    const nameResult = await runner.run({
      args: ['config', 'user.name'],
      cwd: repoPath,
      readOnly: true,
    })
    expect(nameResult.stdout.toString().trim()).toBe('Alice')
  })

  it('creates a commit and reads it back via git log', async () => {
    await writeFile(path.join(repoPath, 'hello.txt'), 'hello world')
    await runner.run({ args: ['add', '--', 'hello.txt'], cwd: repoPath, readOnly: false })
    await runner.run({ args: ['commit', '-m', 'initial commit'], cwd: repoPath, readOnly: false })

    const log = await runner.run({
      args: ['log', '--oneline'],
      cwd: repoPath,
      readOnly: true,
    })
    expect(log.stdout.toString()).toContain('initial commit')
  })

  it('rejects immediately when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      runner.run({
        args: ['status'],
        cwd: repoPath,
        readOnly: true,
        signal: controller.signal,
      })
    ).rejects.toThrow('cancelled')
  })

  it.skipIf(process.platform === 'win32')(
    'kills the child process when AbortSignal fires mid-run',
    async () => {
      const fakeGit = path.join(tmpDir, 'fake-git.sh')
      await writeFile(fakeGit, '#!/bin/sh\nsleep 30\n')
      await chmod(fakeGit, 0o755)

      const slowRunner = new GitRunner(fakeGit)
      const controller = new AbortController()

      const promise = slowRunner.run({
        args: ['--version'],
        cwd: repoPath,
        readOnly: true,
        signal: controller.signal,
      })

      setTimeout(() => controller.abort(), 50)

      await expect(promise).rejects.toThrow('cancelled')
    }
  )
})
