import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, stat, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import { runGitMerge } from '../../src/main/ipc/gitMergeHandler'
import { toIpcFailure } from '../../src/main/ipc/ipcFailure'
import { removeTempDir } from '../fixtures/tempDir'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('git:merge handler (runGitMerge) integration (Phase 83)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gs-merge-ipc-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    await removeTempDir(tmpDir)
  })

  it('merges cleanly on a clean tree and returns ok (no thrown error)', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')

    await git(repoPath, 'checkout', '-b', 'feature')
    await writeFile(path.join(repoPath, 'feature.txt'), 'feature work\n')
    await git(repoPath, 'add', 'feature.txt')
    await git(repoPath, 'commit', '-m', 'feature commit')
    await git(repoPath, 'checkout', 'main')

    await expect(runGitMerge({ git: service }, repoPath, 'feature')).resolves.toBeUndefined()
    expect(await git(repoPath, 'show', 'HEAD:feature.txt')).toBe('feature work')
  })

  it('surfaces a real conflict as mergeConflict with a resolve-conflicts remediation, leaving the repo mid-merge', async () => {
    await writeFile(path.join(repoPath, 'clash.txt'), 'base\n')
    await git(repoPath, 'add', 'clash.txt')
    await git(repoPath, 'commit', '-m', 'c1')

    await git(repoPath, 'checkout', '-b', 'feature')
    await writeFile(path.join(repoPath, 'clash.txt'), 'feature edit\n')
    await git(repoPath, 'commit', '-am', 'feature edit')

    await git(repoPath, 'checkout', 'main')
    await writeFile(path.join(repoPath, 'clash.txt'), 'main edit\n')
    await git(repoPath, 'commit', '-am', 'main edit')

    let caught: unknown
    try {
      await runGitMerge({ git: service }, repoPath, 'feature')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeDefined()

    const failure = toIpcFailure(caught)
    expect(failure.code).toBe('mergeConflict')
    expect(failure.remediation).toMatchObject({ action: 'resolve-conflicts' })

    await expect(stat(path.join(repoPath, '.git', 'MERGE_HEAD'))).resolves.toBeDefined()
  })

  it('refuses a dirty working tree up front without attempting the merge', async () => {
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')
    await git(repoPath, 'branch', 'feature')

    // Dirty the working tree with an uncommitted change.
    await writeFile(path.join(repoPath, 'base.txt'), 'dirty\n')

    const headBefore = await git(repoPath, 'rev-parse', 'HEAD')

    let caught: unknown
    try {
      await runGitMerge({ git: service }, repoPath, 'feature')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toMatch(/commit or stash/i)

    const failure = toIpcFailure(caught)
    expect(failure.code).toBeUndefined()
    expect(failure.remediation).toBeUndefined()

    // No merge was attempted: HEAD unchanged, no mid-merge state.
    expect(await git(repoPath, 'rev-parse', 'HEAD')).toBe(headBefore)
    await expect(stat(path.join(repoPath, '.git', 'MERGE_HEAD'))).rejects.toBeDefined()
  })

  // ── Phase 91 (W8): expectedTargetBranch verification ─────────────────────────────
  describe('expectedTargetBranch verification', () => {
    it('the happy path (matching branch) is unaffected', async () => {
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      await git(repoPath, 'checkout', '-b', 'feature')
      await writeFile(path.join(repoPath, 'feature.txt'), 'feature work\n')
      await git(repoPath, 'add', 'feature.txt')
      await git(repoPath, 'commit', '-m', 'feature commit')
      await git(repoPath, 'checkout', 'main')

      await expect(
        runGitMerge({ git: service }, repoPath, 'feature', 'main')
      ).resolves.toBeUndefined()
      expect(await git(repoPath, 'show', 'HEAD:feature.txt')).toBe('feature work')
    })

    it('refuses without attempting the merge when HEAD has moved off the expected branch', async () => {
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      await git(repoPath, 'branch', 'feature')
      await git(repoPath, 'checkout', '-b', 'other')
      const headBefore = await git(repoPath, 'rev-parse', 'HEAD')

      let caught: unknown
      try {
        // The renderer believed 'main' was current when the user clicked Merge, but
        // HEAD is now 'other'.
        await runGitMerge({ git: service }, repoPath, 'feature', 'main')
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(Error)
      expect((caught as Error).message).toMatch(/changed since you opened this/i)
      expect(await git(repoPath, 'rev-parse', 'HEAD')).toBe(headBefore)
      await expect(stat(path.join(repoPath, '.git', 'MERGE_HEAD'))).rejects.toBeDefined()
    })

    it('refuses when a queued branch switch lands HEAD elsewhere before the job runs', async () => {
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      await git(repoPath, 'branch', 'feature')
      await git(repoPath, 'branch', 'other')
      const headBefore = await git(repoPath, 'rev-parse', 'HEAD')

      const slowSwitch = service.enqueueJob(repoPath, async (exec) => {
        await new Promise((r) => setTimeout(r, 50))
        await exec({ args: ['checkout', 'other'] })
      })

      let caught: unknown
      try {
        await runGitMerge({ git: service }, repoPath, 'feature', 'main')
      } catch (err) {
        caught = err
      }
      await slowSwitch

      expect(caught).toBeInstanceOf(Error)
      expect((caught as Error).message).toMatch(/changed since you opened this/i)
      expect(await git(repoPath, 'rev-parse', 'HEAD')).toBe(headBefore)
      expect(await git(repoPath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('other')
    })

    it('omitting expectedTargetBranch skips verification entirely (backward compatible)', async () => {
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      await git(repoPath, 'checkout', '-b', 'feature')
      await writeFile(path.join(repoPath, 'feature.txt'), 'feature work\n')
      await git(repoPath, 'add', 'feature.txt')
      await git(repoPath, 'commit', '-m', 'feature commit')
      await git(repoPath, 'checkout', 'main')

      await expect(runGitMerge({ git: service }, repoPath, 'feature')).resolves.toBeUndefined()
    })
  })
})
