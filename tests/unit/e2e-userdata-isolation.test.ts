import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Every e2e spec drives the real built app. Launching Electron without an isolated
// --user-data-dir resolves app.getPath('userData') to the developer's REAL GitWarden
// folder — specs then wipe real profiles/repos and leak fixture profiles ("Personal",
// placeholder@example.com) into the owner's app, which happened live on 2026-07-21.
// All launches must go through tests/fixtures/launchApp.ts, which pins a scratch
// userData dir per spec file and cleans it up when the worker exits.

const E2E_DIR = path.resolve(__dirname, '../e2e')
const HELPER_PATH = path.resolve(__dirname, '../fixtures/launchApp.ts')

/** Direct-launch markers a spec must not contain — each bypasses the isolated helper. */
const FORBIDDEN = [
  { marker: '_electron', why: 'imports playwright._electron to launch directly' },
  { marker: 'electron.launch(', why: 'calls electron.launch() directly' },
  { marker: 'out/main/index.js', why: 'builds launch args around the built entry itself' },
]

describe('e2e userData isolation', () => {
  const specs = fs.readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'))

  it('sees the e2e suite', () => {
    expect(specs.length).toBeGreaterThan(0)
  })

  it('no spec launches Electron directly — every launch goes through tests/fixtures/launchApp', () => {
    const offenders: string[] = []
    for (const file of specs) {
      const src = fs.readFileSync(path.join(E2E_DIR, file), 'utf8')
      for (const { marker, why } of FORBIDDEN) {
        if (src.includes(marker)) offenders.push(`${file}: ${why} ("${marker}")`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the shared helper isolates userData via --user-data-dir', () => {
    const src = fs.readFileSync(HELPER_PATH, 'utf8')
    expect(src).toContain('--user-data-dir=')
    expect(src).toContain('mkdtemp')
  })
})
