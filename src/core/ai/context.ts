import type {
  EffectiveGitIdentity,
  GitCommit,
  GitRemote,
  GitStatus,
  RepositoryRecord,
  SafetyCheckResult,
} from '../types.js'
import type { AiPrivacyMode, AiPushIdentityContext, AiRequestKind, AiMessage } from './types.js'
import { redactSecrets, type RedactionMatch } from './redaction.js'

export const AI_CONTEXT_FORMAT_VERSION = 1
export const DEFAULT_AI_CONTEXT_CHUNK_SIZE = 12_000
export const DEFAULT_AI_CONTEXT_MAX_CHUNKS = 4

export interface AiContextDiff {
  path: string
  staged: boolean
  diff: string
}

export interface AiRawContext {
  version: typeof AI_CONTEXT_FORMAT_VERSION
  requestKind: AiRequestKind
  repository: Pick<
    RepositoryRecord,
    'id' | 'name' | 'localPath' | 'remoteUrl' | 'assignedProfileId' | 'aiOverride'
  >
  branch?: string
  status: GitStatus
  identity: EffectiveGitIdentity
  remotes: GitRemote[]
  safety: SafetyCheckResult
  recentCommits: GitCommit[]
  stagedDiffs: AiContextDiff[]
  selectedUnstagedDiffs: AiContextDiff[]
  /** Set when requestKind is `safety-explain`. */
  safetyIssueCode?: string
  /** Commits ahead of upstream when requestKind is `push-brief`. */
  commitsAhead?: GitCommit[]
  /** Token-free push identity when requestKind is `push-brief`. */
  pushIdentity?: AiPushIdentityContext
  /** Allowlisted repo files when requestKind is `repo-brief` (Phase 36). */
  allowlistedFiles?: Array<{ path: string; content: string }>
  /** Pasted tool output when requestKind is `failure-explain` (Phase 37). */
  failureToolOutput?: string
  /** Git error code when requestKind is `failure-explain` (Phase 37). */
  failureGitCode?: string
  failureUserMessage?: string
}

export interface AiContextChunk {
  index: number
  total: number
  start: number
  end: number
  text: string
}

export interface AiContextRedactionSummary {
  count: number
  matches: RedactionMatch[]
  labels: string[]
}

export interface AiPreparedContext {
  requestId: string
  connectionId: string
  kind: AiRequestKind
  destinationHost: string
  privacyMode: AiPrivacyMode
  payloadText: string
  chunks: AiContextChunk[]
  truncated: boolean
  omittedChars: number
  redactions: AiContextRedactionSummary
  /** Paths included in a repo-brief send (Phase 36). */
  includedFiles?: string[]
}

export interface AiContextPrepareInput {
  requestId: string
  connectionId: string
  kind: AiRequestKind
  destinationHost: string
  privacyMode: AiPrivacyMode
  rawContext: AiRawContext
  chunkSize?: number
  maxChunks?: number
}

export interface AiContextChunkOptions {
  chunkSize?: number
  maxChunks?: number
}

export function prepareAiContext(input: AiContextPrepareInput): AiPreparedContext {
  const serialized = stableStringify(input.rawContext)
  const { redacted, matches } = redactSecrets(serialized)
  const chunked = chunkRedactedContext(redacted, {
    chunkSize: input.chunkSize,
    maxChunks: input.maxChunks,
  })
  const labels = Array.from(new Set(matches.map((m) => m.label))).sort()

  return {
    requestId: input.requestId,
    connectionId: input.connectionId,
    kind: input.kind,
    destinationHost: input.destinationHost,
    privacyMode: input.privacyMode,
    payloadText: chunked.payloadText,
    chunks: chunked.chunks,
    truncated: chunked.truncated,
    omittedChars: chunked.omittedChars,
    redactions: {
      count: matches.length,
      matches,
      labels,
    },
    includedFiles: input.rawContext.allowlistedFiles?.map((f) => f.path).sort(),
  }
}

export function chunkRedactedContext(
  redactedText: string,
  options: AiContextChunkOptions = {}
): Pick<AiPreparedContext, 'payloadText' | 'chunks' | 'truncated' | 'omittedChars'> {
  const chunkSize = options.chunkSize ?? DEFAULT_AI_CONTEXT_CHUNK_SIZE
  const maxChunks = options.maxChunks ?? DEFAULT_AI_CONTEXT_MAX_CHUNKS
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('AI context chunkSize must be a positive integer')
  }
  if (!Number.isInteger(maxChunks) || maxChunks <= 0) {
    throw new Error('AI context maxChunks must be a positive integer')
  }

  const maxChars = chunkSize * maxChunks
  const payloadText = redactedText.slice(0, maxChars)
  const omittedChars = Math.max(0, redactedText.length - payloadText.length)
  const total = Math.max(1, Math.ceil(payloadText.length / chunkSize))
  const chunks: AiContextChunk[] = []

  for (let start = 0, index = 0; start < payloadText.length; start += chunkSize, index += 1) {
    const end = Math.min(start + chunkSize, payloadText.length)
    chunks.push({
      index,
      total,
      start,
      end,
      text: payloadText.slice(start, end),
    })
  }

  if (chunks.length === 0) {
    chunks.push({ index: 0, total: 1, start: 0, end: 0, text: '' })
  }

  return {
    payloadText,
    chunks,
    truncated: omittedChars > 0,
    omittedChars,
  }
}

export function createAiContextMessages(preview: AiPreparedContext): AiMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are GitWarden advisory AI. Use only the provided post-redaction repository context.',
    },
    {
      role: 'user',
      content: [
        `Destination host: ${preview.destinationHost}`,
        `Request kind: ${preview.kind}`,
        `Redactions applied: ${preview.redactions.count}`,
        `Truncated: ${preview.truncated ? `yes (${preview.omittedChars} chars omitted)` : 'no'}`,
        '',
        preview.payloadText,
      ].join('\n'),
    },
  ]
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value), null, 2)
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys)
  if (!value || typeof value !== 'object') return value

  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    const child = (value as Record<string, unknown>)[key]
    if (child !== undefined) sorted[key] = sortObjectKeys(child)
  }
  return sorted
}
