import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// An empty gitconfig file so the Electron process sees no global git identity.
// This ensures IDENTITY_UNSET fires in tests that rely on no local identity.
const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-commit-empty.gitconfig')

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

// Fixture: has a staged file but no local git identity
let fixtureCommit: string

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')

  fixtureCommit = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-commit-'))
  execSync('git init', { cwd: fixtureCommit, stdio: 'pipe' })
  // Temporarily set identity for the initial commit only
  execSync('git config user.email "temp@temp.com"', { cwd: fixtureCommit, stdio: 'pipe' })
  execSync('git config user.name "Temp"', { cwd: fixtureCommit, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureCommit, 'readme.txt'), 'initial\n')
  execSync('git add readme.txt', { cwd: fixtureCommit, stdio: 'pipe' })
  execSync('git commit -m "initial"', { cwd: fixtureCommit, stdio: 'pipe' })

  // Stage a new file for the test commit
  fs.writeFileSync(path.join(fixtureCommit, 'feature.txt'), 'new feature\n')
  execSync('git add feature.txt', { cwd: fixtureCommit, stdio: 'pipe' })

  // Remove local identity — app will see IDENTITY_UNSET with the empty global config
  execSync('git config --unset user.email', { cwd: fixtureCommit, stdio: 'pipe' })
  execSync('git config --unset user.name', { cwd: fixtureCommit, stdio: 'pipe' })
})

test.afterAll(() => {
  fs.rmSync(fixtureCommit, { recursive: true, force: true })
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test.describe('Commit Flow', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
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

  test('commit screen renders with no repo selected', async () => {
    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()
    // Commit button is absent when no repo is active
    await expect(win.getByTestId('commit-btn')).not.toBeVisible()
  })

  test('commit is blocked on identity mismatch → set-local-identity unblocks → commit creates correct author', async () => {
    // Create profile Alice
    const aliceId = await win.evaluate(async () => {
      const api = (window as Window & typeof globalThis).api
      const res = await api.profiles.create({
        displayName: 'Alice',
        gitAuthorName: 'Alice Dev',
        gitAuthorEmail: 'alice@example.com',
        githubUsername: 'alice',
        authenticationMethod: 'ssh',
        expectedRemoteHosts: [],
      })
      return res.ok ? res.data.id : null
    })
    expect(aliceId).toBeTruthy()

    // Set Alice as active profile
    await win.evaluate(async (id: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.settings.update({ activeProfileId: id })
    }, aliceId as string)

    // Register the fixture repo and assign it to Alice
    await win.evaluate(
      async ([repoPath, profileId]: [string, string]) => {
        const api = (window as Window & typeof globalThis).api
        await api.repositories.create({
          name: 'commit-fixture',
          localPath: repoPath,
          assignedProfileId: profileId,
          isFavorite: false,
        })
      },
      [fixtureCommit, aliceId as string]
    )

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // Navigate to Commit screen
    await win.getByTestId('nav-commit').click()
    await expect(win.getByTestId('screen-commit')).toBeVisible()

    // Wait for status + identity to load (auto-selected from header)
    await expect(win.getByTestId('commit-staged-summary')).toBeVisible({ timeout: 10000 })

    // The staged file should appear
    await expect(win.getByTestId('commit-staged-summary')).toContainText('feature.txt')

    // Type a commit message
    await win.getByTestId('commit-message').fill('Add feature')

    // IDENTITY_UNSET blocker should be visible (no local or global identity)
    await expect(win.getByTestId('commit-blocker')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('commit-blocker')).toContainText(
      'Git author name or email is not configured'
    )

    // Commit button must be disabled
    await expect(win.getByTestId('commit-btn')).toBeDisabled()

    // "Set local identity" button should be visible
    await expect(win.getByTestId('commit-set-identity-btn')).toBeVisible()
    await expect(win.getByTestId('commit-set-identity-btn')).toContainText('Alice Dev')

    // Click "Set local identity"
    await win.getByTestId('commit-set-identity-btn').click()

    // Identity is now set → blocker disappears, commit button enabled
    await expect(win.getByTestId('commit-btn')).toBeEnabled({ timeout: 10000 })
    await expect(win.getByTestId('commit-blocker')).not.toBeVisible()

    // Commit
    await win.getByTestId('commit-btn').click()

    // Success banner appears
    await expect(win.getByTestId('commit-success')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('commit-success')).toContainText('Committed')

    // Verify via git log: author email must be alice@example.com
    const authorEmail = execSync('git log --format="%ae" -n 1', {
      cwd: fixtureCommit,
    })
      .toString()
      .trim()
      .replace(/^"|"$/g, '')
    expect(authorEmail).toBe('alice@example.com')

    // Verify author name
    const authorName = execSync('git log --format="%an" -n 1', {
      cwd: fixtureCommit,
    })
      .toString()
      .trim()
    expect(authorName).toBe('Alice Dev')
  })
})
