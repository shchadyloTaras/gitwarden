import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import {
  executeRemediation,
  type RemediationExecutorDeps,
} from '../../src/main/ipc/remediationExecutor'
import type { Profile, RepositoryRecord, AppSettings, GitHubDeviceCode } from '../../src/core/types'

// Offline fixtures — real git in a temp dir, with a LOCAL bare repo as the "remote".
// The device-flow + GitHub services are mocked; no network, no real account, no token.
const execFileAsync = promisify(execFile)
async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

const noopSender = { send: (): void => {} }

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
    await rm(tmpDir, { recursive: true, force: true })
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

  it('switch-profile-and-retry-push on an unassigned repo refuses and never pushes', async () => {
    const push = vi.fn(async () => {})
    const deps = makeDeps({
      git: {
        setLocalIdentity: vi.fn(async () => {}),
        push,
        getRemotes: vi.fn(async () => []),
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
})
