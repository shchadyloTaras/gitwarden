import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { GitRunner } from '../../src/main/git/GitRunner.js'
import { GitLocator } from '../../src/main/git/GitLocator.js'
import { GitService } from '../../src/main/services/GitService.js'
import {
  reconcileAssignedProfileRemote,
  type RemoteReconcileDeps,
} from '../../src/main/ipc/remoteReconcile.js'
import type { Profile, RepositoryRecord } from '../../src/core/types.js'

// Offline integration: drive reconcileAssignedProfileRemote against a real temp git repo,
// asserting the `--local` origin host via `git remote get-url`. No network — the remote URL
// never has to resolve; we only verify GitWarden rewrites the host string per ADR 0009.

let gitPath: string
let service: GitService
const tmpDirs: string[] = []

beforeAll(async () => {
  gitPath = await GitLocator.locate()
  service = new GitService(new GitRunner(gitPath))
})

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function repoWithOrigin(originUrl: string): Promise<RepositoryRecord> {
  const cwd = await mkdtemp(join(tmpdir(), 'gitwarden-alias-'))
  tmpDirs.push(cwd)
  execFileSync(gitPath, ['init', '-b', 'main'], { cwd, stdio: 'pipe' })
  execFileSync(gitPath, ['remote', 'add', 'origin', originUrl], { cwd, stdio: 'pipe' })
  return {
    id: 'repo-1',
    name: 'repo',
    localPath: cwd,
    assignedProfileId: undefined,
    isFavorite: false,
  }
}

function originUrl(cwd: string): string {
  return execFileSync(gitPath, ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' }).trim()
}

function sshProfile(id: string, alias?: string): Profile {
  return {
    id,
    displayName: id,
    gitAuthorName: 'U',
    gitAuthorEmail: 'u@example.com',
    githubUsername: 'u',
    authenticationMethod: 'ssh',
    sshKeyAlias: alias,
    expectedRemoteHosts: ['github.com'],
  }
}

function tokenProfile(id: string): Profile {
  return { ...sshProfile(id), authenticationMethod: 'token', sshKeyAlias: undefined }
}

/** deps backed by a profile map + a mutable repo ref (mirrors RepositoryService.update's merge). */
function makeDeps(
  profiles: Profile[],
  repoRef: { current: RepositoryRecord }
): RemoteReconcileDeps {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  return {
    git: service,
    profiles: { get: async (id: string) => byId.get(id) },
    repositories: {
      update: async (_id: string, patch: Partial<Omit<RepositoryRecord, 'id'>>) => {
        repoRef.current = { ...repoRef.current, ...patch }
        return repoRef.current
      },
    },
  }
}

/** Simulate the IPC handler: set the new assignment, then reconcile against the live record. */
async function assignTo(
  deps: RemoteReconcileDeps,
  repoRef: { current: RepositoryRecord },
  profileId: string | undefined
): Promise<void> {
  repoRef.current = { ...repoRef.current, assignedProfileId: profileId }
  await reconcileAssignedProfileRemote(deps, repoRef.current)
}

describe('reconcileAssignedProfileRemote (offline temp repo)', () => {
  it('binds the origin host to the alias, re-points across ssh profiles, restores on token switch', async () => {
    const repoRef = { current: await repoWithOrigin('git@github.com:owner/repo.git') }
    const cwd = repoRef.current.localPath
    const deps = makeDeps(
      [
        sshProfile('work', 'github.com-work'),
        sshProfile('personal', 'gh-personal'),
        tokenProfile('tok'),
      ],
      repoRef
    )

    // Assign ssh profile with alias → bind; canonical host captured.
    await assignTo(deps, repoRef, 'work')
    expect(originUrl(cwd)).toBe('git@github.com-work:owner/repo.git')
    expect(repoRef.current.preBindRemoteHost).toBe('github.com')

    // Switch to another ssh profile → re-point; canonical host preserved.
    await assignTo(deps, repoRef, 'personal')
    expect(originUrl(cwd)).toBe('git@gh-personal:owner/repo.git')
    expect(repoRef.current.preBindRemoteHost).toBe('github.com')

    // Switch to a token profile → restore canonical host; marker cleared.
    await assignTo(deps, repoRef, 'tok')
    expect(originUrl(cwd)).toBe('git@github.com:owner/repo.git')
    expect(repoRef.current.preBindRemoteHost).toBeUndefined()
  })

  it('restores the canonical host on unassign', async () => {
    const repoRef = { current: await repoWithOrigin('git@github.com:owner/repo.git') }
    const cwd = repoRef.current.localPath
    const deps = makeDeps([sshProfile('work', 'github.com-work')], repoRef)

    await assignTo(deps, repoRef, 'work')
    expect(originUrl(cwd)).toBe('git@github.com-work:owner/repo.git')

    await assignTo(deps, repoRef, undefined)
    expect(originUrl(cwd)).toBe('git@github.com:owner/repo.git')
    expect(repoRef.current.preBindRemoteHost).toBeUndefined()
  })

  it('leaves an HTTPS origin untouched (token path keeps working)', async () => {
    const repoRef = { current: await repoWithOrigin('https://github.com/owner/repo.git') }
    const cwd = repoRef.current.localPath
    const deps = makeDeps([sshProfile('work', 'github.com-work')], repoRef)

    await assignTo(deps, repoRef, 'work')
    expect(originUrl(cwd)).toBe('https://github.com/owner/repo.git')
    expect(repoRef.current.preBindRemoteHost).toBeUndefined()
  })

  it('leaves the origin untouched for an aliasless ssh profile', async () => {
    const repoRef = { current: await repoWithOrigin('git@github.com:owner/repo.git') }
    const cwd = repoRef.current.localPath
    const deps = makeDeps([sshProfile('work', undefined)], repoRef)

    await assignTo(deps, repoRef, 'work')
    expect(originUrl(cwd)).toBe('git@github.com:owner/repo.git')
    expect(repoRef.current.preBindRemoteHost).toBeUndefined()
  })
})
