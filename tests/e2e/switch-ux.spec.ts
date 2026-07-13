import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// Switch UX (Phase 93, fix B / W3 / #13): the branch picker is non-reentrant, a
// switch failure surfaces inline (not silently, not buried on the Branches screen),
// and the stash quick-fix carries uncommitted changes across a switch without ever
// auto-resolving a pop conflict.

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-switch-ux-empty.gitconfig')
const SHARED_FILE = 'shared.txt'

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG },
  })
}

async function cleanupAll(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const reposRes = await api.repositories.list()
    if (reposRes.ok) {
      for (const r of reposRes.data) await api.repositories.delete(r.id)
    }
  })
}

// main and feature-a each commit a DIFFERENT first line of shared.txt, so a dirty
// edit to shared.txt on main genuinely blocks `git switch feature-a`. The dirty edit
// used by these tests only ever touches the LAST line — non-overlapping with the
// branches' own diff — so the stash quick-fix's 3-way merge always resolves cleanly
// (verified empirically: auto-merge, never a conflict) rather than accidentally
// exercising the separate "pop conflict" path this phase deliberately never
// auto-resolves.
let fixtureRepo: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-switch-ux-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })

  fs.writeFileSync(path.join(fixtureRepo, SHARED_FILE), 'line1\nline2\nline3\n')
  execSync(`git add ${SHARED_FILE}`, { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m init', { cwd: fixtureRepo, stdio: 'pipe' })

  execSync('git checkout -b feature-a', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, SHARED_FILE), 'FEATURE-line1\nline2\nline3\n')
  execSync(`git add ${SHARED_FILE}`, { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "feature change line1"', { cwd: fixtureRepo, stdio: 'pipe' })

  execSync('git checkout main', { cwd: fixtureRepo, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Switch UX', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    // Reset the fixture to a clean main before every test, regardless of how the
    // previous test left it (a completed switch, a dirty edit, a stash).
    execSync('git checkout -f main', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git stash clear', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git clean -fd', { cwd: fixtureRepo, stdio: 'pipe' })

    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await cleanupAll(win)
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await app.close()
  })

  async function registerFixtureRepo(): Promise<void> {
    await win.evaluate(async (repoPath: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'switch-ux-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await expect(win.getByTestId('header-branch-select')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('header-branch-select')).toContainText('main')
  }

  /** Dirties shared.txt on disk WITHOUT going through the app — a plain `git switch
   * feature-a` now refuses, since main and feature-a disagree on line1. */
  function dirtyWorkingTree(): void {
    fs.writeFileSync(path.join(fixtureRepo, SHARED_FILE), 'line1\nline2\nline3-EDITED\n')
  }

  async function switchToFeatureAViaHeader(): Promise<void> {
    await win.getByTestId('header-branch-select').click()
    await win.getByTestId('header-branch-select-option-feature-a').click()
  }

  test('a dirty-tree switch surfaces the inline error next to the picker', async () => {
    await registerFixtureRepo()
    dirtyWorkingTree()

    await switchToFeatureAViaHeader()

    const banner = win.getByTestId('header-switch-error')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await expect(banner).toContainText('feature-a')
    await expect(win.getByTestId('header-switch-error-open-status')).toBeVisible()
    await expect(win.getByTestId('header-switch-error-bring-changes')).toBeVisible()

    // The switch never happened — header still shows main, not a stale/blank state.
    await expect(win.getByTestId('header-branch-select')).toContainText('main')

    await win.getByTestId('nav-status').click()
    await expect(win.getByTestId('working-copy-destination-card')).toContainText(
      'Checked out: main',
      { timeout: 10000 }
    )
  })

  test('the quick-fix stashes, switches, and pops — preserving the local edit', async () => {
    await registerFixtureRepo()
    dirtyWorkingTree()

    await switchToFeatureAViaHeader()
    await expect(win.getByTestId('header-switch-error')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('header-switch-error-bring-changes').click()

    await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
      timeout: 10000,
    })
    await expect(win.getByTestId('header-switch-error')).not.toBeVisible()

    // shared.txt on disk now carries BOTH feature-a's own commit (line1) and the
    // user's uncommitted edit (line3) — the stash pop auto-merged them.
    const content = fs.readFileSync(path.join(fixtureRepo, SHARED_FILE), 'utf8')
    expect(content).toContain('FEATURE-line1')
    expect(content).toContain('line3-EDITED')
  })

  test('"Open Status" dismisses the error and navigates to Status without switching', async () => {
    await registerFixtureRepo()
    dirtyWorkingTree()

    await switchToFeatureAViaHeader()
    await expect(win.getByTestId('header-switch-error')).toBeVisible({ timeout: 10000 })

    await win.getByTestId('header-switch-error-open-status').click()

    await expect(win.getByTestId('header-switch-error')).not.toBeVisible()
    await expect(win.getByTestId('screen-status')).toBeVisible()
    // Still on main — dismissing the error is not itself a switch.
    await expect(win.getByTestId('header-branch-select')).toContainText('main')
  })

  test('a second rapid branch pick while a switch is in flight is ignored, not queued', async () => {
    await registerFixtureRepo()

    // Drives both clicks from inside the page (not Playwright's own actionability-
    // waiting `.click()`, which would just wait out the disabled window): React 18
    // flushes a click-triggered state update on the next microtask, well before the
    // real (macrotask-bound) IPC round-trip to main resolves, so a single `await
    // Promise.resolve()` reliably observes `switching: true` while the second
    // `.click()` — a no-op on a genuinely disabled <button>, per the HTML spec's
    // click() steps — never has a chance to race the actual git operation. This is
    // deterministic regardless of how quickly the switch itself resolves.
    const probe = await win.evaluate(async () => {
      const doc = document
      const trigger = doc.querySelector<HTMLButtonElement>('[data-testid="header-branch-select"]')
      if (!trigger) return { error: 'no trigger' }
      trigger.click() // open the popup
      await new Promise((r) => requestAnimationFrame(r))
      const optionA = doc.querySelector<HTMLElement>(
        '[data-testid="header-branch-select-option-feature-a"]'
      )
      if (!optionA) return { error: 'no option' }
      optionA.click() // picks feature-a — synchronously starts the switch
      // React 18 flushes a click-triggered state update on a microtask, not fully
      // inline within the DOM click() call — one microtask tick is enough to observe
      // it, and far shorter than the real (macrotask-bound) IPC round-trip to main.
      await Promise.resolve()
      const disabledRightAfterPick = trigger.disabled
      trigger.click() // must no-op: the trigger is disabled while switching
      const popupReopened = Boolean(doc.querySelector('[data-testid="header-branch-select-popup"]'))
      return { disabledRightAfterPick, popupReopened }
    })

    expect(probe.disabledRightAfterPick).toBe(true)
    expect(probe.popupReopened).toBe(false)

    // The switch completes normally to feature-a — the blocked second click never
    // reached feature-b or any other option.
    await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
      timeout: 10000,
    })
    await expect(win.getByTestId('header-branch-select')).toBeEnabled()
  })
})
