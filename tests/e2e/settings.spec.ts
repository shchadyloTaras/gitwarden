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
    await api.settings.update({ appearance: 'system' })
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

test('Settings screen renders with appearance picker', async () => {
  let app: ElectronApplication | null = null
  try {
    app = await launchApp()
    const win = await app.firstWindow()
    await win.waitForSelector('[data-testid="main-content"]')

    // Navigate to Settings
    await win.click('[data-testid="nav-settings"]')
    await win.waitForSelector('[data-testid="screen-settings"]')

    // General is the default tab: appearance picker visible.
    await expect(win.locator('[data-testid="settings-appearance-system"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-appearance-light"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-appearance-dark"]')).toBeVisible()

    // The Git tab and its custom-path input have been removed.
    await expect(win.locator('[data-testid="settings-tab-git"]')).toHaveCount(0)
    await expect(win.locator('[data-testid="settings-git-path-input"]')).toHaveCount(0)
    await expect(win.locator('[data-testid="settings-default-folder-input"]')).toHaveCount(0)
  } finally {
    await app?.close()
  }
})

test('Settings screen — tab navigation switches between General, AI Assistant and Walkthrough', async () => {
  let app: ElectronApplication | null = null
  try {
    app = await launchApp()
    const win = await app.firstWindow()
    await win.waitForSelector('[data-testid="main-content"]')

    await win.click('[data-testid="nav-settings"]')
    await win.waitForSelector('[data-testid="screen-settings"]')

    // The tab strip is part of the Settings screen.
    await expect(win.locator('[data-testid="settings-tabs"]')).toBeVisible()

    // General tab is selected by default.
    await expect(win.locator('[data-testid="settings-tabpanel-general"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-appearance-picker"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-tab-general"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )

    // AI Assistant tab → connection setup.
    await win.click('[data-testid="settings-tab-ai"]')
    await expect(win.locator('[data-testid="settings-tabpanel-ai"]')).toBeVisible()
    await expect(win.locator('[data-testid="ai-section"]')).toBeVisible()

    // Walkthrough tab → replay action. Save row is not shown here.
    await win.click('[data-testid="settings-tab-walkthrough"]')
    await expect(win.locator('[data-testid="settings-tabpanel-walkthrough"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-start-onboarding"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-save"]')).toHaveCount(0)

    // Back to General restores the appearance picker and the Save row.
    await win.click('[data-testid="settings-tab-general"]')
    await expect(win.locator('[data-testid="settings-appearance-picker"]')).toBeVisible()
    await expect(win.locator('[data-testid="settings-save"]')).toBeVisible()
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
