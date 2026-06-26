import { describe, expect, it } from 'vitest'
import { providerJsonSchemaForKind } from '../../src/core/ai/providerSchemas'
import { AiRequestKindSchema } from '../../src/core/ai/schemas'

describe('providerJsonSchemaForKind', () => {
  it('returns a strict object schema with properties for every request kind', () => {
    for (const kind of AiRequestKindSchema.options) {
      const schema = providerJsonSchemaForKind(kind) as {
        type?: string
        properties?: Record<string, unknown>
        required?: string[]
        additionalProperties?: boolean
      }
      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
      expect(schema.properties).toBeTruthy()
      expect(Object.keys(schema.properties ?? {}).length).toBeGreaterThan(0)
      expect(Array.isArray(schema.required)).toBe(true)
      expect(schema.required?.length).toBeGreaterThan(0)
    }
  })
})
