import { test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAIN_ENTRY = path.resolve(__dirname, '../../out/main/index.js')

// One scratch userData dir per spec file, created lazily and removed when the worker
// exits. Keying by the calling spec keeps state persistent across launches *within* a
// file (matching the pre-isolation semantics specs were written against) while never
// touching the developer's real GitWarden data — an un-isolated launch both wipes real
// profiles/repos (spec cleanup hooks) and leaks fixture profiles into the real app.
const scratchDirs = new Map<string, string>()

function scratchUserDataDir(): string {
  let key = '(outside-test-context)'
  try {
    key = test.info().file
  } catch {
    // Called outside a Playwright test/hook — fall back to one shared scratch dir.
  }
  let dir = scratchDirs.get(key)
  if (!dir) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitwarden-e2e-userdata-'))
    scratchDirs.set(key, dir)
  }
  return dir
}

process.once('exit', () => {
  for (const dir of scratchDirs.values()) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best effort — the OS temp cleaner collects anything a hard kill leaves behind.
    }
  }
})

/**
 * The only way e2e specs may launch the app (enforced by
 * tests/unit/e2e-userdata-isolation.test.ts). Electron honors --user-data-dir for
 * app.getPath('userData'), so every launch runs against an isolated scratch dir.
 */
export function launchApp(env: Record<string, string> = {}): Promise<ElectronApplication> {
  const merged: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...process.env, ...env })) {
    if (v !== undefined) merged[k] = v
  }
  return electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${scratchUserDataDir()}`],
    env: merged,
  })
}
