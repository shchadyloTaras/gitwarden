import { describe, expect, it } from 'vitest'
import { buildDeterministicPushBrief, mergePushBrief } from '../../src/core/ai/pushBrief'
import type { AiPushIdentityContext } from '../../src/core/ai/types'
import type { GitCommit } from '../../src/core/types'

const commits: GitCommit[] = [
  {
    fullHash: 'abc123',
    shortHash: 'abc123',
    authorName: 'Alice',
    authorEmail: 'alice@example.com',
    date: '2026-06-01T00:00:00Z',
    message: 'feat: add push brief',
  },
]

const identity: AiPushIdentityContext = {
  remoteName: 'origin',
  branch: 'main',
  remoteHost: 'github.com',
  activeProfileName: 'Work',
  activeProfileEmail: 'alice@example.com',
  identityName: 'Alice Dev',
  identityEmail: 'alice@example.com',
  github: {
    assignedLogin: 'alice',
    effectiveLogin: 'alice',
    hasToken: true,
    tokenInvalid: false,
  },
}

describe('Push Brief (Phase 35)', () => {
  it('builds a deterministic brief with commit highlights and identity note', () => {
    const brief = buildDeterministicPushBrief(commits, identity)
    expect(brief.source).toBe('deterministic')
    expect(brief.commitCount).toBe(1)
    expect(brief.summary).toContain('origin')
    expect(brief.highlights[0]).toContain('feat: add push brief')
    expect(brief.identityNote).toContain('GitHub HTTPS push account: @alice')
    expect(brief.identityNote).not.toMatch(/ghp_|sk-|token/i)
  })

  it('reports up to date when there are no commits ahead', () => {
    const brief = buildDeterministicPushBrief([], identity)
    expect(brief.commitCount).toBe(0)
    expect(brief.summary).toContain('up to date')
    expect(brief.highlights).toHaveLength(0)
  })

  it('mergePushBrief keeps identity note deterministic when AI enhances text', () => {
    const deterministic = buildDeterministicPushBrief(commits, identity)
    const merged = mergePushBrief(deterministic, {
      summary: 'Publishing one feature commit to origin.',
      highlights: ['Adds push brief before confirmation.'],
    })
    expect(merged.source).toBe('ai')
    expect(merged.identityNote).toBe(deterministic.identityNote)
    expect(merged.summary).toContain('Publishing')
  })
})
