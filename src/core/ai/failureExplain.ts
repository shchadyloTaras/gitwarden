import type { GitErrorCode } from '../types.js'
import {
  FAILURE_ACTION_BY_CODE,
  FAILURE_CATEGORY_BY_CODE,
  actionHintForFailure,
  actionHintForToolOutput,
  categoryForToolOutput,
  explainGitError,
  explainToolOutput,
  suggestedActionForToolOutput,
} from './failureExplainMessages.js'
import type { AiFailureExplanation } from './types.js'

export interface GitFailureInput {
  code: GitErrorCode
  userMessage: string
  technicalDetails?: string
}

export interface ToolFailureInput {
  output: string
}

export function buildDeterministicGitFailureExplanation(
  input: GitFailureInput
): AiFailureExplanation {
  return {
    code: input.code,
    category: FAILURE_CATEGORY_BY_CODE[input.code],
    explanation: explainGitError(input.code, input.userMessage),
    suggestedAction: FAILURE_ACTION_BY_CODE[input.code],
    actionHint: actionHintForFailure(input.code),
    source: 'deterministic',
  }
}

export function buildDeterministicToolFailureExplanation(
  input: ToolFailureInput
): AiFailureExplanation {
  return {
    code: 'tool-output',
    category: categoryForToolOutput(input.output),
    explanation: explainToolOutput(input.output),
    suggestedAction: suggestedActionForToolOutput(input.output),
    actionHint: actionHintForToolOutput(input.output),
    source: 'deterministic',
  }
}

/** AI may enhance explanation text; suggested action stays deterministic. */
export function mergeFailureExplanation(
  deterministic: AiFailureExplanation,
  aiExplanation?: string
): AiFailureExplanation {
  const trimmed = aiExplanation?.trim()
  if (!trimmed) return deterministic
  return {
    ...deterministic,
    explanation: trimmed,
    source: 'ai',
  }
}
