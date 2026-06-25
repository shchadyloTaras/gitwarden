import { describe, expect, it } from 'vitest'
import {
  AI_CONTEXT_FORMAT_VERSION,
  chunkRedactedContext,
  prepareAiContext,
  type AiRawContext,
} from '../../src/core/ai/context'

const STRADDLING_GITHUB_TOKEN = `ghp_${'a'.repeat(36)}`

function rawContext(diff: string): AiRawContext {
  return {
    version: AI_CONTEXT_FORMAT_VERSION,
    requestKind: 'commit-draft',
    repository: {
      id: 'repo-1',
      name: 'Fixture',
      localPath: '/tmp/fixture',
      aiOverride: 'enabled',
    },
    branch: 'main',
    status: { files: [], ahead: 0, behind: 0 },
    identity: { userName: 'Alice', userEmail: 'alice@example.com', emailSource: 'local' },
    remotes: [{ name: 'origin', url: 'https://github.com/acme/fixture.git', host: 'github.com' }],
    safety: { canCommit: true, canPush: true, issues: [] },
    recentCommits: [],
    stagedDiffs: [{ path: 'secret.txt', staged: true, diff }],
    selectedUnstagedDiffs: [],
  }
}

describe('AI context preparation', () => {
  it('redacts the full context before chunking, including a token longer than a chunk', () => {
    const prepared = prepareAiContext({
      requestId: 'req-1',
      connectionId: 'conn-1',
      kind: 'commit-draft',
      destinationHost: 'openrouter.ai',
      privacyMode: 'preview-each',
      rawContext: rawContext(`+ ${STRADDLING_GITHUB_TOKEN}\n`),
      chunkSize: 20,
      maxChunks: 80,
    })

    expect(prepared.payloadText).not.toContain('ghp_')
    expect(prepared.payloadText).toContain('redacted:github-token')
    expect(prepared.chunks.every((chunk) => chunk.text.length <= 20)).toBe(true)
    expect(prepared.redactions.matches.some((match) => match.ruleId === 'github-token')).toBe(true)
  })

  it('chunks and truncates deterministically after redaction', () => {
    const redactedText = 'abcdefghijklmnopqrstuvwxyz'
    const chunked = chunkRedactedContext(redactedText, { chunkSize: 5, maxChunks: 3 })

    expect(chunked.payloadText).toBe('abcdefghijklmno')
    expect(chunked.truncated).toBe(true)
    expect(chunked.omittedChars).toBe(11)
    expect(chunked.chunks).toEqual([
      { index: 0, total: 3, start: 0, end: 5, text: 'abcde' },
      { index: 1, total: 3, start: 5, end: 10, text: 'fghij' },
      { index: 2, total: 3, start: 10, end: 15, text: 'klmno' },
    ])
  })

  it('truncates only after redaction, so omitted text cannot reveal fixture shapes', () => {
    const secret = `sk-or-v1-${'b'.repeat(24)}`
    const prepared = prepareAiContext({
      requestId: 'req-2',
      connectionId: 'conn-1',
      kind: 'commit-draft',
      destinationHost: 'openrouter.ai',
      privacyMode: 'preview-each',
      rawContext: rawContext(`+ ${secret}\n${'large diff line\n'.repeat(100)}`),
      chunkSize: 2000,
      maxChunks: 1,
    })

    expect(prepared.truncated).toBe(true)
    expect(prepared.payloadText).not.toContain(secret)
    expect(prepared.payloadText).not.toContain('sk-or-v1-')
    expect(prepared.payloadText).toContain('redacted:api-key')
  })
})
