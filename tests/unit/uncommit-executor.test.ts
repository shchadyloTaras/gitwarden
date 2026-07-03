import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import {
  getReturnState,
  returnLastCommit,
  returnUnpushed,
  type UncommitExecutorDeps,
} from '../../src/main/ipc/uncommitExecutor'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('uncommitExecutor integration', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService
  let deps: UncommitExecutorDeps

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-uncommit-exec-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))
    deps = { git: service }
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  async function setUpTrackedRemote(): Promise<void> {
    const remote = path.join(tmpDir, 'remote.git')
    await execFileAsync('git', ['init', '--bare', '-b', 'main', remote])
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')
    await git(repoPath, 'remote', 'add', 'origin', remote)
    await git(repoPath, 'push', '-u', 'origin', 'main')
  }

  async function addCommit(name: string): Promise<void> {
    await writeFile(path.join(repoPath, `${name}.txt`), `${name}\n`)
    await git(repoPath, 'add', `${name}.txt`)
    await git(repoPath, 'commit', '-m', name)
  }

  it('returns the last commit on a clean single-unpushed repo, then reports nothing unpushed', async () => {
    await setUpTrackedRemote()
    await addCommit('second')

    const result = await returnLastCommit(deps, { repoPath })
    expect(result).toEqual({ ok: true })

    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'second.txt')
    expect(f?.worktreeStatus).toBe('untracked')

    // The returned commit's file is now an unstaged change, so the tree itself is dirty —
    // `dirty-tree` (a global refusal) takes priority over `nothing-unpushed` here, which is
    // exactly right: the user must handle that change before any further uncommit action.
    const state = await getReturnState(deps, { repoPath })
    expect(state.unpushedCount).toBe(0)
    expect(state.eligibility.canReturnLast).toBe(false)
    expect(state.eligibility.refusals.last).toBe('dirty-tree')
  })

  it('collapses 3 unpushed commits into one unstaged set via returnUnpushed', async () => {
    await setUpTrackedRemote()
    await addCommit('c2')
    await addCommit('c3')
    await addCommit('c4')

    const before = await getReturnState(deps, { repoPath })
    expect(before.unpushedCount).toBe(3)
    expect(before.eligibility.canReturnAllUnpushed).toBe(true)

    const result = await returnUnpushed(deps, { repoPath })
    expect(result).toEqual({ ok: true })

    const status = await service.getStatus(repoPath)
    for (const name of ['c2', 'c3', 'c4']) {
      expect(status.files.find((c) => c.path === `${name}.txt`)?.worktreeStatus).toBe('untracked')
    }
    expect(status.ahead).toBe(0)
  })

  it('disables both actions and refuses nothing-unpushed without resetting on a pushed HEAD', async () => {
    await setUpTrackedRemote()
    const headBefore = await git(repoPath, 'rev-parse', 'HEAD')

    const state = await getReturnState(deps, { repoPath })
    expect(state.eligibility.canReturnLast).toBe(false)
    expect(state.eligibility.canReturnAllUnpushed).toBe(false)

    const lastResult = await returnLastCommit(deps, { repoPath })
    expect(lastResult.ok).toBe(false)
    expect(lastResult.message).toMatch(/already on the remote/)

    const allResult = await returnUnpushed(deps, { repoPath })
    expect(allResult.ok).toBe(false)

    expect(await git(repoPath, 'rev-parse', 'HEAD')).toBe(headBefore)
  })

  it('refuses without resetting on a dirty working tree', async () => {
    await setUpTrackedRemote()
    await addCommit('second')
    await writeFile(path.join(repoPath, 'dirty.txt'), 'uncommitted\n')
    const headBefore = await git(repoPath, 'rev-parse', 'HEAD')

    const result = await returnLastCommit(deps, { repoPath })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/commit or discard/i)
    expect(await git(repoPath, 'rev-parse', 'HEAD')).toBe(headBefore)
  })

  it('refuses root-commit when HEAD is the very first commit', async () => {
    await addCommit('only')

    const result = await returnLastCommit(deps, { repoPath })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/first commit/)
  })

  it('refuses merge-commit when HEAD is a merge commit', async () => {
    await addCommit('c1')
    await git(repoPath, 'checkout', '-b', 'feature')
    await addCommit('feature-commit')
    await git(repoPath, 'checkout', 'main')
    await addCommit('main-commit')
    await git(repoPath, 'merge', '--no-edit', 'feature')

    const result = await returnLastCommit(deps, { repoPath })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/merge commits/i)
  })

  it('allows last but refuses all on a repo with no upstream configured', async () => {
    await addCommit('c1')
    await addCommit('c2')

    const state = await getReturnState(deps, { repoPath })
    expect(state.eligibility.canReturnLast).toBe(true)
    expect(state.eligibility.canReturnAllUnpushed).toBe(false)
    expect(state.eligibility.refusals.all).toBe('no-upstream-for-all')

    const allResult = await returnUnpushed(deps, { repoPath })
    expect(allResult.ok).toBe(false)
    expect(allResult.message).toMatch(/never been pushed/)
  })
})
