import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, stat, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitError } from '../../src/main/git/ErrorMapper'
import { GitService, type WriteExecutor } from '../../src/main/services/GitService'
import {
  executeRemediation,
  type RemediationExecutorDeps,
} from '../../src/main/ipc/remediationExecutor'
import type {
  Profile,
  RepositoryRecord,
  AppSettings,
  GitHubDeviceCode,
  GitStatus,
} from '../../src/core/types'
import { removeTempDir } from '../fixtures/tempDir'

// Offline fixtures — real git in a temp dir, with a LOCAL bare repo as the "remote".
// The device-flow + GitHub services are mocked; no network, no real account, no token.
const execFileAsync = promisify(execFile)
async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

const noopSender = { send: (): void => {} }

// Phase 91: RemediationExecutorDeps.git now requires enqueueJob/verifyHeadBranch (the
// merge-remote-into-local compound job). These tests exercise remediation LOGIC, not
// GitRunner's real queue semantics, so a trivial stub that just invokes the callback
// is enough — mergeRemoteBranch's own mock below ignores the `exec` it's handed.
function stubEnqueueJob<T>(repoPath: string, fn: (exec: WriteExecutor) => Promise<T>): Promise<T> {
  return fn(async () => ({ stdout: Buffer.from(''), stderr: '', code: 0 }))
}
async function stubVerifyHeadBranch(): Promise<boolean> {
  return true
}

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    displayName: 'Work',
    gitAuthorName: 'Work Dev',
    gitAuthorEmail: 'work@example.com',
    ...over,
  } as unknown as Profile
}

function repoRecord(localPath: string, assignedProfileId?: string): RepositoryRecord {
  return { id: 'r1', name: 'repo', localPath, assignedProfileId } as unknown as RepositoryRecord
}

/** Build deps with mocked services by default; override per test. */
function makeDeps(over: Partial<RemediationExecutorDeps> = {}): RemediationExecutorDeps {
  return {
    git: {
      setLocalIdentity: vi.fn(async () => {}),
      push: vi.fn(async () => {}),
      getRemotes: vi.fn(async () => []),
      getStatus: vi.fn(async () => ({ files: [], ahead: 0, behind: 0 })),
      mergeRemoteBranch: vi.fn(async () => {}),
      enqueueJob: stubEnqueueJob,
      verifyHeadBranch: stubVerifyHeadBranch,
    },
    repositories: { list: vi.fn(async () => []) },
    profiles: { get: vi.fn(async () => undefined) },
    settings: { update: vi.fn(async () => ({}) as AppSettings) },
    github: {
      startDeviceAuth: vi.fn(async () => ({}) as GitHubDeviceCode),
      resolveHttpsAuth: vi.fn(async () => undefined),
    },
    ...over,
  }
}

describe('executeRemediation (offline fixtures)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-rem-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', repoPath])
    await git(repoPath, 'config', 'user.name', 'Old Name')
    await git(repoPath, 'config', 'user.email', 'old@example.com')
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    await removeTempDir(tmpDir)
  })

  it('set-local-identity writes the profile identity to --local config', async () => {
    const deps = makeDeps({
      git: service,
      repositories: { list: vi.fn(async () => [repoRecord(repoPath, 'p1')]) },
      profiles: { get: vi.fn(async () => profile()) },
    })
    const result = await executeRemediation(deps, noopSender, {
      action: 'set-local-identity',
      repoPath,
    })
    expect(result.ok).toBe(true)
    expect(await git(repoPath, 'config', '--local', 'user.name')).toBe('Work Dev')
    expect(await git(repoPath, 'config', '--local', 'user.email')).toBe('work@example.com')
  })

  it('set-local-identity on an unassigned repo refuses with the assign-repo-profile remediation', async () => {
    const deps = makeDeps({
      git: service,
      repositories: { list: vi.fn(async () => [repoRecord(repoPath, undefined)]) },
    })
    const result = await executeRemediation(deps, noopSender, {
      action: 'set-local-identity',
      repoPath,
    })
    expect(result.ok).toBe(false)
    expect(result.remediation?.action).toBe('assign-repo-profile')
    expect(result.remediation?.navigateTo).toBe('repositories')
  })

  it('switch-active-profile sets the assigned profile as active', async () => {
    const update = vi.fn(async () => ({}) as AppSettings)
    const deps = makeDeps({
      repositories: { list: vi.fn(async () => [repoRecord(repoPath, 'p1')]) },
      settings: { update },
    })
    const result = await executeRemediation(deps, noopSender, {
      action: 'switch-active-profile',
      repoPath,
    })
    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({ activeProfileId: 'p1' })
  })

  it('reconnect-github starts the device flow for the assigned profile and returns the code', async () => {
    const deviceCode = {
      userCode: 'WX-YZ',
      verificationUri: 'https://github.com/login/device',
    } as unknown as GitHubDeviceCode
    const startDeviceAuth = vi.fn(async () => deviceCode)
    const deps = makeDeps({
      repositories: { list: vi.fn(async () => [repoRecord(repoPath, 'p1')]) },
      github: { startDeviceAuth, resolveHttpsAuth: vi.fn(async () => undefined) },
    })
    const result = await executeRemediation(deps, noopSender, {
      action: 'reconnect-github',
      repoPath,
    })
    expect(result.ok).toBe(true)
    expect(result.deviceCode).toBe(deviceCode)
    expect(startDeviceAuth).toHaveBeenCalledWith('p1', noopSender)
  })

  it('switch-profile-and-retry-push switches profile and pushes to the bare remote', async () => {
    // Seed a commit and a local bare "remote".
    await writeFile(path.join(repoPath, 'a.txt'), 'hello')
    await git(repoPath, 'add', '.')
    await git(repoPath, 'commit', '-m', 'init')
    const branch = await git(repoPath, 'rev-parse', '--abbrev-ref', 'HEAD')
    const bare = path.join(tmpDir, 'remote.git')
    await execFileAsync('git', ['init', '--bare', bare])
    await git(repoPath, 'remote', 'add', 'origin', bare)

    const update = vi.fn(async () => ({}) as AppSettings)
    const deps = makeDeps({
      git: service,
      repositories: { list: vi.fn(async () => [repoRecord(repoPath, 'p1')]) },
      settings: { update },
    })
    const result = await executeRemediation(deps, noopSender, {
      action: 'switch-profile-and-retry-push',
      repoPath,
      remote: 'origin',
      branch,
    })
    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({ activeProfileId: 'p1' })
    // The bare remote now has the branch (the push really landed).
    const remoteSha = await git(bare, 'rev-parse', branch)
    const localSha = await git(repoPath, 'rev-parse', branch)
    expect(remoteSha).toBe(localSha)
  })

  it('switch-profile-and-retry-push escalates repeated HTTPS wrong-account rejection to reconnect', async () => {
    const update = vi.fn(async () => ({}) as AppSettings)
    const push = vi.fn(async () => {
      throw new GitError({
        code: 'pushRejectedWrongAccount',
        userMessage:
          "GitHub rejected the push: you're authenticated as a different account than this repository's profile.",
        technicalDetails:
          "remote: Permission to octo/repo.git denied to wronguser.\nfatal: unable to access 'https://github.com/octo/repo.git/': The requested URL returned error: 403",
        exitCode: 128,
      })
    })
    const resolveHttpsAuth = vi.fn(async () => ({ username: 'octo', token: 'secret-token' }))
    const deps = makeDeps({
      git: {
        setLocalIdentity: vi.fn(async () => {}),
        push,
        getRemotes: vi.fn(async () => [
          { name: 'origin', url: 'https://github.com/octo/repo.git', host: 'github.com' },
        ]),
        getStatus: vi.fn(async () => ({ files: [], ahead: 0, behind: 0 })),
        mergeRemoteBranch: vi.fn(async () => {}),
        enqueueJob: stubEnqueueJob,
        verifyHeadBranch: stubVerifyHeadBranch,
      },
      repositories: { list: vi.fn(async () => [repoRecord(repoPath, 'p1')]) },
      settings: { update },
      github: {
        startDeviceAuth: vi.fn(async () => ({}) as GitHubDeviceCode),
        resolveHttpsAuth,
      },
    })

    const result = await executeRemediation(deps, noopSender, {
      action: 'switch-profile-and-retry-push',
      repoPath,
      remote: 'origin',
      branch: 'main',
    })

    expect(result.ok).toBe(false)
    expect(result.remediation?.action).toBe('reconnect-github')
    expect(result.message).toMatch(/Reconnect GitHub/i)
    expect(update).toHaveBeenCalledWith({ activeProfileId: 'p1' })
    expect(resolveHttpsAuth).toHaveBeenCalledWith('p1', 'https://github.com/octo/repo.git')
    expect(push).toHaveBeenCalledWith(repoPath, 'origin', 'main', {
      username: 'octo',
      token: 'secret-token',
    })
  })

  it('switch-profile-and-retry-push on an unassigned repo refuses and never pushes', async () => {
    const push = vi.fn(async () => {})
    const deps = makeDeps({
      git: {
        setLocalIdentity: vi.fn(async () => {}),
        push,
        getRemotes: vi.fn(async () => []),
        getStatus: vi.fn(async () => ({ files: [], ahead: 0, behind: 0 })),
        mergeRemoteBranch: vi.fn(async () => {}),
        enqueueJob: stubEnqueueJob,
        verifyHeadBranch: stubVerifyHeadBranch,
      },
      repositories: { list: vi.fn(async () => [repoRecord(repoPath, undefined)]) },
    })
    const result = await executeRemediation(deps, noopSender, {
      action: 'switch-profile-and-retry-push',
      repoPath,
      remote: 'origin',
      branch: 'main',
    })
    expect(result.ok).toBe(false)
    expect(result.remediation?.action).toBe('assign-repo-profile')
    expect(push).not.toHaveBeenCalled()
  })

  // ── merge-remote-into-local (Phase 70): the one-click fix for a diverged branch ──
  // Builds a bare "remote", clones a second worktree that pushes an extra commit,
  // then commits locally so the two histories diverge — mirrors git-service.test.ts.
  async function setUpRemoteAhead(): Promise<void> {
    const remote = path.join(tmpDir, 'remote.git')
    await execFileAsync('git', ['init', '--bare', '-b', 'main', remote])
    await git(repoPath, 'checkout', '-b', 'main')
    await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
    await git(repoPath, 'add', 'base.txt')
    await git(repoPath, 'commit', '-m', 'c1')
    await git(repoPath, 'remote', 'add', 'origin', remote)
    await git(repoPath, 'push', 'origin', 'main')
    const other = path.join(tmpDir, 'other')
    await execFileAsync('git', ['clone', remote, other])
    await git(other, 'config', 'user.name', 'Other')
    await git(other, 'config', 'user.email', 'other@example.com')
    await writeFile(path.join(other, 'base.txt'), 'one\ntwo\n')
    await git(other, 'commit', '-am', 'remote-ahead')
    await git(other, 'push', 'origin', 'main')
  }

  it('merge-remote-into-local merges cleanly when the diverged changes do not conflict', async () => {
    await setUpRemoteAhead()
    await writeFile(path.join(repoPath, 'local-only.txt'), 'local addition\n')
    await git(repoPath, 'add', 'local-only.txt')
    await git(repoPath, 'commit', '-m', 'local-divergent-clean')
    // Simulates what a failed `pull --ff-only` already leaves behind: fetched but not integrated.
    await git(repoPath, 'fetch', 'origin', 'main')

    const deps = makeDeps({ git: service })
    const result = await executeRemediation(deps, noopSender, {
      action: 'merge-remote-into-local',
      repoPath,
      remote: 'origin',
      branch: 'main',
    })

    expect(result.ok).toBe(true)
    const parents = await git(repoPath, 'show', '-s', '--format=%P', 'HEAD')
    expect(parents.split(' ')).toHaveLength(2) // a real merge commit
  })

  it('merge-remote-into-local re-diagnoses a real content conflict to resolve-conflicts, leaving the repo mid-merge', async () => {
    await setUpRemoteAhead()
    // Same line 2 of base.txt edited differently on each side → a genuine conflict.
    await writeFile(path.join(repoPath, 'base.txt'), 'one\nlocal\n')
    await git(repoPath, 'commit', '-am', 'local-divergent-conflicting')
    await git(repoPath, 'fetch', 'origin', 'main')

    const deps = makeDeps({ git: service })
    const result = await executeRemediation(deps, noopSender, {
      action: 'merge-remote-into-local',
      repoPath,
      remote: 'origin',
      branch: 'main',
    })

    expect(result.ok).toBe(false)
    expect(result.remediation).toEqual({
      action: 'resolve-conflicts',
      kind: 'navigate',
      navigateTo: 'status',
    })
    expect(result.message).toBeTruthy() // git's own conflict userMessage, not a generic error

    // Never auto-resolved: the repo is left in git's standard mid-merge state.
    const status = await service.getStatus(repoPath)
    const f = status.files.find((c) => c.path === 'base.txt')
    expect(f?.indexStatus).toBe('conflicted')
    expect(f?.worktreeStatus).toBe('conflicted')
  })

  it('merge-remote-into-local refuses on a dirty working tree without attempting the merge', async () => {
    const mergeRemoteBranch = vi.fn(async () => {})
    const deps = makeDeps({
      git: {
        setLocalIdentity: vi.fn(async () => {}),
        push: vi.fn(async () => {}),
        getRemotes: vi.fn(async () => []),
        getStatus: vi.fn(
          async (): Promise<GitStatus> => ({
            files: [{ path: 'dirty.txt', indexStatus: 'unmodified', worktreeStatus: 'modified' }],
            ahead: 0,
            behind: 0,
          })
        ),
        mergeRemoteBranch,
        enqueueJob: stubEnqueueJob,
        verifyHeadBranch: stubVerifyHeadBranch,
      },
    })

    const result = await executeRemediation(deps, noopSender, {
      action: 'merge-remote-into-local',
      repoPath,
      remote: 'origin',
      branch: 'main',
    })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/commit or stash/i)
    expect(mergeRemoteBranch).not.toHaveBeenCalled()
  })

  it('merge-remote-into-local refuses when no branch is provided', async () => {
    const deps = makeDeps({ git: service })
    const result = await executeRemediation(deps, noopSender, {
      action: 'merge-remote-into-local',
      repoPath,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/branch/i)
  })

  // ── Phase 91: expectedHeadBranch verification for merge-remote-into-local ────────
  describe('merge-remote-into-local expectedHeadBranch verification', () => {
    it('the happy path (matching branch) is unaffected', async () => {
      await setUpRemoteAhead()
      await writeFile(path.join(repoPath, 'local-only.txt'), 'local addition\n')
      await git(repoPath, 'add', 'local-only.txt')
      await git(repoPath, 'commit', '-m', 'local-divergent-clean')
      await git(repoPath, 'fetch', 'origin', 'main')

      const deps = makeDeps({ git: service })
      const result = await executeRemediation(deps, noopSender, {
        action: 'merge-remote-into-local',
        repoPath,
        remote: 'origin',
        branch: 'main',
        expectedHeadBranch: 'main',
      })
      expect(result.ok).toBe(true)
    })

    it('refuses without attempting the merge when HEAD has moved off the expected branch', async () => {
      await setUpRemoteAhead()
      await git(repoPath, 'fetch', 'origin', 'main')
      await git(repoPath, 'checkout', '-b', 'other')
      const headBefore = await git(repoPath, 'rev-parse', 'HEAD')

      const deps = makeDeps({ git: service })
      const result = await executeRemediation(deps, noopSender, {
        action: 'merge-remote-into-local',
        repoPath,
        remote: 'origin',
        branch: 'main',
        expectedHeadBranch: 'main',
      })

      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/changed since this fix was suggested/i)
      expect(await git(repoPath, 'rev-parse', 'HEAD')).toBe(headBefore)
      await expect(stat(path.join(repoPath, '.git', 'MERGE_HEAD'))).rejects.toBeDefined()
    })
  })
})
