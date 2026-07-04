import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { Page } from 'playwright'
import path from 'node:path'
import { profileFixture, type ProfileInput } from '../fixtures/profiles'

async function launchApp() {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })
}

/** The Repositories nav item is locked while no profiles exist — seed one if needed. */
async function ensureProfile(win: Page): Promise<void> {
  const created = await win.evaluate(async (input: ProfileInput) => {
    const api = (window as Window & typeof globalThis).api
    const res = await api.profiles.list()
    if (res.ok && res.data.length > 0) return false
    await api.profiles.create(input)
    return true
  }, profileFixture('personal'))
  if (created) {
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  }
}

/** Delete all profiles via IPC so a test can exercise the zero-profile state. */
async function deleteAllProfiles(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as Window & typeof globalThis).api
    const res = await api.profiles.list()
    if (res.ok) {
      for (const p of res.data) await api.profiles.delete(p.id)
    }
    await api.settings.update({ activeProfileId: undefined })
  })
}

const PANEL_WIDTH_STORAGE_KEY = 'gitwarden.layout.panelWidths.v1'
const REPOSITORIES_SPLIT_STORAGE_KEY = 'gitwarden.layout.repositoriesSplit.v1'

interface PanelLayout {
  left: number
  right: number
  main: number
  stored: { left?: number; right?: number } | null
}

async function clearPanelWidths(win: Page): Promise<void> {
  await win.evaluate((key) => window.localStorage.removeItem(key), PANEL_WIDTH_STORAGE_KEY)
}

async function clearStorageKey(win: Page, key: string): Promise<void> {
  await win.evaluate((storageKey) => window.localStorage.removeItem(storageKey), key)
}

async function readPanelLayout(win: Page): Promise<PanelLayout> {
  return win.evaluate((key) => {
    function widthFor(testId: string): number {
      const element = document.querySelector(`[data-testid="${testId}"]`)
      if (!element) throw new Error(`Missing element: ${testId}`)
      return Math.round(element.getBoundingClientRect().width)
    }

    const raw = window.localStorage.getItem(key)
    return {
      left: widthFor('sidebar-nav'),
      right: widthFor('right-panel'),
      main: widthFor('main-content'),
      stored: raw ? (JSON.parse(raw) as { left?: number; right?: number }) : null,
    }
  }, PANEL_WIDTH_STORAGE_KEY)
}

async function readSplitLayout(
  win: Page,
  key: string,
  startTestId: string,
  endTestId: string
): Promise<{ start: number; end: number; stored: number | null }> {
  return win.evaluate(
    ({ storageKey, startId, endId }) => {
      function widthFor(testId: string): number {
        const element = document.querySelector(`[data-testid="${testId}"]`)
        if (!element) throw new Error(`Missing element: ${testId}`)
        return Math.round(element.getBoundingClientRect().width)
      }

      const raw = window.localStorage.getItem(storageKey)
      return {
        start: widthFor(startId),
        end: widthFor(endId),
        stored: raw ? (JSON.parse(raw) as number) : null,
      }
    },
    { storageKey: key, startId: startTestId, endId: endTestId }
  )
}

async function dragHandle(win: Page, testId: string, deltaX: number): Promise<void> {
  const box = await win.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`Missing resize handle: ${testId}`)

  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await win.mouse.move(x, y)
  await win.mouse.down()
  await win.mouse.move(x + deltaX, y, { steps: 8 })
  await win.mouse.up()
}

test.describe('App shell & navigation', () => {
  test('global header shows repo selector and guard badge', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await expect(win.getByTestId('header-repo-select')).toBeVisible()
      const guard = win.getByTestId('header-guard-badge')
      await expect(guard).toBeVisible()
      // The badge is honest now — it never reads the old static "Safe"/"SAFE".
      await expect(guard).not.toHaveText(/safe/i)
    } finally {
      await app.close()
    }
  })

  test('sidebar navigation switches screens', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await ensureProfile(win)

      // Visual order: Profiles precedes Repositories in the MANAGE group.
      const screens: Array<{ nav: string; testId: string }> = [
        { nav: 'nav-profiles', testId: 'screen-profiles' },
        { nav: 'nav-repositories', testId: 'screen-repositories' },
        { nav: 'nav-status', testId: 'screen-status' },
        { nav: 'nav-commit', testId: 'screen-commit' },
        { nav: 'nav-remote', testId: 'screen-remote' },
        { nav: 'nav-branches', testId: 'screen-branches' },
        { nav: 'nav-history', testId: 'screen-history' },
        { nav: 'nav-safety-center', testId: 'screen-safety-center' },
        { nav: 'nav-settings', testId: 'screen-settings' },
      ]

      for (const { nav, testId } of screens) {
        await win.getByTestId(nav).click()
        await expect(win.getByTestId(testId)).toBeVisible()
      }
    } finally {
      await app.close()
    }
  })

  test('Repositories stays locked until the first profile exists', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await deleteAllProfiles(win)
      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      // With zero profiles the app lands on Profiles, not on the locked Repositories.
      await expect(win.getByTestId('screen-profiles')).toBeVisible()

      // Profiles sits above Repositories in the MANAGE group.
      const profilesBox = await win.getByTestId('nav-profiles').boundingBox()
      const reposBox = await win.getByTestId('nav-repositories').boundingBox()
      expect(profilesBox).not.toBeNull()
      expect(reposBox).not.toBeNull()
      expect(profilesBox!.y).toBeLessThan(reposBox!.y)

      // Repositories is disabled and carries the inline hint; clicking it goes nowhere.
      const reposNav = win.getByTestId('nav-repositories')
      await expect(reposNav).toBeDisabled()
      await expect(win.getByTestId('nav-repositories-locked-hint')).toHaveText(
        'Add a profile first'
      )
      await reposNav.click({ force: true })
      await expect(win.getByTestId('screen-profiles')).toBeVisible()

      // Creating the first profile unlocks Repositories immediately — no reload.
      const input = profileFixture('personal')
      await win.getByTestId('profiles-new-btn').click()
      await win.getByTestId('profile-form-displayName').fill(input.displayName)
      await win.getByTestId('profile-form-gitAuthorName').fill(input.gitAuthorName)
      await win.getByTestId('profile-form-gitAuthorEmail').fill(input.gitAuthorEmail)
      await win.getByTestId('profile-form-githubUsername').fill(input.githubUsername)
      await win.getByTestId('profile-form-submit').click()

      await expect(reposNav).toBeEnabled()
      await expect(win.getByTestId('nav-repositories-locked-hint')).toHaveCount(0)
      await reposNav.click()
      await expect(win.getByTestId('screen-repositories')).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('inspector panel is visible', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await expect(win.getByTestId('inspector-panel')).toBeVisible()
      await expect(win.getByTestId('inspector-panel')).toContainText('CONTEXT')
    } finally {
      await app.close()
    }
  })

  test('inspector toggles via header button', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      // initially visible
      await expect(win.getByTestId('inspector-panel')).toBeVisible()

      // click the ⓘ toggle
      await win.getByLabel('Toggle inspector').click()
      await expect(win.getByTestId('inspector-panel')).toBeHidden()

      // click again to re-open
      await win.getByLabel('Toggle inspector').click()
      await expect(win.getByTestId('inspector-panel')).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('side panels resize, clamp, and restore persisted widths', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await clearPanelWidths(win)
      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })

      await expect(win.getByLabel('Resize navigation panel')).toBeVisible()
      await expect(win.getByLabel('Resize context panel')).toBeVisible()

      const initial = await readPanelLayout(win)

      await dragHandle(win, 'left-panel-resize-handle', 70)
      const afterLeftResize = await readPanelLayout(win)
      expect(afterLeftResize.left).toBeGreaterThan(initial.left + 40)
      expect(afterLeftResize.main).toBeLessThan(initial.main)

      await dragHandle(win, 'right-panel-resize-handle', -90)
      const afterRightResize = await readPanelLayout(win)
      expect(afterRightResize.right).toBeGreaterThan(initial.right + 40)
      expect(afterRightResize.main).toBeGreaterThanOrEqual(359)

      await win.waitForFunction(
        ([key, left, right]) => {
          const raw = window.localStorage.getItem(key)
          if (!raw) return false
          const stored = JSON.parse(raw) as { left?: number; right?: number }
          return stored.left === left && stored.right === right
        },
        [PANEL_WIDTH_STORAGE_KEY, afterRightResize.left, afterRightResize.right]
      )

      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      const restored = await readPanelLayout(win)
      expect(Math.abs(restored.left - afterRightResize.left)).toBeLessThanOrEqual(1)
      expect(Math.abs(restored.right - afterRightResize.right)).toBeLessThanOrEqual(1)

      await dragHandle(win, 'left-panel-resize-handle', -1000)
      const shrunkenLeft = await readPanelLayout(win)
      expect(shrunkenLeft.left).toBe(160)

      await dragHandle(win, 'right-panel-resize-handle', 1000)
      const shrunkenRight = await readPanelLayout(win)
      expect(shrunkenRight.right).toBe(260)

      await dragHandle(win, 'left-panel-resize-handle', 1000)
      const expandedLeft = await readPanelLayout(win)
      expect(expandedLeft.left).toBeLessThanOrEqual(320)

      await dragHandle(win, 'right-panel-resize-handle', -1000)
      const expandedRight = await readPanelLayout(win)
      expect(expandedRight.right).toBeLessThanOrEqual(520)
      expect(expandedRight.main).toBeGreaterThanOrEqual(359)
    } finally {
      await app.close()
    }
  })

  test('main content split resizes, clamps, and restores persisted width', async () => {
    const app = await launchApp()
    try {
      const win = await app.firstWindow()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await ensureProfile(win)
      await clearPanelWidths(win)
      await clearStorageKey(win, REPOSITORIES_SPLIT_STORAGE_KEY)
      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await win.getByTestId('nav-repositories').click()
      await expect(win.getByTestId('screen-repositories')).toBeVisible()

      await expect(win.getByLabel('Resize repository list')).toBeVisible()
      const initial = await readSplitLayout(
        win,
        REPOSITORIES_SPLIT_STORAGE_KEY,
        'repositories-list-pane',
        'repositories-detail-pane'
      )

      await dragHandle(win, 'repositories-main-resize-handle', 80)
      const resized = await readSplitLayout(
        win,
        REPOSITORIES_SPLIT_STORAGE_KEY,
        'repositories-list-pane',
        'repositories-detail-pane'
      )
      expect(resized.start).toBeGreaterThan(initial.start + 40)
      expect(resized.end).toBeLessThan(initial.end)

      await win.waitForFunction(
        ([key, width]) => {
          const raw = window.localStorage.getItem(key)
          return raw ? (JSON.parse(raw) as number) === width : false
        },
        [REPOSITORIES_SPLIT_STORAGE_KEY, resized.start]
      )

      await win.reload()
      await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
      await expect(win.getByTestId('screen-repositories')).toBeVisible()
      const restored = await readSplitLayout(
        win,
        REPOSITORIES_SPLIT_STORAGE_KEY,
        'repositories-list-pane',
        'repositories-detail-pane'
      )
      expect(Math.abs(restored.start - resized.start)).toBeLessThanOrEqual(1)

      await dragHandle(win, 'repositories-main-resize-handle', -1000)
      const shrunken = await readSplitLayout(
        win,
        REPOSITORIES_SPLIT_STORAGE_KEY,
        'repositories-list-pane',
        'repositories-detail-pane'
      )
      expect(shrunken.start).toBe(180)

      await dragHandle(win, 'repositories-main-resize-handle', 1000)
      const expanded = await readSplitLayout(
        win,
        REPOSITORIES_SPLIT_STORAGE_KEY,
        'repositories-list-pane',
        'repositories-detail-pane'
      )
      expect(expanded.start).toBeLessThanOrEqual(360)
      expect(expanded.end).toBeGreaterThanOrEqual(219)
    } finally {
      await app.close()
    }
  })
})
