import { describe, expect, it } from 'vitest'
import {
  AGENTIC_ACTION_ALLOWLIST,
  assertSafeAgenticRepoPath,
} from '../../src/core/ai/agenticActions.js'
import { validateAgenticProposal } from '../../src/core/ai/agenticProposal.js'

describe('agentic proposal validation', () => {
  it('keeps the closed allowlist aligned with supported action kinds', () => {
    expect([...AGENTIC_ACTION_ALLOWLIST]).toEqual([
      'write-repo-file',
      'suggest-navigation',
      'copy-command',
    ])
  })

  it('accepts allowlisted navigation and file edits', () => {
    const proposal = validateAgenticProposal({
      summary: 'ok',
      actions: [{ kind: 'suggest-navigation', target: 'commit' }],
      fileEdits: [{ path: 'notes.txt', after: 'hello' }],
    })
    expect(proposal.fileEdits[0].path).toBe('notes.txt')
  })

  it('rejects .git paths', () => {
    expect(() => assertSafeAgenticRepoPath('.git/config')).toThrow(/\.git/)
  })
})
