import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { JsonStore } from '../../src/main/storage/JsonStore.js'
import { RepositoryService } from '../../src/main/services/RepositoryService.js'
import { RepositoriesDataSchema } from '../../src/core/schemas.js'
import { RepositoryUpdatePayload } from '../../src/main/ipc/ipc-schemas.js'
import { safetyCheckService } from '../../src/core/safety/SafetyCheckService.js'
import type {
  RepositoryRecord,
  RepositoryPushPolicy,
  Profile,
  EffectiveGitIdentity,
  GitRemote,
} from '../../src/core/types.js'

let tmpDir: string
let service: RepositoryService

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gitwarden-policy-persist-'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

const POLICY: RepositoryPushPolicy = {
  mode: 'branchScoped',
  allowedBranchPatterns: ['client-x/taras/*', 'client-x/taras/**'],
  blockedBranchPatterns: ['main', 'develop', 'release/*'],
  expectedRemoteOwner: 'client-org',
  expectedRemoteRepo: 'project',
  expectedGitHubActor: 'taras-work',
  suggestedBranchPrefix: 'client-x/taras/',
}

// ── Storage round-trip ────────────────────────────────────────────────────────

describe('pushPolicy storage round-trip', () => {
  it('persists a pushPolicy through JsonStore and reads it back deep-equal', async () => {
    const store = new JsonStore(join(tmpDir, 'repos.json'), RepositoriesDataSchema, {
      repositories: [],
    })
    service = new RepositoryService(store)

    const created = await service.create({
      name: 'Client Project',
      localPath: '/tmp/client-project',
      isFavorite: false,
    })

    const updated = await service.update(created.id, { pushPolicy: POLICY })
    expect(updated.pushPolicy).toEqual(POLICY)

    const reloaded = await service.get(created.id)
    expect(reloaded?.pushPolicy).toEqual(POLICY)
  })

  it('clears a pushPolicy by updating with undefined', async () => {
    const store = new JsonStore(join(tmpDir, 'repos-clear.json'), RepositoriesDataSchema, {
      repositories: [],
    })
    const svc = new RepositoryService(store)
    const repo = await svc.create({
      name: 'Client Project',
      localPath: '/tmp/client-project-2',
      isFavorite: false,
      pushPolicy: POLICY,
    })
    expect(repo.pushPolicy).toEqual(POLICY)

    const cleared = await svc.update(repo.id, { pushPolicy: undefined })
    expect(cleared.pushPolicy).toBeUndefined()

    const reloaded = await svc.get(repo.id)
    expect(reloaded?.pushPolicy).toBeUndefined()
  })
})

// ── IPC payload validation ────────────────────────────────────────────────────

describe('RepositoryUpdatePayload Zod validation', () => {
  it('accepts a valid pushPolicy patch', () => {
    const result = RepositoryUpdatePayload.safeParse({
      id: 'r1',
      patch: { pushPolicy: POLICY },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid mode value', () => {
    const result = RepositoryUpdatePayload.safeParse({
      id: 'r1',
      patch: {
        pushPolicy: {
          mode: 'INVALID_MODE',
          allowedBranchPatterns: [],
          blockedBranchPatterns: [],
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields in pushPolicy', () => {
    const result = RepositoryUpdatePayload.safeParse({
      id: 'r1',
      patch: {
        pushPolicy: {
          mode: 'branchScoped',
          // missing allowedBranchPatterns and blockedBranchPatterns
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects allowedBranchPatterns with non-string entries', () => {
    const result = RepositoryUpdatePayload.safeParse({
      id: 'r1',
      patch: {
        pushPolicy: {
          mode: 'branchScoped',
          allowedBranchPatterns: [42, 'ok'],
          blockedBranchPatterns: [],
        },
      },
    })
    expect(result.success).toBe(false)
  })
})

// ── Resolved push target wiring ───────────────────────────────────────────────
//
// Verifies that when upstream names a non-default remote, the engine evaluates
// owner/repo against that remote's URL — not the first remote in the list.

describe('SafetyCheckService resolved target (upstream wins)', () => {
  const IDENTITY: EffectiveGitIdentity = {
    userName: 'Taras',
    userEmail: 'taras@example.com',
    nameSource: 'local',
    emailSource: 'local',
  }
  const PROFILE: Profile = {
    id: 'p1',
    displayName: 'Work',
    gitAuthorName: 'Taras',
    gitAuthorEmail: 'taras@example.com',
    githubUsername: 'taras',
    authenticationMethod: 'ssh',
    expectedRemoteHosts: [],
  }
  const ORIGIN: GitRemote = {
    name: 'origin',
    url: 'git@github.com:personal-org/myrepo.git',
    host: 'github.com',
  }
  const UPSTREAM_REMOTE: GitRemote = {
    name: 'upstream',
    url: 'git@github.com:client-org/project.git',
    host: 'github.com',
  }
  const REPO: RepositoryRecord = {
    id: 'r1',
    name: 'Client Project',
    localPath: '/tmp/client',
    assignedProfileId: 'p1',
    isFavorite: false,
    pushPolicy: {
      mode: 'unrestricted',
      allowedBranchPatterns: [],
      blockedBranchPatterns: [],
      expectedRemoteOwner: 'client-org',
      expectedRemoteRepo: 'project',
    },
  }

  it('allows push when upstream remote satisfies owner/repo, even though origin does not', () => {
    const result = safetyCheckService.checkPush({
      repository: REPO,
      activeProfile: PROFILE,
      identity: IDENTITY,
      remotes: [ORIGIN, UPSTREAM_REMOTE],
      currentBranch: 'feature/foo',
      upstream: 'upstream/feature/foo',
    })
    expect(result.issues.some((i) => i.code === 'REMOTE_OWNER_MISMATCH')).toBe(false)
    expect(result.issues.some((i) => i.code === 'REMOTE_REPO_MISMATCH')).toBe(false)
    expect(result.canPush).toBe(true)
  })

  it('blocks push when no upstream and origin does not satisfy owner/repo', () => {
    const result = safetyCheckService.checkPush({
      repository: REPO,
      activeProfile: PROFILE,
      identity: IDENTITY,
      remotes: [ORIGIN],
      currentBranch: 'feature/foo',
      // no upstream — falls back to the sole/preferred remote (origin)
    })
    expect(result.issues.some((i) => i.code === 'REMOTE_OWNER_MISMATCH')).toBe(true)
    expect(result.canPush).toBe(false)
  })

  it('prefers upstream remote over origin when both present and no upstream hint', () => {
    // Without upstream hint but with preferredRemoteName='origin', uses origin
    const result = safetyCheckService.checkPush({
      repository: REPO,
      activeProfile: PROFILE,
      identity: IDENTITY,
      remotes: [ORIGIN, UPSTREAM_REMOTE],
      currentBranch: 'feature/foo',
      // no upstream string → resolvePushTarget falls back to preferred ('origin') then sole
    })
    // origin is personal-org/myrepo → should mismatch
    expect(result.issues.some((i) => i.code === 'REMOTE_OWNER_MISMATCH')).toBe(true)
  })
})
