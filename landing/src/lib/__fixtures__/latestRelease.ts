/**
 * Fixture release payloads for offline tests (plan §6: "Tests run offline … No real network
 * call"). Mirrors the trimmed `releases/latest` shape in plan Appendix D, including the
 * auto-update sidecars (`latest*.yml`, `*.blockmap`) that the resolver must exclude.
 */
import type { Release } from '../types'

const BASE = 'https://github.com/shchadyloTaras/gitwarden/releases'
const DL = `${BASE}/download/v0.1.0`

export const latestReleaseFixture: Release = {
  tag_name: 'v0.1.0',
  name: 'GitWarden 0.1.0',
  draft: false,
  prerelease: false,
  html_url: `${BASE}/tag/v0.1.0`,
  assets: [
    {
      name: 'GitWarden-0.1.0-arm64.dmg',
      size: 98123456,
      browser_download_url: `${DL}/GitWarden-0.1.0-arm64.dmg`,
    },
    {
      name: 'GitWarden-0.1.0-x64.dmg',
      size: 99123456,
      browser_download_url: `${DL}/GitWarden-0.1.0-x64.dmg`,
    },
    {
      name: 'GitWarden-Setup-0.1.0.exe',
      size: 78123456,
      browser_download_url: `${DL}/GitWarden-Setup-0.1.0.exe`,
    },
    {
      name: 'GitWarden-0.1.0.AppImage',
      size: 102123456,
      browser_download_url: `${DL}/GitWarden-0.1.0.AppImage`,
    },
    {
      name: 'gitwarden_0.1.0_amd64.deb',
      size: 70123456,
      browser_download_url: `${DL}/gitwarden_0.1.0_amd64.deb`,
    },
    // Sidecars — must be excluded by the resolver:
    { name: 'latest.yml', size: 412, browser_download_url: `${DL}/latest.yml` },
    { name: 'latest-mac.yml', size: 420, browser_download_url: `${DL}/latest-mac.yml` },
    { name: 'latest-linux.yml', size: 418, browser_download_url: `${DL}/latest-linux.yml` },
    {
      name: 'GitWarden-Setup-0.1.0.exe.blockmap',
      size: 51234,
      browser_download_url: `${DL}/GitWarden-Setup-0.1.0.exe.blockmap`,
    },
  ],
}

/** Same release flagged as a draft — the fetch wrapper must reject it (→ null). */
export const draftReleaseFixture: Release = { ...latestReleaseFixture, draft: true }

/** Same release flagged as a prerelease — the fetch wrapper must reject it (→ null). */
export const prereleaseFixture: Release = { ...latestReleaseFixture, prerelease: true }

/** A published release with no assets — resolver yields no targets, only the fallback. */
export const emptyAssetsRelease: Release = { ...latestReleaseFixture, assets: [] }

/** Canonical filenames from Distribution §3 / Appendix A — pinned by the contract test. */
export const CANONICAL_FILENAMES = {
  macArm64: 'GitWarden-0.1.0-arm64.dmg',
  macX64: 'GitWarden-0.1.0-x64.dmg',
  winExe: 'GitWarden-Setup-0.1.0.exe',
  linuxAppImage: 'GitWarden-0.1.0.AppImage',
  linuxDeb: 'gitwarden_0.1.0_amd64.deb',
} as const
