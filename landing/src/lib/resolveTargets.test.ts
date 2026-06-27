import { describe, it, expect } from 'vitest'
import { resolveTargets, isSidecar } from './resolveTargets'
import { RELEASES_URL } from './config'
import {
  latestReleaseFixture,
  emptyAssetsRelease,
  CANONICAL_FILENAMES,
} from './__fixtures__/latestRelease'

describe('resolveTargets — per-OS routing (plan §3, Appendix A)', () => {
  it('macOS → arm64.dmg primary + x64.dmg secondary', () => {
    const { primary, secondary } = resolveTargets(latestReleaseFixture, 'macOS')
    expect(primary?.filename).toBe(CANONICAL_FILENAMES.macArm64)
    expect(primary?.arch).toBe('arm64')
    expect(primary?.ext).toBe('.dmg')
    expect(secondary?.filename).toBe(CANONICAL_FILENAMES.macX64)
    expect(secondary?.arch).toBe('x64')
  })

  it('Windows → .exe primary, no secondary', () => {
    const { primary, secondary } = resolveTargets(latestReleaseFixture, 'Windows')
    expect(primary?.filename).toBe(CANONICAL_FILENAMES.winExe)
    expect(primary?.ext).toBe('.exe')
    expect(secondary).toBeUndefined()
  })

  it('Linux → AppImage primary + .deb secondary', () => {
    const { primary, secondary } = resolveTargets(latestReleaseFixture, 'Linux')
    expect(primary?.filename).toBe(CANONICAL_FILENAMES.linuxAppImage)
    expect(primary?.ext).toBe('.AppImage')
    expect(secondary?.filename).toBe(CANONICAL_FILENAMES.linuxDeb)
    expect(secondary?.arch).toBe('amd64')
  })

  it('unknown OS → no primary/secondary, but a usable fallback URL', () => {
    const { primary, secondary, releaseUrl } = resolveTargets(latestReleaseFixture, 'unknown')
    expect(primary).toBeUndefined()
    expect(secondary).toBeUndefined()
    expect(releaseUrl).toBe(latestReleaseFixture.html_url)
  })
})

describe('resolveTargets — target fields + all-downloads grouping', () => {
  it('populates every DownloadTarget field from the matched asset', () => {
    const { primary } = resolveTargets(latestReleaseFixture, 'macOS')
    expect(primary).toEqual({
      os: 'macOS',
      arch: 'arm64',
      label: 'macOS · Apple Silicon (arm64)',
      ext: '.dmg',
      filename: 'GitWarden-0.1.0-arm64.dmg',
      sizeBytes: 98123456,
      url: 'https://github.com/shchadyloTaras/gitwarden/releases/download/v0.1.0/GitWarden-0.1.0-arm64.dmg',
    })
  })

  it('groups all real installers by OS (primary first), excluding sidecars', () => {
    const { all } = resolveTargets(latestReleaseFixture, 'macOS')
    expect(all.macOS.map((t) => t.filename)).toEqual([
      CANONICAL_FILENAMES.macArm64,
      CANONICAL_FILENAMES.macX64,
    ])
    expect(all.Windows.map((t) => t.filename)).toEqual([CANONICAL_FILENAMES.winExe])
    expect(all.Linux.map((t) => t.filename)).toEqual([
      CANONICAL_FILENAMES.linuxAppImage,
      CANONICAL_FILENAMES.linuxDeb,
    ])
    expect(all.unknown).toEqual([])
    // 5 real installers across all OSes — the 4 sidecars are gone.
    const total = all.macOS.length + all.Windows.length + all.Linux.length
    expect(total).toBe(5)
  })

  it('returns the version (tag_name) from the release', () => {
    expect(resolveTargets(latestReleaseFixture, 'macOS').version).toBe('v0.1.0')
  })
})

describe('resolveTargets — sidecar exclusion (latest*.yml, *.blockmap)', () => {
  it('isSidecar flags auto-update sidecars and nothing else', () => {
    expect(isSidecar('latest.yml')).toBe(true)
    expect(isSidecar('latest-mac.yml')).toBe(true)
    expect(isSidecar('latest-linux.yml')).toBe(true)
    expect(isSidecar('GitWarden-Setup-0.1.0.exe.blockmap')).toBe(true)
    expect(isSidecar('GitWarden-0.1.0-arm64.dmg')).toBe(false)
    expect(isSidecar('gitwarden_0.1.0_amd64.deb')).toBe(false)
  })

  it('no resolved target is ever a sidecar', () => {
    const { all } = resolveTargets(latestReleaseFixture, 'macOS')
    const everyFilename = [...all.macOS, ...all.Windows, ...all.Linux].map((t) => t.filename)
    expect(everyFilename.some(isSidecar)).toBe(false)
  })
})

describe('resolveTargets — graceful fallback (never a dead end, plan §1/§3)', () => {
  it('null release (fetch failed / 404 — no release yet) → no targets, Releases-page fallback', () => {
    const r = resolveTargets(null, 'macOS')
    expect(r.primary).toBeUndefined()
    expect(r.secondary).toBeUndefined()
    expect(r.all.macOS).toEqual([])
    expect(r.releaseUrl).toBe(RELEASES_URL)
    expect(r.version).toBe('')
  })

  it('empty asset list → no targets, but release URL + version preserved', () => {
    const r = resolveTargets(emptyAssetsRelease, 'Windows')
    expect(r.primary).toBeUndefined()
    expect(r.all.Windows).toEqual([])
    expect(r.releaseUrl).toBe(emptyAssetsRelease.html_url)
    expect(r.version).toBe('v0.1.0')
  })

  it('every OS path returns a defined, non-empty releaseUrl (never undefined/throw)', () => {
    for (const os of ['macOS', 'Windows', 'Linux', 'unknown'] as const) {
      expect(resolveTargets(null, os).releaseUrl).toBeTruthy()
      expect(resolveTargets(latestReleaseFixture, os).releaseUrl).toBeTruthy()
    }
  })
})

describe('CONTRACT — Appendix A patterns ↔ Distribution §3 canonical filenames', () => {
  // A rename on either side must fail loudly here (plan §6 "Contract test").
  it('each canonical filename resolves to exactly its intended target', () => {
    const mac = resolveTargets(latestReleaseFixture, 'macOS')
    expect(mac.primary?.filename).toBe('GitWarden-0.1.0-arm64.dmg')
    expect(mac.secondary?.filename).toBe('GitWarden-0.1.0-x64.dmg')

    const win = resolveTargets(latestReleaseFixture, 'Windows')
    expect(win.primary?.filename).toBe('GitWarden-Setup-0.1.0.exe')

    const linux = resolveTargets(latestReleaseFixture, 'Linux')
    expect(linux.primary?.filename).toBe('GitWarden-0.1.0.AppImage')
    expect(linux.secondary?.filename).toBe('gitwarden_0.1.0_amd64.deb')
  })

  it('arm64 and x64 dmg patterns do not cross-match', () => {
    const onlyArm = resolveTargets(
      { ...latestReleaseFixture, assets: [latestReleaseFixture.assets[0]] },
      'macOS'
    )
    expect(onlyArm.primary?.filename).toBe('GitWarden-0.1.0-arm64.dmg')
    expect(onlyArm.secondary).toBeUndefined()

    const onlyX64 = resolveTargets(
      { ...latestReleaseFixture, assets: [latestReleaseFixture.assets[1]] },
      'macOS'
    )
    expect(onlyX64.primary).toBeUndefined()
    expect(onlyX64.secondary?.filename).toBe('GitWarden-0.1.0-x64.dmg')
  })
})
