import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, realpath, rm, stat, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import type { GitError } from '../../src/main/git/ErrorMapper'
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

  it('marks local branches that are checked out in another worktree', async () => {
    await writeFile(path.join(repoPath, 'init.txt'), 'initial\n')
    await git(repoPath, 'add', 'init.txt')
    await git(repoPath, 'commit', '-m', 'initial')
    await git(repoPath, 'branch', 'linked-worktree')

    const linkedPath = path.join(tmpDir, 'linked-worktree')
    await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', linkedPath, 'linked-worktree'])

    const branches = await service.getBranches(repoPath)
    const linkedBranch = branches.find((b) => b.name === 'linked-worktree')

    expect(linkedBranch).toBeDefined()
    expect(linkedBranch!.isCurrent).toBe(false)
    await expect(realpath(linkedBranch!.worktreePath!)).resolves.toBe(await realpath(linkedPath))
  })

  it('treats deleting an already-missing branch as a successful refresh-safe no-op', async () => {
    await expect(service.deleteBranch(repoPath, 'already-gone')).resolves.toBeUndefined()
  })

  // ── Pull divergence: the real step after a "fetch first" push rejection ──
  // Builds a bare "remote", clones a second worktree that pushes an extra commit,
  // then commits locally so the two histories diverge — exactly the offline shape
  // of the user's failed push/pull loop.
  async function setUpRemoteAhead(): Promise<{ remote: string }> {
    const remote = path.join(tmpDir, 'remote.git')
    await execFileAsync('git', ['init', '--bare', '-b', 'main', remote])
    // Seed the repo with a first commit on main and push it.
    await git(repoPath, 'checkout', '-b', 'main')
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')
    await git(repoPath, 'remote', 'add', 'origin', remote)
    await git(repoPath, 'push', 'origin', 'main')
    // A second clone pushes an extra commit so the remote moves ahead.
    const other = path.join(tmpDir, 'other')
    await execFileAsync('git', ['clone', remote, other])
    await git(other, 'config', 'user.name', 'Other')
    await git(other, 'config', 'user.email', 'other@example.com')
    await writeFile(path.join(other, 'base.txt'), 'one\ntwo\n')
    await git(other, 'commit', '-am', 'remote-ahead')
    await git(other, 'push', 'origin', 'main')
    return { remote }
  }

  it('rejects a pull as divergentBranches when local and remote have diverged', async () => {
    await setUpRemoteAhead()
    // Local makes its OWN commit → the two branches diverge.
    await writeFile(path.join(repoPath, 'base.txt'), 'one\nlocal\n')
    await git(repoPath, 'commit', '-am', 'local-divergent')

    await expect(service.pull(repoPath, 'origin', 'main')).rejects.toMatchObject({
      code: 'divergentBranches',
    } satisfies Partial<GitError>)
  })

  it('fast-forwards a pull cleanly when local is merely behind (no regression from --ff-only)', async () => {
    await setUpRemoteAhead()
    // Local has NO commit of its own → a fast-forward is possible and must succeed.
    await expect(service.pull(repoPath, 'origin', 'main')).resolves.toBeUndefined()
    expect(await git(repoPath, 'show', '-s', '--format=%s', 'HEAD')).toBe('remote-ahead')
  })

  // ── mergeRemoteBranch (Phase 69): the one-click fix for a diverged branch ──
  it('merges cleanly when the diverged changes do not conflict', async () => {
    await setUpRemoteAhead()
    // Local commits an UNRELATED file → diverges from remote, but nothing overlaps.
    await writeFile(path.join(repoPath, 'local-only.txt'), 'local addition\n')
    await git(repoPath, 'add', 'local-only.txt')
    await git(repoPath, 'commit', '-m', 'local-divergent-clean')
    // Simulates what a failed `pull --ff-only` already leaves behind: the remote
    // tracking ref fetched, but not integrated. mergeRemoteBranch takes it from there.
    await git(repoPath, 'fetch', 'origin', 'main')

    await expect(service.mergeRemoteBranch(repoPath, 'origin', 'main')).resolves.toBeUndefined()

    const parents = await git(repoPath, 'show', '-s', '--format=%P', 'HEAD')
    expect(parents.split(' ')).toHaveLength(2) // a real merge commit
    expect(await git(repoPath, 'show', 'HEAD:base.txt')).toBe('one\ntwo')
    expect(await git(repoPath, 'show', 'HEAD:local-only.txt')).toBe('local addition')
  })

  it('rejects a merge as mergeConflict on a real content conflict, leaving the repo mid-merge', async () => {
    await setUpRemoteAhead()
    // Same line 2 of base.txt edited differently on each side → a genuine content conflict.
    await writeFile(path.join(repoPath, 'base.txt'), 'one\nlocal\n')
    await git(repoPath, 'commit', '-am', 'local-divergent-conflicting')
    await git(repoPath, 'fetch', 'origin', 'main')

    // Regression proof for the GitRunner stdout-classification fix: a real `git merge`
    // conflict writes "CONFLICT (…)" to stdout (empty stderr), which used to fall
    // through to `unknown` before GitRunner fed stdout into ErrorMapper too.
    await expect(service.mergeRemoteBranch(repoPath, 'origin', 'main')).rejects.toMatchObject({
      code: 'mergeConflict',
    } satisfies Partial<GitError>)

    // The repo is left in git's standard mid-merge state — no auto-resolution.
    await expect(stat(path.join(repoPath, '.git', 'MERGE_HEAD'))).resolves.toBeDefined()
    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'base.txt')
    expect(f?.indexStatus).toBe('conflicted')
    expect(f?.worktreeStatus).toBe('conflicted')
  })

  // ── Unstaging in a repo with no commits (unborn HEAD) — Phase 88 regression ──
  // `git restore --staged` restores the index from HEAD; a freshly-init'd repo has no
  // HEAD, so it dies with "could not resolve HEAD" (exit 128), which the ErrorMapper
  // maps to the generic "An unexpected Git error occurred." the user hit after Init +
  // Stage All. unstageAll/unstageFile must unstage cleanly whether or not HEAD exists.
  it('unstageAll unstages every file in a repo with no commits (unborn HEAD)', async () => {
    await writeFile(path.join(repoPath, 'a.ts'), 'a')
    await writeFile(path.join(repoPath, 'b.ts'), 'b')
    await git(repoPath, 'add', '-A')

    await expect(service.unstageAll(repoPath)).resolves.toBeUndefined()

    const status = await service.getStatus(repoPath)
    expect(status.files).toHaveLength(2)
    for (const f of status.files) {
      expect(f.indexStatus).toBe('untracked')
    }
  })

  it('unstageFile unstages one file, leaving the rest staged, in an unborn-HEAD repo', async () => {
    await writeFile(path.join(repoPath, 'keep.ts'), 'k')
    await writeFile(path.join(repoPath, 'drop.ts'), 'd')
    await git(repoPath, 'add', '-A')

    await expect(service.unstageFile(repoPath, 'drop.ts')).resolves.toBeUndefined()

    const status = await service.getStatus(repoPath)
    expect(status.files.find((c) => c.path === 'drop.ts')?.indexStatus).toBe('untracked')
    expect(status.files.find((c) => c.path === 'keep.ts')?.indexStatus).toBe('added')
  })

  it('unstageAll still unstages a staged change once the repo has commits (regression)', async () => {
    await writeFile(path.join(repoPath, 'base.ts'), 'v1')
    await git(repoPath, 'add', 'base.ts')
    await git(repoPath, 'commit', '-m', 'init')
    // Stage a modification of the tracked file plus a brand-new file.
    await writeFile(path.join(repoPath, 'base.ts'), 'v2')
    await writeFile(path.join(repoPath, 'new.ts'), 'n')
    await git(repoPath, 'add', '-A')

    await service.unstageAll(repoPath)

    const status = await service.getStatus(repoPath)
    const base = status.files.find((c) => c.path === 'base.ts')
    expect(base?.indexStatus).toBe('unmodified') // staged modification reverted to HEAD
    expect(base?.worktreeStatus).toBe('modified') // worktree edit preserved
    expect(status.files.find((c) => c.path === 'new.ts')?.indexStatus).toBe('untracked')
  })

  it('reports when delete is blocked because the branch is checked out in another worktree', async () => {
    await writeFile(path.join(repoPath, 'init.txt'), 'initial\n')
    await git(repoPath, 'add', 'init.txt')
    await git(repoPath, 'commit', '-m', 'initial')
    await git(repoPath, 'branch', 'linked-worktree')

    const linkedPath = path.join(tmpDir, 'linked-worktree')
    await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', linkedPath, 'linked-worktree'])

    await expect(service.deleteBranch(repoPath, 'linked-worktree')).rejects.toMatchObject({
      code: 'branchCheckedOutElsewhere',
    } satisfies Partial<GitError>)
  })
})
