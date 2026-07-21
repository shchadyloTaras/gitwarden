import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-branches-empty.gitconfig')

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
    const profilesRes = await api.profiles.list()
    if (profilesRes.ok) {
      for (const p of profilesRes.data) await api.profiles.delete(p.id)
    }
    await api.settings.update({ activeProfileId: undefined })
  })
}

// Fixture repo: main + feature-a (both have at least one commit)
let fixtureRepo: string
let linkedWorktree = ''

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-branches-'))
  execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.email "alice@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git config user.name "Alice Dev"', { cwd: fixtureRepo, stdio: 'pipe' })

  fs.writeFileSync(path.join(fixtureRepo, 'init.txt'), 'initial\n')
  execSync('git add init.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "initial commit"', { cwd: fixtureRepo, stdio: 'pipe' })

  // Create feature-a
  execSync('git checkout -b feature-a', { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'a.txt'), 'branch a\n')
  execSync('git add a.txt', { cwd: fixtureRepo, stdio: 'pipe' })
  execSync('git commit -m "branch a"', { cwd: fixtureRepo, stdio: 'pipe' })

  // Return to main
  execSync('git checkout main', { cwd: fixtureRepo, stdio: 'pipe' })

  execSync('git branch worktree-only', { cwd: fixtureRepo, stdio: 'pipe' })
  linkedWorktree = path.join(os.tmpdir(), `gw-branches-linked-${Date.now()}`)
  execFileSync('git', ['worktree', 'add', linkedWorktree, 'worktree-only'], {
    cwd: fixtureRepo,
    stdio: 'pipe',
  })
})

test.afterAll(() => {
  try {
    if (linkedWorktree) {
      execFileSync('git', ['worktree', 'remove', '--force', linkedWorktree], {
        cwd: fixtureRepo,
        stdio: 'pipe',
      })
    }
  } catch {
    // ignore
  }
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
  if (linkedWorktree) fs.rmSync(linkedWorktree, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Branches', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    // Reset fixture to main so each test starts from a known state
    execSync('git checkout main', { cwd: fixtureRepo, stdio: 'pipe' })

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
        name: 'branches-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }

  test('switch to another branch updates the global header', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    await expect(win.getByTestId('branches-current-branch')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('branches-current-branch')).toContainText('main')

    const mainRow = win.getByTestId('branches-local-item-main')
    await expect(mainRow).toHaveAttribute('aria-current', 'true')
    await expect(mainRow.getByTestId('branches-current-badge')).toHaveText('Current branch')
    await expect(win.getByTestId('branches-current-badge')).toHaveCount(1)

    // Switch to feature-a
    const switchBtns = win.getByTestId('branches-switch-btn')
    await switchBtns.first().click()

    // Header must now show feature-a
    await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
      timeout: 10000,
    })
    await expect(win.getByTestId('branches-current-branch')).toContainText('feature-a')

    const featureARow = win.getByTestId('branches-local-item-feature-a')
    await expect(featureARow).toHaveAttribute('aria-current', 'true')
    await expect(featureARow.getByTestId('branches-current-badge')).toHaveText('Current branch')
    await expect(mainRow).not.toHaveAttribute('aria-current', 'true')
    await expect(mainRow.getByTestId('branches-current-badge')).toHaveCount(0)
    await expect(win.getByTestId('branches-current-badge')).toHaveCount(1)
  })

  test('switching branch via the header dropdown updates the Remote screen without navigating away', async () => {
    await registerFixtureRepo()

    // Land on the Remote screen first so it loads its own view of the current branch.
    await win.getByTestId('nav-remote').click()
    await expect(win.getByTestId('screen-remote')).toBeVisible()
    await expect(win.getByTestId('remote-current-branch')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('remote-current-branch')).toContainText('main')

    // Switch branch via the HEADER dropdown — not the Branches screen — while staying
    // on the Remote screen the whole time (no navigation, no reload).
    await win.getByTestId('header-branch-select').click()
    await win.getByTestId('header-branch-select-option-feature-a').click()

    await expect(win.getByTestId('header-branch-select')).toContainText('feature-a', {
      timeout: 10000,
    })
    // The Remote screen must reflect the switch immediately, not just the header.
    await expect(win.getByTestId('remote-current-branch')).toContainText('feature-a', {
      timeout: 10000,
    })
  })

  test('create a new branch creates and switches to it', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    await expect(win.getByTestId('branches-current-branch')).toBeVisible({ timeout: 10000 })

    // Create feature-b
    await win.getByTestId('branches-create-input').fill('feature-b')
    await win.getByTestId('branches-create-btn').click()

    // Header shows feature-b
    await expect(win.getByTestId('header-branch-select')).toContainText('feature-b', {
      timeout: 10000,
    })
    await expect(win.getByTestId('branches-current-branch')).toContainText('feature-b')

    // feature-b appears in local list
    await expect(win.getByTestId('branches-local-list')).toContainText('feature-b')
  })

  test('an invalid branch name shows a clear message, not the generic Git error', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()
    await expect(win.getByTestId('branches-current-branch')).toBeVisible({ timeout: 10000 })

    // A name with a space is rejected by git; the user must see WHY, not "unexpected error".
    await win.getByTestId('branches-create-input').fill('my branch')
    await win.getByTestId('branches-create-btn').click()

    const err = win.getByTestId('branches-error')
    await expect(err).toBeVisible({ timeout: 10000 })
    await expect(err).toContainText(/valid branch name/i)
    await expect(err).not.toContainText('An unexpected Git error occurred')
  })

  test('creating a branch that already exists shows a clear message', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()
    await expect(win.getByTestId('branches-current-branch')).toBeVisible({ timeout: 10000 })

    // 'main' already exists in the fixture repo.
    await win.getByTestId('branches-create-input').fill('main')
    await win.getByTestId('branches-create-btn').click()

    const err = win.getByTestId('branches-error')
    await expect(err).toBeVisible({ timeout: 10000 })
    await expect(err).toContainText(/already exists/i)
    await expect(err).not.toContainText('An unexpected Git error occurred')
  })

  test('delete a merged branch removes it from the list with one confirm', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    // feature-b is created FROM main below, so unlike feature-a (the fixture's own
    // unmerged branch, used by the escalation test) it IS fully merged — a safe
    // `-d` succeeds without ever needing the escalated force-confirm.
    await expect(win.getByTestId('branches-current-branch')).toContainText('main', {
      timeout: 10000,
    })
    await win.getByTestId('branches-create-input').fill('feature-b')
    await win.getByTestId('branches-create-btn').click()
    await expect(win.getByTestId('branches-local-list')).toContainText('feature-b', {
      timeout: 10000,
    })
    await win.getByTestId('header-branch-select').click()
    await win.getByTestId('header-branch-select-option-main').click()
    await expect(win.getByTestId('header-branch-select')).toContainText('main', {
      timeout: 10000,
    })

    const featureBRow = win.getByTestId('branches-local-item-feature-b')
    await expect(featureBRow).toBeVisible({ timeout: 10000 })
    await featureBRow.getByTestId('branches-delete-btn').click()
    await featureBRow.getByTestId('branches-delete-confirm-btn').click()

    await expect(win.getByTestId('branches-local-list')).not.toContainText('feature-b', {
      timeout: 10000,
    })
    await expect(win.getByTestId('branches-success')).toBeVisible()
    // A safe merged delete never needs the escalated warning.
    await expect(win.getByTestId('branches-force-delete-warning')).toHaveCount(0)
  })

  test('safe-delete escalation (Phase 92/97): an unmerged branch requires the second, distinct confirm — no false "Deleted" toast', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    // feature-a is the fixture's own branch with a commit unreachable from main —
    // genuinely unmerged, so the safe `-d` must refuse.
    await expect(win.getByTestId('branches-local-list')).toContainText('feature-a', {
      timeout: 10000,
    })
    const featureARow = win.getByTestId('branches-local-item-feature-a')
    await expect(featureARow).toBeVisible({ timeout: 10000 })
    await featureARow.getByTestId('branches-delete-btn').click()
    await featureARow.getByTestId('branches-delete-confirm-btn').click()

    // The plain confirm's "Yes, delete" escalates to a SEPARATE, visibly distinct
    // warning instead of silently deleting or showing a generic error — no false
    // "Deleted" toast anywhere in this flow.
    const warning = featureARow.getByTestId('branches-force-delete-warning')
    await expect(warning).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('branches-success')).toHaveCount(0)
    await expect(win.getByTestId('branches-local-list')).toContainText('feature-a')

    await featureARow.getByTestId('branches-force-delete-confirm-btn').click()

    await expect(win.getByTestId('branches-local-list')).not.toContainText('feature-a', {
      timeout: 10000,
    })
    await expect(win.getByTestId('branches-success')).toBeVisible()
  })

  test('a failed create keeps the typed name in the input instead of clearing it (W31)', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()
    await expect(win.getByTestId('branches-current-branch')).toBeVisible({ timeout: 10000 })

    // 'main' already exists — this create is REJECTED, not a success.
    await win.getByTestId('branches-create-input').fill('main')
    await win.getByTestId('branches-create-btn').click()

    await expect(win.getByTestId('branches-error')).toBeVisible({ timeout: 10000 })
    // The rejected name must still be there for the user to fix, not wiped.
    await expect(win.getByTestId('branches-create-input')).toHaveValue('main')
  })

  test('shows branches checked out in another worktree without switch or delete actions', async () => {
    await registerFixtureRepo()

    await win.getByTestId('nav-branches').click()
    await expect(win.getByTestId('screen-branches')).toBeVisible()

    const worktreeRow = win.getByTestId('branches-local-item-worktree-only')
    await expect(worktreeRow).toBeVisible({ timeout: 10000 })
    await expect(worktreeRow.getByTestId('branches-worktree-badge')).toContainText('In worktree')
    await expect(worktreeRow.getByTestId('branches-worktree-path')).toContainText(linkedWorktree)
    await expect(worktreeRow.getByTestId('branches-switch-btn')).toHaveCount(0)
    await expect(worktreeRow.getByTestId('branches-delete-btn')).toHaveCount(0)
  })

  test('worktree hygiene (W22): a worktree deleted in Finder/Explorer offers a prune escape hatch, not a permanent lock', async () => {
    // Isolated fixture: pruning permanently mutates the repo's worktree registration,
    // so this gets its own repo rather than reusing the shared one above.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-worktree-prune-'))
    execSync('git init -b main', { cwd: repo, stdio: 'pipe' })
    execSync('git config user.email "alice@example.com"', { cwd: repo, stdio: 'pipe' })
    execSync('git config user.name "Alice Dev"', { cwd: repo, stdio: 'pipe' })
    fs.writeFileSync(path.join(repo, 'init.txt'), 'initial\n')
    execSync('git add init.txt', { cwd: repo, stdio: 'pipe' })
    execSync('git commit -m init', { cwd: repo, stdio: 'pipe' })
    execSync('git branch orphaned-worktree', { cwd: repo, stdio: 'pipe' })
    const worktreeDir = path.join(os.tmpdir(), `gw-worktree-prune-linked-${Date.now()}`)
    execFileSync('git', ['worktree', 'add', worktreeDir, 'orphaned-worktree'], {
      cwd: repo,
      stdio: 'pipe',
    })

    try {
      await win.evaluate(async (repoPath: string) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'worktree-prune-fixture',
          localPath: repoPath,
          isFavorite: false,
        })
      }, repo)
      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await win.getByTestId('nav-branches').click()
      await expect(win.getByTestId('screen-branches')).toBeVisible()

      const row = win.getByTestId('branches-local-item-orphaned-worktree')
      await expect(row).toBeVisible({ timeout: 10000 })
      await expect(row.getByTestId('branches-worktree-badge')).toContainText('In worktree')
      await expect(row.getByTestId('branches-worktree-prune-btn')).toHaveCount(0)

      // Deleted out-of-band — NOT via `git worktree remove` — exactly the Finder/
      // Explorer scenario W22 describes: git's own registration still thinks the
      // branch is checked out there. Deleting a worktree's OWN directory never
      // touches the main repo's `.git/HEAD`/`refs`/`index`, so the Phase 96 watcher
      // has nothing to fire on here — reload to force branchStore to re-read reality.
      fs.rmSync(worktreeDir, { recursive: true, force: true })
      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await win.getByTestId('nav-branches').click()
      await expect(win.getByTestId('screen-branches')).toBeVisible()

      const staleRow = win.getByTestId('branches-local-item-orphaned-worktree')
      await expect(staleRow).toBeVisible({ timeout: 10000 })
      // No permanent lock: a prune escape hatch replaces the plain "In worktree" badge.
      await expect(staleRow.getByTestId('branches-worktree-prune-btn')).toBeVisible({
        timeout: 10000,
      })
      await expect(staleRow.getByTestId('branches-worktree-badge')).toHaveCount(0)
      await expect(staleRow.getByTestId('branches-switch-btn')).toHaveCount(0)

      await staleRow.getByTestId('branches-worktree-prune-btn').click()

      // Pruned: the branch is switchable/deletable again, like any normal branch.
      await expect(win.getByTestId('branches-success')).toBeVisible({ timeout: 10000 })
      const prunedRow = win.getByTestId('branches-local-item-orphaned-worktree')
      await expect(prunedRow.getByTestId('branches-switch-btn')).toBeVisible({ timeout: 10000 })
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
      fs.rmSync(worktreeDir, { recursive: true, force: true })
    }
  })
})
