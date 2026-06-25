import { describe, expect, it } from 'vitest'
import {
  BUILTIN_CONNECTION_TEMPLATES,
  assertTemplateHasNoSecrets,
  connectionToTemplateExport,
} from '../../src/core/ai/connectionTemplates.js'

describe('connection templates', () => {
  it('ships built-in templates without secrets', () => {
    expect(BUILTIN_CONNECTION_TEMPLATES.length).toBeGreaterThanOrEqual(5)
    for (const template of BUILTIN_CONNECTION_TEMPLATES) {
      expect(() => assertTemplateHasNoSecrets(template)).not.toThrow()
      expect(template.version).toBe(1)
    }
  })

  it('exports connection metadata without ids or secrets', () => {
    const exported = connectionToTemplateExport({
      name: 'Prod OpenRouter',
      kind: 'openrouter',
      defaultModel: 'openrouter/auto',
      privacyMode: 'preview-each',
      retention: 'unknown',
    })
    expect(exported.name).toBe('Prod OpenRouter')
    expect(JSON.stringify(exported)).not.toContain('sk-')
  })
})
