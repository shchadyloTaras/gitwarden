import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let userDataDir: string
let fixtureRepo: string

function launchApp(env: Record<string, string> = {}): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ...env },
  })
}

async function dismissAutomaticTour(win: Page): Promise<void> {
  const overlay = win.getByTestId('onboarding-overlay')
  if (await overlay.isVisible().catch(() => false)) {
    await win.getByTestId('onboarding-skip').click()
    await expect(overlay).toBeHidden()
  }
}

async function openApp(
  env: Record<string, string> = {}
): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await launchApp(env)
  const win = await app.firstWindow()
  await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  await dismissAutomaticTour(win)
  return { app, win }
}

test.beforeAll(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ui-refresh-userdata-'))
  fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ui-refresh-repo-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: fixtureRepo, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'ui@example.com'], {
    cwd: fixtureRepo,
    stdio: 'pipe',
  })
  execFileSync('git', ['config', 'user.name', 'UI Test'], {
    cwd: fixtureRepo,
    stdio: 'pipe',
  })
  fs.writeFileSync(path.join(fixtureRepo, 'readme.txt'), 'before\n')
  execFileSync('git', ['add', '--', 'readme.txt'], { cwd: fixtureRepo, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: fixtureRepo, stdio: 'pipe' })
  fs.writeFileSync(path.join(fixtureRepo, 'readme.txt'), 'after\n')
})

test.afterAll(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
  fs.rmSync(fixtureRepo, { recursive: true, force: true })
})

test('navigation and tabs expose keyboard-friendly selected state', async () => {
  const { app, win } = await openApp()
  try {
    await expect(win.getByTestId('nav-profiles')).toHaveAttribute('aria-current', 'page')
    await expect(win.getByTestId('nav-profiles').locator('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )

    await win.getByTestId('nav-settings').click()
    await expect(win.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page')

    await win.getByTestId('settings-tab-general').focus()
    await win.keyboard.press('ArrowRight')
    await expect(win.getByTestId('settings-tab-ai')).toHaveAttribute('aria-selected', 'true')
    await expect(win.getByTestId('settings-tab-ai')).toBeFocused()
    await win.keyboard.press('End')
    await expect(win.getByTestId('settings-tab-walkthrough')).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await win.keyboard.press('Home')
    await expect(win.getByTestId('settings-tab-general')).toHaveAttribute('aria-selected', 'true')

    await win.getByTestId('right-panel-tab-context').focus()
    await win.keyboard.press('ArrowRight')
    await expect(win.getByTestId('right-panel-tab-chat')).toHaveAttribute('aria-selected', 'true')
    await expect(win.getByTestId('right-panel-tab-chat')).toBeFocused()
    await win.keyboard.press('Home')
    await expect(win.getByTestId('right-panel-tab-context')).toHaveAttribute(
      'aria-selected',
      'true'
    )
  } finally {
    await app.close()
  }
})

test('compact viewport keeps the workspace usable and resize ARIA values valid', async () => {
  const { app, win } = await openApp()
  try {
    await win.setViewportSize({ width: 640, height: 800 })
    await win.getByTestId('nav-profiles').click()
    await expect(win.getByTestId('right-panel')).toBeHidden()

    const geometry = await win.evaluate(() => {
      const rect = (testId: string): DOMRect =>
        document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.getBoundingClientRect()
      const root = document.querySelector<HTMLElement>('[data-testid="app-root"]')!
      return {
        mainWidth: rect('main-content').width,
        detailWidth: rect('profiles-detail-pane').width,
        rootClientWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
      }
    })

    expect(geometry.mainWidth).toBeGreaterThanOrEqual(320)
    expect(geometry.detailWidth).toBeGreaterThanOrEqual(160)
    expect(geometry.rootScrollWidth).toBeLessThanOrEqual(geometry.rootClientWidth)

    const separator = win.getByTestId('profiles-main-resize-handle')
    const values = {
      min: Number(await separator.getAttribute('aria-valuemin')),
      now: Number(await separator.getAttribute('aria-valuenow')),
      max: Number(await separator.getAttribute('aria-valuemax')),
    }
    expect(values.min).toBeLessThanOrEqual(values.now)
    expect(values.now).toBeLessThanOrEqual(values.max)

    const inspectorToggle = win.getByRole('button', { name: 'Toggle inspector' })
    await expect(inspectorToggle).toHaveAttribute('aria-expanded', 'false')
    await inspectorToggle.click()
    await expect(win.getByTestId('right-panel')).toBeVisible()
    await expect(inspectorToggle).toHaveAttribute('aria-expanded', 'true')
    await inspectorToggle.click()
    await expect(win.getByTestId('right-panel')).toBeHidden()
  } finally {
    await app.close()
  }
})

test('Status file rows can open a diff with the keyboard', async () => {
  const { app, win } = await openApp()
  try {
    await win.evaluate(async (repoPath: string) => {
      return (window as Window & typeof globalThis).api.repositories.create({
        name: 'ui-refresh-fixture',
        localPath: repoPath,
        isFavorite: false,
      })
    }, fixtureRepo)

    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await dismissAutomaticTour(win)
    await win.getByTestId('nav-status').click()

    const row = win
      .getByTestId('unstaged-section')
      .getByTestId('unstaged-file-row')
      .filter({ hasText: 'readme.txt' })
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.getByRole('button', { name: 'readme.txt' }).focus()
    await win.keyboard.press('Enter')

    await expect(win.getByTestId('diff-panel')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('diff-panel')).toContainText('before')
    await expect(win.getByTestId('diff-panel')).toContainText('after')

    await win.setViewportSize({ width: 640, height: 800 })
    await win.getByTestId('nav-history').click()
    const historyRow = win.getByTestId('history-commit-row').first()
    await expect(historyRow).toBeVisible({ timeout: 10000 })
    await expect(historyRow.locator(':scope > span').nth(2)).toBeVisible()
    await expect(historyRow.locator(':scope > span').nth(3)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('GitHub connection outcomes are announced and receive focus', async () => {
  const { app, win } = await openApp({ GITWARDEN_E2E_FAKE_GITHUB: '1' })
  try {
    await win.getByTestId('nav-profiles').click()
    await win.getByTestId('profiles-new-btn').click()
    await win.getByTestId('profile-form-displayName').fill('Accessibility')
    await win.getByTestId('profile-form-gitAuthorName').fill('UI Test')
    await win.getByTestId('profile-form-gitAuthorEmail').fill('ui@example.com')
    await win.getByTestId('profile-form-githubUsername').fill('placeholder')
    await win.getByTestId('profile-form-submit').click()
    await win.getByTestId('github-connect-btn').click()

    await expect(win.getByTestId('github-connect-user-code')).toBeVisible({ timeout: 10000 })
    await expect(win.getByTestId('github-connect-cancel')).toBeFocused()
    await expect(win.getByTestId('github-connect-success')).toBeVisible({ timeout: 10000 })

    const doneButton = win.getByTestId('github-connect-done')
    await expect(doneButton).toBeFocused()
    await expect(win.getByTestId('github-connect-modal').getByRole('status')).toContainText(
      'Authorized as @octocat.'
    )
  } finally {
    await app.close()
  }
})

test('searchable dropdown keeps the combobox separate from its listbox', async () => {
  const { app, win } = await openApp({ GITWARDEN_E2E_FAKE_AI: '1' })
  try {
    await win.getByTestId('nav-settings').click()
    await win.getByTestId('settings-tab-ai').click()
    await win.getByTestId('ai-key-input').fill('sk-or-v1-e2e000000000000000000000000')
    await win.getByTestId('ai-save-connection').click()
    await expect(win.getByTestId('ai-model-select')).toBeVisible({ timeout: 10000 })
    await win.getByTestId('ai-model-select').click()

    const modelSearch = win.getByTestId('ai-model-select-search')
    const listbox = win.getByTestId('ai-model-select-popup').getByRole('listbox')
    await expect(modelSearch).toBeFocused()
    await expect(modelSearch).toHaveAttribute('role', 'combobox')
    await expect(listbox.locator('input')).toHaveCount(0)
    await modelSearch.fill('fake-fast')
    await modelSearch.press('ArrowDown')
    await modelSearch.press('Enter')
    await expect(win.getByTestId('ai-model-select')).toContainText('fake-fast')
  } finally {
    await app.close()
  }
})

test('onboarding traps focus and restores it when dismissed', async () => {
  const { app, win } = await openApp()
  try {
    await win.getByTestId('nav-settings').click()
    await win.getByTestId('settings-tab-walkthrough').click()
    const launchButton = win.getByTestId('settings-start-onboarding')
    await launchButton.focus()
    await launchButton.click()

    await expect(win.getByTestId('onboarding-next')).toBeFocused()
    await win.keyboard.press('Tab')
    await expect(win.getByTestId('onboarding-skip')).toBeFocused()
    await win.keyboard.press('Shift+Tab')
    await expect(win.getByTestId('onboarding-next')).toBeFocused()

    await win.keyboard.press('Escape')
    await expect(win.getByTestId('onboarding-overlay')).toBeHidden()
    await expect(launchButton).toBeFocused()
  } finally {
    await app.close()
  }
})
