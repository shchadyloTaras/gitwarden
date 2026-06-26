import { describe, expect, it } from 'vitest'
import type { AiModelInfo } from '../../core/ai/types'
import {
  modelDropdownOptions,
  modelOptionLabel,
} from '../../src/renderer/components/aiModelOptions'

function model(id: string, label?: string): AiModelInfo {
  return { id, label, structuredOutput: true, localOnly: false }
}

describe('modelDropdownOptions', () => {
  it('formats labels and drops duplicate ids', () => {
    const options = modelDropdownOptions([
      model('openrouter/a', 'Model A'),
      model('openrouter/a', 'Model A duplicate'),
      model('openrouter/b'),
    ])
    expect(options).toEqual([
      { value: 'openrouter/a', label: 'Model A (openrouter/a)' },
      { value: 'openrouter/b', label: 'openrouter/b' },
    ])
  })

  it('modelOptionLabel falls back to id', () => {
    expect(modelOptionLabel(model('only-id'))).toBe('only-id')
  })
})
