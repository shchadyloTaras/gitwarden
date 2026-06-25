import { describe, it, expect } from 'vitest'
import {
  parseJsonPath,
  isSafeJsonPath,
  getByJsonPath,
  UnsafeJsonPathError,
} from '../../src/core/ai/jsonpath'

describe('parseJsonPath — safe subset (§6.3)', () => {
  it('parses dotted keys and numeric indices', () => {
    expect(parseJsonPath('$.choices[0].message.content')).toEqual([
      { type: 'key', key: 'choices' },
      { type: 'index', index: 0 },
      { type: 'key', key: 'message' },
      { type: 'key', key: 'content' },
    ])
  })

  it('parses bracket-quoted simple keys', () => {
    expect(parseJsonPath("$.usage['prompt_tokens']")).toEqual([
      { type: 'key', key: 'usage' },
      { type: 'key', key: 'prompt_tokens' },
    ])
    expect(parseJsonPath('$["completion_tokens"]')).toEqual([
      { type: 'key', key: 'completion_tokens' },
    ])
  })

  it('REJECTS recursive descent, wildcards, filters, scripts, slices, unions', () => {
    const unsafe = [
      '$..content', // recursive descent
      '$.choices[*]', // wildcard index
      '$.choices.*', // wildcard key
      '$.choices[?(@.x)]', // filter expression
      '$.choices[(@.length-1)]', // script expression
      '$.choices[0:2]', // slice
      '$.choices[0,1]', // union
      '$.a-b', // dash key (outside subset)
      'choices[0]', // missing root
      '$', // root only, no segments
      '', // empty
    ]
    for (const p of unsafe) {
      expect(isSafeJsonPath(p), p).toBe(false)
      expect(() => parseJsonPath(p), p).toThrow(UnsafeJsonPathError)
    }
  })
})

describe('getByJsonPath — pure navigation, no eval', () => {
  const obj = {
    choices: [{ message: { content: 'hello world' } }],
    usage: { prompt_tokens: 12, completion_tokens: 34 },
  }

  it('reads nested values', () => {
    expect(getByJsonPath(obj, '$.choices[0].message.content')).toBe('hello world')
    expect(getByJsonPath(obj, '$.usage.prompt_tokens')).toBe(12)
    expect(getByJsonPath(obj, "$.usage['completion_tokens']")).toBe(34)
  })

  it('returns undefined for missing / type-mismatched segments', () => {
    expect(getByJsonPath(obj, '$.choices[5].message.content')).toBeUndefined()
    expect(getByJsonPath(obj, '$.usage[0]')).toBeUndefined() // index into object
    expect(getByJsonPath(obj, '$.choices.content')).toBeUndefined() // key into array
    expect(getByJsonPath({}, '$.a.b.c')).toBeUndefined()
  })

  it('throws on an unsafe path rather than navigating', () => {
    expect(() => getByJsonPath(obj, '$..content')).toThrow(UnsafeJsonPathError)
  })
})
