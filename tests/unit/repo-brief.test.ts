import { describe, expect, it } from 'vitest'
import {
  buildDeterministicRepoBrief,
  inferLikelyBuildCommands,
  inferLikelyTestCommands,
  isAllowlistedRepoBriefPath,
  extractPackageScripts,
} from '../../src/core/ai/index.js'

describe('repo allowlist', () => {
  it('allows README and package.json at repo root', () => {
    expect(isAllowlistedRepoBriefPath('README.md')).toBe(true)
    expect(isAllowlistedRepoBriefPath('package.json')).toBe(true)
  })

  it('rejects traversal and .git paths', () => {
    expect(isAllowlistedRepoBriefPath('../secret')).toBe(false)
    expect(isAllowlistedRepoBriefPath('.git/config')).toBe(false)
  })
})

describe('buildDeterministicRepoBrief', () => {
  it('infers npm scripts without executing them', () => {
    const scripts = extractPackageScripts(
      JSON.stringify({ scripts: { build: 'vite build', test: 'vitest run' } })
    )
    expect(inferLikelyBuildCommands(scripts)).toContain('npm run build')
    expect(inferLikelyTestCommands(scripts)).toContain('npm run test')

    const brief = buildDeterministicRepoBrief(
      'demo',
      [{ path: 'package.json', content: '{"scripts":{"build":"vite build","test":"vitest"}}' }],
      [
        {
          fullHash: 'abc123',
          shortHash: 'abc',
          authorName: 'A',
          authorEmail: 'a@x.com',
          date: '2026-01-01',
          message: 'init',
        },
      ]
    )
    expect(brief.includedFiles).toEqual(['package.json'])
    expect(brief.source).toBe('deterministic')
  })
})
