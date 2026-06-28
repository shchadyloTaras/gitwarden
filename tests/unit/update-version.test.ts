import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isNewerVersion } from '../../src/core/updates/version'

describe('parseVersion', () => {
  it('parses a plain X.Y.Z version', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
  })

  it('strips a leading v or V', () => {
    expect(parseVersion('v0.1.1')).toEqual({ major: 0, minor: 1, patch: 1, prerelease: [] })
    expect(parseVersion('V2.0.0')).toEqual({ major: 2, minor: 0, patch: 0, prerelease: [] })
  })

  it('defaults missing minor/patch to 0', () => {
    expect(parseVersion('1')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: [] })
    expect(parseVersion('1.5')).toEqual({ major: 1, minor: 5, patch: 0, prerelease: [] })
  })

  it('captures dot-separated pre-release identifiers', () => {
    expect(parseVersion('1.0.0-beta.2')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['beta', '2'],
    })
  })

  it('ignores build metadata for parsing', () => {
    expect(parseVersion('1.2.3+build.99')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    })
  })

  it('returns null for non-numeric core, too many segments, empty, or empty pre-release id', () => {
    expect(parseVersion('abc')).toBeNull()
    expect(parseVersion('1.2.3.4')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('1.0.0-')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, minor, then patch', () => {
    expect(compareVersions('0.1.2', '0.1.1')).toBe(1)
    expect(compareVersions('0.1.1', '0.2.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('ignores a leading v on either side', () => {
    expect(compareVersions('v0.2.0', '0.1.9')).toBe(1)
    expect(compareVersions('0.1.0', 'v0.1.0')).toBe(0)
  })

  it('ranks a pre-release below the same released version', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
  })

  it('orders pre-release identifiers per SemVer (numeric < alphanumeric, more wins ties)', () => {
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1) // numeric < alphanumeric
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1) // more identifiers wins
  })

  it('returns 0 when either side is not comparable', () => {
    expect(compareVersions('garbage', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', 'nope')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('is true only for a strictly newer candidate', () => {
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true)
    expect(isNewerVersion('v1.0.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false)
  })

  it('is false for an unparseable candidate', () => {
    expect(isNewerVersion('not-a-version', '0.1.1')).toBe(false)
  })
})
