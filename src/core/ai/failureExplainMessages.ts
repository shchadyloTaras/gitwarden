import type { GitErrorCode } from '../types.js'
import type { FailureSuggestedAction } from './types.js'

export const FAILURE_CATEGORY_BY_CODE: Record<GitErrorCode, string> = {
  notARepository: 'repository',
  authenticationFailed: 'authentication',
  remoteNotFound: 'remote',
  branchNotFound: 'branch',
  mergeConflict: 'merge',
  nothingToCommit: 'commit',
  networkError: 'network',
  gitNotFound: 'toolchain',
  unknown: 'unknown',
}

export const FAILURE_ACTION_BY_CODE: Record<GitErrorCode, FailureSuggestedAction> = {
  notARepository: 'open-repositories',
  authenticationFailed: 'review-auth',
  remoteNotFound: 'configure-remote',
  branchNotFound: 'switch-branch',
  mergeConflict: 'resolve-conflicts',
  nothingToCommit: 'stage-changes',
  networkError: 'check-network',
  gitNotFound: 'open-settings',
  unknown: 'none',
}

export function explainGitError(code: GitErrorCode, userMessage: string): string {
  return userMessage || `Git reported a ${FAILURE_CATEGORY_BY_CODE[code]} error.`
}

export function actionHintForFailure(code: GitErrorCode): string {
  switch (code) {
    case 'notARepository':
      return 'Open Repositories and add or re-select a valid Git working tree.'
    case 'authenticationFailed':
      return 'Check SSH keys, HTTPS tokens, and the profile linked to this repository.'
    case 'remoteNotFound':
      return 'Verify the remote URL in Remote and that you have access to the repository.'
    case 'branchNotFound':
      return 'Switch to an existing branch or create the branch locally first.'
    case 'mergeConflict':
      return 'Resolve conflict markers, stage the fixes, then retry your Git action.'
    case 'nothingToCommit':
      return 'Stage changes on the Status screen before committing.'
    case 'networkError':
      return 'Check your network connection and try again.'
    case 'gitNotFound':
      return 'Set a valid Git executable path in Settings.'
    default:
      return 'Review the technical details and retry after fixing the underlying issue.'
  }
}

export function explainToolOutput(output: string): string {
  const trimmed = output.trim()
  if (!trimmed) return 'Paste test or lint output to get suggested next steps.'
  const firstLine = trimmed.split('\n')[0].slice(0, 200)
  return `Tool output starts with: ${firstLine}`
}

export function categoryForToolOutput(output: string): string {
  if (/eslint|prettier|typescript error|TS\d+/i.test(output)) return 'lint'
  if (/FAIL|AssertionError|expect\(|vitest|jest|playwright/i.test(output)) return 'test'
  if (/error:|fatal:|panic!/i.test(output)) return 'build'
  return 'tool-output'
}

export function suggestedActionForToolOutput(output: string): FailureSuggestedAction {
  if (/eslint|prettier|typescript error|TS\d+/i.test(output)) return 'review-staged-changes'
  if (/authentication|permission denied|401|403/i.test(output)) return 'review-auth'
  return 'none'
}

export function actionHintForToolOutput(output: string): string {
  const category = categoryForToolOutput(output)
  if (category === 'lint') return 'Fix the reported lint/type errors, then re-run the check.'
  if (category === 'test') return 'Open the failing test file and fix the assertion or setup.'
  if (category === 'build') return 'Fix the build error in the referenced file, then rebuild.'
  return 'Use the output lines above to locate the first failing step.'
}
