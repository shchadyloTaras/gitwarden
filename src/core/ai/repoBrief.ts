import type { GitCommit } from '../types.js'
import {
  extractPackageScripts,
  inferLikelyBuildCommands,
  inferLikelyTestCommands,
} from './repoAllowlist.js'
import { repoBriefBuildHint, repoBriefSummary, repoBriefTestHint } from './repoBriefMessages.js'
import type { AiAllowlistedFile, AiRepoBrief } from './types.js'

export interface RepoBriefFileInput {
  path: string
  content: string
}

export function buildDeterministicRepoBrief(
  repoName: string,
  files: RepoBriefFileInput[],
  recentCommits: GitCommit[]
): AiRepoBrief {
  const includedFiles = files.map((f) => f.path).sort()
  const packageFile = files.find(
    (f) => f.path === 'package.json' || f.path.endsWith('/package.json')
  )
  const scripts = packageFile ? extractPackageScripts(packageFile.content) : undefined
  const likelyBuildCommands = inferLikelyBuildCommands(scripts)
  const likelyTestCommands = inferLikelyTestCommands(scripts)

  return {
    projectSummary: repoBriefSummary(repoName, includedFiles, recentCommits),
    likelyBuildCommands,
    likelyTestCommands,
    buildHint: repoBriefBuildHint(likelyBuildCommands),
    testHint: repoBriefTestHint(likelyTestCommands),
    includedFiles,
    source: 'deterministic',
  }
}

export function toAllowlistedFileRecords(files: RepoBriefFileInput[]): AiAllowlistedFile[] {
  return files.map((f) => ({ path: f.path, byteLength: f.content.length }))
}

/** AI may enhance summary/hints; includedFiles stay from the allowlist scan. */
export function mergeRepoBrief(
  deterministic: AiRepoBrief,
  ai?: Partial<
    Pick<
      AiRepoBrief,
      'projectSummary' | 'likelyBuildCommands' | 'likelyTestCommands' | 'buildHint' | 'testHint'
    >
  >
): AiRepoBrief {
  const projectSummary = ai?.projectSummary?.trim() || deterministic.projectSummary
  const likelyBuildCommands =
    ai?.likelyBuildCommands && ai.likelyBuildCommands.length > 0
      ? ai.likelyBuildCommands
      : deterministic.likelyBuildCommands
  const likelyTestCommands =
    ai?.likelyTestCommands && ai.likelyTestCommands.length > 0
      ? ai.likelyTestCommands
      : deterministic.likelyTestCommands
  const buildHint = ai?.buildHint?.trim() || deterministic.buildHint
  const testHint = ai?.testHint?.trim() || deterministic.testHint
  const changed =
    projectSummary !== deterministic.projectSummary ||
    buildHint !== deterministic.buildHint ||
    testHint !== deterministic.testHint ||
    likelyBuildCommands.join() !== deterministic.likelyBuildCommands.join() ||
    likelyTestCommands.join() !== deterministic.likelyTestCommands.join()
  if (!changed) return deterministic
  return {
    ...deterministic,
    projectSummary,
    likelyBuildCommands,
    likelyTestCommands,
    buildHint,
    testHint,
    source: 'ai',
  }
}
