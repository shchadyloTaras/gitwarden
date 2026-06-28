import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { AiConnection } from '../../src/core/ai/types'
import type { AiConnectionTestResult, AiModelInfo, AiUsageEstimate } from '../../src/core/ai/types'
import type { Profile, RepositoryRecord } from '../../src/core/types'
import {
  AiContextBuilder,
  sendPreparedContextForTest,
  type AiContextBuilderDeps,
} from '../../src/main/ai/AiContextBuilder'
import type { AiAdapter, AiStructuredRequest } from '../../src/main/ai/types'
import { profileFixture } from '../fixtures/profiles'

const SECRET_FIXTURES = {
  github: `ghp_${'c'.repeat(36)}`,
  apiKey: `sk-or-v1-${'d'.repeat(24)}`,
  credentialUrl: 'https://alice:hunter2pass@github.com/acme/private.git',
}

const profile: Profile = {
  id: 'profile-1',
  ...profileFixture('alice', { expectedRemoteHosts: ['github.com'] }),
}

function connection(patch: Partial<AiConnection> = {}): AiConnection {
  return {
    id: 'conn-1',
    name: 'OpenRouter',
    kind: 'openrouter',
    enabled: true,
    privacyMode: 'preview-each',
    retention: 'zero-retention',
    capabilities: {
      structuredOutput: true,
      streaming: true,
      modelList: true,
      usage: true,
      localOnly: false,
    },
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
    ...patch,
  }
}

function repository(patch: Partial<RepositoryRecord> = {}): RepositoryRecord {
  return {
    id: 'repo-1',
    name: 'Fixture',
    localPath: '/tmp/fixture',
    remoteUrl: 'https://github.com/acme/fixture.git',
    assignedProfileId: 'profile-1',
    isFavorite: false,
    ...patch,
  }
}

function deps(options: {
  repo?: RepositoryRecord
  globalEnabled?: boolean
  conn?: AiConnection
  diff?: string
}) {
  const repo = options.repo ?? repository()
  const conn = options.conn ?? connection()
  const git = {
    getStatus: vi.fn(async () => ({
      branch: 'main',
      ahead: 0,
      behind: 0,
      files: [
        {
          path: 'secret.txt',
          indexStatus: 'modified' as const,
          worktreeStatus: 'unmodified' as const,
        },
      ],
    })),
    getEffectiveIdentity: vi.fn(async () => ({
      userName: 'Alice Dev',
      userEmail: 'alice@example.com',
      emailSource: 'local' as const,
    })),
    getRemotes: vi.fn(async () => [
      { name: 'origin', url: SECRET_FIXTURES.credentialUrl, host: 'github.com' },
    ]),
    getCommitHistory: vi.fn(async () => [
      {
        fullHash: 'abc123',
        shortHash: 'abc123',
        authorName: 'Alice Dev',
        authorEmail: 'alice@example.com',
        date: '2026-06-25T00:00:00.000Z',
        message: 'initial',
      },
    ]),
    getDiff: vi.fn(async () => options.diff ?? `+ token=${SECRET_FIXTURES.github}\n`),
  }

  const services = {
    profiles: {
      list: vi.fn(async () => [profile]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    repositories: {
      list: vi.fn(async () => [repo]),
      get: vi.fn(async () => repo),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    settings: {
      get: vi.fn(async () => ({
        appearance: 'dark' as const,
        activeProfileId: profile.id,
        aiEnabled: options.globalEnabled ?? true,
      })),
      update: vi.fn(),
    },
    git,
    aiConnections: {
      list: vi.fn(async () => ({ connections: [conn], activeConnectionId: conn.id })),
      get: vi.fn(async () => conn),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      setActive: vi.fn(),
    },
  } as unknown as AiContextBuilderDeps

  return {
    git,
    services,
  }
}

class RecordingAdapter implements AiAdapter {
  captured: AiStructuredRequest<unknown> | null = null

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    this.captured = request as AiStructuredRequest<unknown>
    return request.responseSchema.parse({ ok: true })
  }

  async generateTextStream(): Promise<void> {
    throw new Error('not used')
  }

  async testConnection(): Promise<AiConnectionTestResult> {
    throw new Error('not used')
  }

  async listModels(): Promise<AiModelInfo[]> {
    throw new Error('not used')
  }

  async estimateUsage(): Promise<AiUsageEstimate> {
    return { inputTokens: 1 }
  }

  async cancel() {}
}

describe('AiContextBuilder', () => {
  it('blocks context assembly for a repo-level opt-out before any git service call', async () => {
    const built = deps({ repo: repository({ aiOverride: 'disabled' }), globalEnabled: true })
    const builder = new AiContextBuilder(built.services, { requestId: () => 'req-1' })

    await expect(
      builder.buildPreview({ repositoryId: 'repo-1', kind: 'commit-draft' })
    ).rejects.toThrow(/disabled for this repository/)
    expect(built.git.getStatus).not.toHaveBeenCalled()
    expect(built.git.getDiff).not.toHaveBeenCalled()
  })

  it('enforces repo to global to connection precedence without repo opt-in bypassing global off', async () => {
    const globalOff = deps({
      repo: repository({ aiOverride: 'enabled' }),
      globalEnabled: false,
    })
    await expect(
      new AiContextBuilder(globalOff.services).buildPreview({
        repositoryId: 'repo-1',
        kind: 'commit-draft',
      })
    ).rejects.toThrow(/disabled globally/)

    const connectionOff = deps({
      repo: repository(),
      globalEnabled: true,
      conn: connection({ enabled: false }),
    })
    await expect(
      new AiContextBuilder(connectionOff.services).buildPreview({
        repositoryId: 'repo-1',
        kind: 'commit-draft',
      })
    ).rejects.toThrow(/connection is disabled/)
  })

  it('captures only post-redaction fixture payloads before fake adapter send', async () => {
    const built = deps({
      diff: `+ ${SECRET_FIXTURES.github}\n+ ${SECRET_FIXTURES.apiKey}\n`,
    })
    const builder = new AiContextBuilder(built.services, { requestId: () => 'req-1' })
    const preview = await builder.buildPreview({
      repositoryId: 'repo-1',
      kind: 'commit-draft',
      commitMessage: 'Add secret fixture',
    })
    const adapter = new RecordingAdapter()

    await sendPreparedContextForTest(adapter, preview, z.object({ ok: z.boolean() }))
    const captured = JSON.stringify(adapter.captured)

    expect(captured).toContain('redacted:github-token')
    expect(captured).toContain('redacted:api-key')
    expect(captured).toContain('alice:«redacted»@github.com')
    expect(captured).not.toContain(SECRET_FIXTURES.github)
    expect(captured).not.toContain(SECRET_FIXTURES.apiKey)
    expect(captured).not.toContain('hunter2pass')
  })
})
