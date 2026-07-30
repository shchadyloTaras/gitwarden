import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import { GitError } from '../../src/main/git/ErrorMapper'
import { removeTempDir } from '../fixtures/tempDir'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('GitService compound-write primitives (Phase 91)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gs-compound-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    // Windows CI: a just-exited git process (or Defender/indexer scanning the pack files
    // it wrote) can hold a transient handle into tmpDir for a few hundred ms after the
    // child's 'close' event fires, even though nothing is actually still using it — retry
    // with backoff is Node's own documented remedy for EBUSY/EPERM in this exact situation.
    await removeTempDir(tmpDir)
  })

  async function addCommit(name: string): Promise<void> {
    await writeFile(path.join(repoPath, `${name}.txt`), `${name}\n`)
    await git(repoPath, 'add', `${name}.txt`)
    await git(repoPath, 'commit', '-m', name)
  }

  describe('verifyHeadBranch', () => {
    it('returns true when HEAD is on the expected branch', async () => {
      await addCommit('c1')
      expect(await service.verifyHeadBranch(repoPath, 'main')).toBe(true)
    })

    it('returns false when HEAD is on a different branch', async () => {
      await addCommit('c1')
      await git(repoPath, 'checkout', '-b', 'feature')
      expect(await service.verifyHeadBranch(repoPath, 'main')).toBe(false)
    })

    it('returns false (not a crash) on a detached HEAD', async () => {
      await addCommit('c1')
      const sha = await git(repoPath, 'rev-parse', 'HEAD')
      await git(repoPath, 'checkout', sha)
      expect(await service.verifyHeadBranch(repoPath, 'main')).toBe(false)
    })
  })

  describe('push -u decision probes the NAMED branch, not HEAD (W10)', () => {
    async function setUpRemote(): Promise<string> {
      const bare = path.join(tmpDir, 'remote.git')
      await execFileAsync('git', ['init', '--bare', '-b', 'main', bare])
      await git(repoPath, 'remote', 'add', 'origin', bare)
      return bare
    }

    // Each of these two tests chains ~18 real (unmocked) git process spawns, which is well
    // past vitest's 5000ms default on a loaded Windows CI runner. They no longer carry a
    // per-test override: vitest.config.ts now raises testTimeout suite-wide, and a local
    // 15_000 would give the two slowest tests in the repo a *tighter* budget than everyone
    // else — exactly backwards.
    it('adds -u for a non-current branch that has no upstream, even though HEAD does', async () => {
      const bare = await setUpRemote()
      await addCommit('c1')
      await service.push(repoPath, 'origin', 'main') // main now has an upstream
      await git(repoPath, 'checkout', '-b', 'feature')
      await addCommit('feature-work')
      await git(repoPath, 'checkout', 'main') // HEAD is back on main (has upstream)

      // Push the NON-current 'feature' branch, which has never been pushed.
      await service.push(repoPath, 'origin', 'feature')

      // -u must have been applied to feature specifically — proven by the tracking
      // ref now resolving, NOT by HEAD's own (unrelated) upstream.
      const upstream = await git(
        repoPath,
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        'feature@{u}'
      )
      expect(upstream).toBe('origin/feature')
      const remoteBranches = await git(bare, 'branch', '--list')
      expect(remoteBranches).toContain('feature')
    })

    it('does NOT re-add -u for a non-current branch that already has an upstream', async () => {
      await setUpRemote()
      await addCommit('c1')
      await git(repoPath, 'checkout', '-b', 'feature')
      await addCommit('feature-work')
      await service.push(repoPath, 'origin', 'feature') // establishes feature's upstream
      await git(repoPath, 'checkout', 'main') // HEAD has NO upstream at all
      await addCommit('main-work-2')

      // Re-pushing feature while HEAD (main) has no upstream must not force -u onto a
      // branch that already tracks correctly — the old HEAD-relative check would have
      // reported hasUpstream:false here (since HEAD/main has none) and added -u
      // needlessly (harmless, but proves the fix reads the right ref either way).
      await expect(service.push(repoPath, 'origin', 'feature')).resolves.toBeUndefined()
      const upstream = await git(
        repoPath,
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        'feature@{u}'
      )
      expect(upstream).toBe('origin/feature')
    })
  })

  describe('getCommitsAhead error narrowing (W29)', () => {
    it('falls back to full history on the genuine missing-tracking-ref case', async () => {
      await addCommit('c1')
      await addCommit('c2')
      // origin/main was never created — git reports the range itself as unresolvable.
      const result = await service.getCommitsAhead(repoPath, 'origin', 'main', 10)
      expect(result.map((c) => c.message).sort()).toEqual(['c1', 'c2'])
    })

    it('propagates a real GitError unrelated to a missing tracking ref, instead of silently falling back', async () => {
      await addCommit('c1')
      const runner = new GitRunner(gitPath)
      const originalRun = runner.run.bind(runner)
      runner.run = (inv) => {
        const isLogRangeQuery =
          inv.args.includes('log') && inv.args.some((a) => a.includes('..HEAD'))
        if (isLogRangeQuery) {
          return Promise.reject(
            new GitError({
              code: 'unknown',
              userMessage: 'An unexpected Git error occurred.',
              technicalDetails: 'fatal: some unrelated failure that is not a missing tracking ref',
              exitCode: 128,
            })
          )
        }
        return originalRun(inv)
      }
      const svc = new GitService(runner)
      await expect(svc.getCommitsAhead(repoPath, 'origin', 'main', 10)).rejects.toThrow(
        /unexpected git error/i
      )
    })
  })

  describe('commit() atomicity (W26)', () => {
    it('returns the hash of the commit it just made, from inside one compound job', async () => {
      await writeFile(path.join(repoPath, 'a.txt'), 'a\n')
      await git(repoPath, 'add', 'a.txt')
      const { hash } = await service.commit(repoPath, 'first commit')
      const realShortHash = await git(repoPath, 'rev-parse', '--short', 'HEAD')
      expect(hash).toBe(realShortHash)
    })

    it('two rapid commits each return their OWN hash, not a racing one', async () => {
      await writeFile(path.join(repoPath, 'a.txt'), 'a\n')
      await git(repoPath, 'add', 'a.txt')
      const first = await service.commit(repoPath, 'first')
      await writeFile(path.join(repoPath, 'b.txt'), 'b\n')
      await git(repoPath, 'add', 'b.txt')
      const second = await service.commit(repoPath, 'second')

      expect(first.hash).not.toBe(second.hash)
      const log = await git(repoPath, 'log', '--format=%h')
      expect(log.split('\n')).toEqual([second.hash, first.hash])
    })
  })
})
