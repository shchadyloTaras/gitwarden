import { describe, expect, it } from 'vitest'
import {
  buildDeterministicHistorySummary,
  mergeHistorySummary,
} from '../../src/core/ai/historySummary'
import type { GitCommit } from '../../src/core/types'

const commits: GitCommit[] = [
  {
    fullHash: 'def456',
    shortHash: 'def456',
    authorName: 'Bob',
    authorEmail: 'bob@example.com',
    date: '2026-06-02T00:00:00Z',
    message: 'fix: history panel',
  },
  {
    fullHash: 'abc123',
    shortHash: 'abc123',
    authorName: 'Alice',
    authorEmail: 'alice@example.com',
    date: '2026-06-01T00:00:00Z',
    message: 'feat: initial',
  },
]

describe('History Intelligence (Phase 35)', () => {
  it('builds deterministic release notes, activity, and changelog drafts', () => {
    const summary = buildDeterministicHistorySummary(commits, 'main')
    expect(summary.source).toBe('deterministic')
    expect(summary.releaseNotesDraft).toContain('Draft release notes for main')
    expect(summary.releaseNotesDraft).toContain('fix: history panel')
    expect(summary.branchActivity).toContain('Bob')
    expect(summary.changelogDraft).toContain('def456')
  })

  it('mergeHistorySummary marks AI-enhanced drafts', () => {
    const deterministic = buildDeterministicHistorySummary(commits, 'main')
    const merged = mergeHistorySummary(deterministic, {
      releaseNotesDraft: '## v0.2\n- History intelligence',
      branchActivity: 'Active development on main.',
      changelogDraft: '- History panel added',
    })
    expect(merged.source).toBe('ai')
    expect(merged.releaseNotesDraft).toContain('v0.2')
  })
})
