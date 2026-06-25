import type { z } from 'zod'
import type { AiRequestKind } from '../../core/ai/types.js'
import {
  AI_CONTEXT_FORMAT_VERSION,
  createAiContextMessages,
  prepareAiContext,
  type AiContextDiff,
  type AiPreparedContext,
  type AiRawContext,
} from '../../core/ai/context.js'
import { isAiSendAllowed } from '../../core/ai/precedence.js'
import { safetyCheckService } from '../../core/safety/SafetyCheckService.js'
import type { RepositoryRecord } from '../../core/types.js'
import type { IProfileService } from '../services/ProfileService.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { ISettingsService } from '../services/SettingsService.js'
import type { GitService } from '../services/GitService.js'
import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { AiAdapter } from './types.js'
import {
  ANTHROPIC_BASE_URL,
  OLLAMA_BASE_URL,
  OPENAI_COMPATIBLE_BASE_URL,
  OPENROUTER_BASE_URL,
} from './adapterUtils.js'

const RECENT_COMMITS_LIMIT = 5

export interface AiContextBuildInput {
  repositoryId: string
  kind: AiRequestKind
  selectedUnstagedPaths?: string[]
  commitMessage?: string
}

export interface AiContextBuilderDeps {
  profiles: IProfileService
  repositories: IRepositoryService
  settings: ISettingsService
  git: Pick<
    GitService,
    'getStatus' | 'getEffectiveIdentity' | 'getRemotes' | 'getCommitHistory' | 'getDiff'
  >
  aiConnections: IAiConnectionService
}

export interface AiContextBuilderOptions {
  chunkSize?: number
  maxChunks?: number
  requestId?: () => string
}

export class AiContextBuilder {
  private readonly requestId: () => string

  constructor(
    private readonly deps: AiContextBuilderDeps,
    private readonly options: AiContextBuilderOptions = {}
  ) {
    this.requestId = options.requestId ?? (() => crypto.randomUUID())
  }

  async buildPreview(input: AiContextBuildInput): Promise<AiPreparedContext> {
    const [repository, settings, connectionsView] = await Promise.all([
      this.requireRepository(input.repositoryId),
      this.deps.settings.get(),
      this.deps.aiConnections.list(),
    ])

    const connectionId = connectionsView.activeConnectionId
    if (!connectionId) throw new Error('No active AI connection selected.')

    const connection = connectionsView.connections.find((c) => c.id === connectionId)
    if (!connection) throw new Error('No active AI connection selected.')

    const repoOverride =
      repository.aiOverride === 'enabled'
        ? true
        : repository.aiOverride === 'disabled'
          ? false
          : undefined
    const globalEnabled = settings.aiEnabled ?? false
    if (
      !isAiSendAllowed({
        repoOverride,
        globalEnabled,
        connectionEnabled: connection.enabled,
      })
    ) {
      throw new Error(disabledReason(repository, globalEnabled, connection.enabled))
    }

    const [profiles, status, identity, remotes, recentCommits] = await Promise.all([
      this.deps.profiles.list(),
      this.deps.git.getStatus(repository.localPath),
      this.deps.git.getEffectiveIdentity(repository.localPath),
      this.deps.git.getRemotes(repository.localPath),
      this.getRecentCommits(repository.localPath),
    ])

    const activeProfile = settings.activeProfileId
      ? profiles.find((p) => p.id === settings.activeProfileId)
      : undefined
    const safety = safetyCheckService.checkCommit({
      repository,
      activeProfile,
      identity,
      status,
      commitMessage: input.commitMessage ?? '',
    })

    const stagedPaths = status.files
      .filter(
        (file) =>
          file.indexStatus !== 'unmodified' &&
          file.indexStatus !== 'untracked' &&
          file.indexStatus !== 'ignored' &&
          file.indexStatus !== 'conflicted'
      )
      .map((file) => file.path)
    const selectedUnstagedPaths = unique(input.selectedUnstagedPaths ?? [])

    const [stagedDiffs, selectedUnstagedDiffs] = await Promise.all([
      this.collectDiffs(repository.localPath, stagedPaths, true),
      this.collectDiffs(repository.localPath, selectedUnstagedPaths, false),
    ])

    const rawContext: AiRawContext = {
      version: AI_CONTEXT_FORMAT_VERSION,
      requestKind: input.kind,
      repository: {
        id: repository.id,
        name: repository.name,
        localPath: repository.localPath,
        remoteUrl: repository.remoteUrl,
        assignedProfileId: repository.assignedProfileId,
        aiOverride: repository.aiOverride,
      },
      branch: status.branch,
      status,
      identity,
      remotes,
      safety,
      recentCommits,
      stagedDiffs,
      selectedUnstagedDiffs,
    }

    return prepareAiContext({
      requestId: this.requestId(),
      connectionId: connection.id,
      kind: input.kind,
      destinationHost: destinationHostForConnection(connection),
      privacyMode: connection.privacyMode,
      rawContext,
      chunkSize: this.options.chunkSize,
      maxChunks: this.options.maxChunks,
    })
  }

  private async requireRepository(id: string): Promise<RepositoryRecord> {
    const repository = await this.deps.repositories.get(id)
    if (!repository) throw new Error(`Repository not found: ${id}`)
    return repository
  }

  private async getRecentCommits(repoPath: string) {
    try {
      return await this.deps.git.getCommitHistory(repoPath, RECENT_COMMITS_LIMIT, 0)
    } catch {
      return []
    }
  }

  private async collectDiffs(
    repoPath: string,
    paths: string[],
    staged: boolean
  ): Promise<AiContextDiff[]> {
    const diffs: AiContextDiff[] = []
    for (const path of paths) {
      const diff = await this.deps.git.getDiff(repoPath, path, staged)
      diffs.push({ path, staged, diff })
    }
    return diffs
  }
}

export async function sendPreparedContextForTest<T>(
  adapter: AiAdapter,
  preview: AiPreparedContext,
  responseSchema: z.ZodType<T>
): Promise<T> {
  return adapter.generateStructured({
    requestId: preview.requestId,
    connectionId: preview.connectionId,
    kind: preview.kind,
    messages: createAiContextMessages(preview),
    responseSchema,
    responseSchemaJson: zodToMinimalJsonSchema(responseSchema),
    metadata: {
      destinationHost: preview.destinationHost,
      redactionCount: preview.redactions.count,
      truncated: preview.truncated,
    },
    estimatedInputTokens: Math.ceil(preview.payloadText.length / 4),
  })
}

function destinationHostForConnection(connection: {
  kind: string
  baseUrl?: string
  customHttpMapping?: { url: string }
}): string {
  const url =
    connection.kind === 'custom-http'
      ? (connection.customHttpMapping?.url ?? connection.baseUrl)
      : (connection.baseUrl ?? fallbackBaseUrl(connection.kind))
  if (!url) return 'unknown'
  try {
    return new URL(url).host
  } catch {
    return 'unknown'
  }
}

function fallbackBaseUrl(kind: string): string | undefined {
  switch (kind) {
    case 'openrouter':
      return OPENROUTER_BASE_URL
    case 'openai-compatible':
      return OPENAI_COMPATIBLE_BASE_URL
    case 'anthropic':
      return ANTHROPIC_BASE_URL
    case 'ollama':
      return OLLAMA_BASE_URL
    default:
      return undefined
  }
}

function disabledReason(
  repository: RepositoryRecord,
  globalEnabled: boolean,
  connectionEnabled: boolean
): string {
  if (repository.aiOverride === 'disabled') return 'AI is disabled for this repository.'
  if (!globalEnabled) return 'AI is disabled globally.'
  if (!connectionEnabled) return 'The active AI connection is disabled.'
  return 'AI is not enabled for this repository.'
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort()
}

function zodToMinimalJsonSchema(schema: z.ZodType<unknown>): unknown {
  return {
    type: 'object',
    description: schema.description ?? 'GitWarden structured response',
  }
}
