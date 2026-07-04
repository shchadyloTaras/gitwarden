import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GITHUB_REPO_OWNER, GITHUB_REPO_NAME } from '../../src/core/config/github'

// The update notifier asks `GITHUB_REPO_OWNER/GITHUB_REPO_NAME` for the latest release.
// The source repo is private (Private-Source Distribution): asking it 404s for every
// install, which the updater treats as "no releases yet" — the update button and the
// Updates screen then never show a new version. Releases live on the public storefront.
describe('update source coordinates', () => {
  it('points the update check at the public storefront repo', () => {
    expect(`${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`).toBe('shchadyloTaras/gitwarden-releases')
  })

  it('mirrors the electron-builder publish target, so installs check where CI publishes', () => {
    const yml = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8')
    const publishBlock = /^publish:\n(?:[ \t]+\S.*\n)+/m.exec(yml)?.[0] ?? ''
    expect(/^[ \t]+owner:\s*(\S+)$/m.exec(publishBlock)?.[1]).toBe(GITHUB_REPO_OWNER)
    expect(/^[ \t]+repo:\s*(\S+)$/m.exec(publishBlock)?.[1]).toBe(GITHUB_REPO_NAME)
  })
})
