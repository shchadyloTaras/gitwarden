// Deterministic staged-change review (Phase 33). Pure core — no I/O.
//
// The secret scanner reuses `findSecretMatches` / `REDACTION_RULES` from
// redaction.ts (§4: one ruleset, not a parallel pattern table).

import type { AiContextDiff } from './context.js'
import type { AiChangeReview, AiReviewFinding, AiReviewCategory } from './types.js'
import { findSecretMatches } from './redaction.js'
import {
  whyDestructive,
  whyGenerated,
  whyLockfile,
  whyMigration,
  whyMissingTests,
  whyRiskyFile,
  whySecretDetected,
} from './changeReviewMessages.js'

const RISKY_FILE = /(?:^|\/)(?:\.env(?:\.|$)|.*\.pem$|id_rsa|credentials|secrets?\.|\.npmrc$)/i
const MIGRATION =
  /(?:^|\/)(?:migrations?\/|db\/migrate\/|alembic\/versions\/|prisma\/migrations\/)/i
const LOCKFILE =
  /(?:^|\/)?(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/
const GENERATED =
  /(?:^|\/)(?:dist|build|coverage|__generated__)\/|\.min\.(?:js|css)$|\.generated\./i
const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|php|cs)$/
const TEST_SUFFIX = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/

function findingKey(f: AiReviewFinding): string {
  return `${f.category}\0${f.file ?? ''}\0${f.why}`
}

function dedupe(findings: AiReviewFinding[]): AiReviewFinding[] {
  const seen = new Set<string>()
  const out: AiReviewFinding[] = []
  for (const f of findings) {
    const key = findingKey(f)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
    if (line.startsWith('+')) additions++
    else if (line.startsWith('-')) deletions++
  }
  return { additions, deletions }
}

function testPathsFor(sourcePath: string): string[] {
  const dot = sourcePath.lastIndexOf('.')
  if (dot === -1) return [`${sourcePath}.test`, `${sourcePath}.spec`]
  const base = sourcePath.slice(0, dot)
  const ext = sourcePath.slice(dot)
  return [`${base}.test${ext}`, `${base}.spec${ext}`]
}

function scanFilePath(path: string, stagedPaths: Set<string>): AiReviewFinding[] {
  const findings: AiReviewFinding[] = []
  if (RISKY_FILE.test(path)) {
    findings.push({
      category: 'risky-file',
      source: 'deterministic',
      confidence: 'high',
      file: path,
      why: whyRiskyFile(path),
    })
  }
  if (MIGRATION.test(path)) {
    findings.push({
      category: 'migration',
      source: 'deterministic',
      confidence: 'high',
      file: path,
      why: whyMigration(path),
    })
  }
  if (LOCKFILE.test(path)) {
    findings.push({
      category: 'lockfile',
      source: 'deterministic',
      confidence: 'medium',
      file: path,
      why: whyLockfile(path),
    })
  }
  if (GENERATED.test(path)) {
    findings.push({
      category: 'generated',
      source: 'deterministic',
      confidence: 'medium',
      file: path,
      why: whyGenerated(path),
    })
  }
  if (SOURCE_EXT.test(path) && !TEST_SUFFIX.test(path)) {
    const hasTest = testPathsFor(path).some((t) => stagedPaths.has(t))
    if (!hasTest) {
      findings.push({
        category: 'missing-tests',
        source: 'deterministic',
        confidence: 'low',
        file: path,
        why: whyMissingTests(path),
      })
    }
  }
  return findings
}

function scanDiffContent(path: string, diff: string): AiReviewFinding[] {
  const findings: AiReviewFinding[] = []

  for (const match of findSecretMatches(diff)) {
    findings.push({
      category: 'secret-like',
      source: 'deterministic',
      confidence: 'high',
      file: path,
      why: whySecretDetected(match.label, path),
    })
  }

  const { additions, deletions } = countDiffLines(diff)
  if (deletions > 0 && (additions === 0 || deletions >= additions * 2) && deletions >= 5) {
    findings.push({
      category: 'destructive',
      source: 'deterministic',
      confidence: deletions >= 20 ? 'high' : 'medium',
      file: path,
      why: whyDestructive(path, deletions),
    })
  }

  return findings
}

/**
 * Scan staged diffs deterministically. Works with AI disabled — the secret
 * scanner uses the same redaction ruleset as Phase 31.
 */
export function scanDeterministicFindings(stagedDiffs: AiContextDiff[]): AiReviewFinding[] {
  const staged = stagedDiffs.filter((d) => d.staged)
  const stagedPaths = new Set(staged.map((d) => d.path))
  const findings: AiReviewFinding[] = []

  for (const { path, diff } of staged) {
    findings.push(...scanFilePath(path, stagedPaths))
    if (diff.trim()) findings.push(...scanDiffContent(path, diff))
  }

  return dedupe(findings)
}

/**
 * Merge deterministic and AI findings. Deterministic findings are always
 * kept — a model "all clear" cannot remove them.
 */
export function mergeChangeReview(
  deterministic: AiReviewFinding[],
  aiFindings: AiReviewFinding[],
  overall?: string
): AiChangeReview {
  const normalizedAi = aiFindings.map((f) => ({ ...f, source: 'ai' as const }))
  const merged = dedupe([...deterministic, ...normalizedAi])
  const hasDeterministic = deterministic.length > 0
  const safeOverall =
    hasDeterministic && overall?.toLowerCase().includes('all clear') ? undefined : overall
  return { findings: merged, overall: safeOverall }
}

/** Group findings by category for UI rendering. */
export function groupFindingsByCategory(
  findings: AiReviewFinding[]
): Map<AiReviewCategory, AiReviewFinding[]> {
  const groups = new Map<AiReviewCategory, AiReviewFinding[]>()
  for (const f of findings) {
    const list = groups.get(f.category) ?? []
    list.push(f)
    groups.set(f.category, list)
  }
  return groups
}
