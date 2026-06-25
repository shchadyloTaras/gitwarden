import { describe, expect, it } from 'vitest'
import type { AiContextDiff } from '../../src/core/ai/context'
import {
  groupFindingsByCategory,
  mergeChangeReview,
  scanDeterministicFindings,
} from '../../src/core/ai/changeReview'

const SECRET_TOKEN = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz'

describe('scanDeterministicFindings', () => {
  it('detects secret-like content via the shared redaction ruleset', () => {
    const diffs: AiContextDiff[] = [
      {
        path: 'config.env',
        staged: true,
        diff: `+API_TOKEN=${SECRET_TOKEN}\n`,
      },
    ]
    const findings = scanDeterministicFindings(diffs)
    expect(findings.some((f) => f.category === 'secret-like' && f.source === 'deterministic')).toBe(
      true
    )
    expect(findings[0]?.confidence).toBe('high')
    expect(findings[0]?.why).toContain('config.env')
  })

  it('does not flag secret-like content that appears only in removed diff lines', () => {
    const diffs: AiContextDiff[] = [
      {
        path: 'config.env',
        staged: true,
        diff: `--- a/config.env\n+++ b/config.env\n-API_TOKEN=${SECRET_TOKEN}\n`,
      },
      {
        path: 'secrets.txt',
        staged: true,
        diff: `-TOKEN=${SECRET_TOKEN}\n`,
      },
    ]
    const findings = scanDeterministicFindings(diffs)
    expect(findings.some((f) => f.category === 'secret-like')).toBe(false)
  })

  it('flags secret-like content in newly added diff lines', () => {
    const diffs: AiContextDiff[] = [
      {
        path: 'config.env',
        staged: true,
        diff: `-OLD=value\n+API_TOKEN=${SECRET_TOKEN}\n`,
      },
    ]
    const findings = scanDeterministicFindings(diffs)
    expect(findings.some((f) => f.category === 'secret-like')).toBe(true)
  })

  it('flags lockfiles, migrations, and risky paths', () => {
    const diffs: AiContextDiff[] = [
      { path: 'package-lock.json', staged: true, diff: '+  "version": "2"\n' },
      { path: 'db/migrations/001_init.sql', staged: true, diff: '+CREATE TABLE users;\n' },
      { path: '.env.production', staged: true, diff: '+MODE=prod\n' },
    ]
    const findings = scanDeterministicFindings(diffs)
    const categories = new Set(findings.map((f) => f.category))
    expect(categories.has('lockfile')).toBe(true)
    expect(categories.has('migration')).toBe(true)
    expect(categories.has('risky-file')).toBe(true)
  })

  it('flags destructive diffs and missing tests heuristically', () => {
    const deletions = Array.from({ length: 12 }, (_, i) => `-line ${i}`).join('\n')
    const diffs: AiContextDiff[] = [
      { path: 'src/util.ts', staged: true, diff: deletions },
      { path: 'src/feature.ts', staged: true, diff: '+export const x = 1\n' },
    ]
    const findings = scanDeterministicFindings(diffs)
    expect(findings.some((f) => f.category === 'destructive')).toBe(true)
    expect(findings.some((f) => f.category === 'missing-tests')).toBe(true)
  })
})

describe('mergeChangeReview', () => {
  const deterministic = [
    {
      category: 'secret-like' as const,
      source: 'deterministic' as const,
      confidence: 'high' as const,
      file: 'secrets.txt',
      why: 'Secret detected.',
    },
  ]

  it('keeps deterministic findings when the model returns an empty all-clear', () => {
    const merged = mergeChangeReview(deterministic, [], 'All clear — nothing to worry about.')
    expect(merged.findings).toHaveLength(1)
    expect(merged.findings[0]?.source).toBe('deterministic')
    expect(merged.overall).toBeUndefined()
  })

  it('merges AI findings alongside deterministic ones', () => {
    const merged = mergeChangeReview(deterministic, [
      {
        category: 'risky-file',
        source: 'ai',
        confidence: 'medium',
        file: 'readme.txt',
        why: 'Model thinks this path is sensitive.',
      },
    ])
    expect(merged.findings).toHaveLength(2)
    expect(merged.findings.some((f) => f.source === 'ai')).toBe(true)
  })
})

describe('groupFindingsByCategory', () => {
  it('groups findings for UI rendering', () => {
    const groups = groupFindingsByCategory([
      {
        category: 'lockfile',
        source: 'deterministic',
        confidence: 'medium',
        file: 'yarn.lock',
        why: 'Lockfile changed.',
      },
      {
        category: 'secret-like',
        source: 'deterministic',
        confidence: 'high',
        file: 'a.env',
        why: 'Secret.',
      },
    ])
    expect(groups.get('lockfile')).toHaveLength(1)
    expect(groups.get('secret-like')).toHaveLength(1)
  })
})
