import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const EMPTY_GIT_CONFIG = path.join(os.tmpdir(), 'gw-settings-empty.gitconfig')

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG },
  })
}

async function cleanupAll(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    await api.settings.update({
      appearance: 'system',
      customGitPath: undefined,
      defaultProjectsFolder: undefined,
    })
  })
}

test.beforeAll(() => {
  fs.writeFileSync(EMPTY_GIT_CONFIG, '')
})

test.afterAll(() => {
  try {
    fs.rmSync(EMPTY_GIT_CONFIG, { force: true })
  } catch {
    // ignore
  }
})

test('Settings screen renders with appearance picker and git path input', async () => {
  let app: ElectronApplication | null = null
  try {
    app = await launchApp()
    const win = await app.firstWindow()
    await win.waitForSelector('[data-testid="main-content"]')

    // Navigate to Settings
    await win.click('[data-testid="nav-settings"]')
    await win.waitForSelector('[data-testid="screen-settings"]')

    // Appearance picker should be visible with all three options
    await expect(win.locator('[data-testid="settings-appearance-system"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-appearance-light"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-appearance-dark"]')).toBeVisible()

    // Git path input should be visible
    await expect(win.locator('[data-testid="settings-git-path-input"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-git-path-validate"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-default-folder-input"]')).toBeVisible()
  } finally {
    await app?.close()
  }
})

test('Settings screen — changing appearance enables Save and persists after reload', async () => {
  let app: ElectronApplication | null = null
  try {
    app = await launchApp()
    const win = await app.firstWindow()
    await win.waitForSelector('[data-testid="main-content"]')

    await win.click('[data-testid="nav-settings"]')
    await win.waitForSelector('[data-testid="screen-settings"]')

    // Save button initially disabled
    const saveBtn = win.locator('[data-testid="settings-save"]')
    await expect(saveBtn).toBeDisabled()

    // Click "Light" appearance
    await win.click('[data-testid="settings-appearance-light"]')
    await expect(saveBtn).toBeEnabled()

    // Save
    await win.click('[data-testid="settings-save"]')
    await win.waitForSelector('[data-testid="settings-saved-msg"]')

    await win.fill('[data-testid="settings-default-folder-input"]', os.tmpdir())
    await win.click('[data-testid="settings-save"]')
    await win.waitForSelector('[data-testid="settings-saved-msg"]')

    await cleanupAll(win)
  } finally {
    await app?.close()
  }
})

test('Settings screen — git path validation with real git binary', async () => {
  let app: ElectronApplication | null = null
  try {
    app = await launchApp()
    const win = await app.firstWindow()
    await win.waitForSelector('[data-testid="main-content"]')

    await win.click('[data-testid="nav-settings"]')
    await win.waitForSelector('[data-testid="screen-settings"]')

    // Find the real git path on this machine
    let gitPath = '/usr/bin/git'
    try {
      gitPath = execSync('which git', { encoding: 'utf8' }).trim()
    } catch {
      // fallback to /usr/bin/git
    }

    // Type the git path
    await win.fill('[data-testid="settings-git-path-input"]', gitPath)

    // Validate button should be enabled
    const validateBtn = win.locator('[data-testid="settings-git-path-validate"]')
    await expect(validateBtn).toBeEnabled()

    // Click validate
    await win.click('[data-testid="settings-git-path-validate"]')

    // Should show valid indicator
    await win.waitForSelector('[data-testid="settings-git-valid"]')
    const validText = await win.textContent('[data-testid="settings-git-valid"]')
    expect(validText).toContain('git version')

    await cleanupAll(win)
  } finally {
    await app?.close()
  }
})

test('StatusScreen — untracked file Delete shows irreversible warning, tracked Discard shows standard warning', async () => {
  let app: ElectronApplication | null = null
  let fixtureRepo: string | null = null
  try {
    app = await launchApp()
    const win = await app.firstWindow()
    await win.waitForSelector('[data-testid="main-content"]')

    // Create fixture repo
    fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-settings-fixture-'))
    execSync('git init -b main', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.email "test@example.com"', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git config user.name "Test User"', { cwd: fixtureRepo, stdio: 'pipe' })
    fs.writeFileSync(path.join(fixtureRepo, 'tracked.txt'), 'hello\n')
    execSync('git add tracked.txt', { cwd: fixtureRepo, stdio: 'pipe' })
    execSync('git commit -m "init"', { cwd: fixtureRepo, stdio: 'pipe' })
    // Modify tracked file
    fs.writeFileSync(path.join(fixtureRepo, 'tracked.txt'), 'hello world\n')
    // Create untracked file
    fs.writeFileSync(path.join(fixtureRepo, 'untracked.txt'), 'new file\n')

    // Register repo via IPC then reload so the store picks it up
    await win.evaluate(async (repoPath: string) => {
      const api = (window as Window & typeof globalThis).api
      await api.repositories.create({
        name: 'fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

    // Navigate to Status
    await win.click('[data-testid="nav-status"]')
    await win.waitForSelector('[data-testid="screen-status"]')

    // Select the fixture repo from the global header (other repos may exist from prior tests)
    await win.getByTestId('header-repo-select').click()
    await win.getByTestId('header-repo-select-popup').getByText('fixture', { exact: true }).click()
    await win.waitForSelector('[data-testid="unstaged-section"]', { timeout: 10000 })

    // Click Discard on the tracked file
    const discardBtn = win.locator('[data-testid="discard-btn"]').first()
    await expect(discardBtn).toBeVisible()
    await discardBtn.click()

    // Standard discard warning (not amber/irreversible)
    await expect(win.locator('[data-testid="discard-warning"]')).toBeVisible()
    // Cancel
    await win.click('[data-testid="discard-btn-cancel"]')
    await expect(win.locator('[data-testid="discard-warning"]')).not.toBeVisible()

    // Click Delete on the untracked file — should show stronger warning
    const cleanBtn = win.locator('[data-testid="clean-btn"]').first()
    await expect(cleanBtn).toBeVisible()
    await cleanBtn.click()

    // Irreversible warning in amber
    await expect(win.locator('[data-testid="clean-irreversible-warning"]')).toBeVisible()
    // Cancel
    await win.click('[data-testid="clean-btn-cancel"]')
    await expect(win.locator('[data-testid="clean-irreversible-warning"]')).not.toBeVisible()
  } finally {
    if (fixtureRepo) fs.rmSync(fixtureRepo, { recursive: true, force: true })
    await app?.close()
  }
})
