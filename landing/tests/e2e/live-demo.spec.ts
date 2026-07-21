import { test, expect } from '@playwright/test'

const PROFILE_MISMATCH = 'The active profile does not match this repository’s assigned profile.'
const NAME_MISMATCH = 'Your Git author name does not match the active profile.'
const EMAIL_MISMATCH = 'Your Git author email does not match the active profile.'

test.beforeEach(async ({ context }) => {
  await context.route('https://api.github.com/**', (route) => route.abort())
})

test('is the second section and keeps Download as the primary hero action', async ({ page }) => {
  await page.goto('/')

  const sectionIds = await page
    .locator('main > section')
    .evaluateAll((sections) =>
      sections.map((section) => section.id || section.getAttribute('data-testid'))
    )
  expect(sectionIds.slice(0, 3)).toEqual(['hero', 'live-demo', 'why'])

  const download = page.getByTestId('hero-primary')
  await expect(download).toBeVisible()
  await expect(download).toHaveClass(/btn-primary/)
  await expect(download).toHaveAttribute('href', /releases\/download\/v0\.1\.0\//)

  const demoLink = page.getByTestId('hero-live-demo-link')
  await expect(demoLink).toHaveAttribute('href', '#live-demo')
  await demoLink.click()
  await expect(page).toHaveURL(/#live-demo$/)
  await expect(page.getByTestId('live-demo')).toBeInViewport()
})

test('mirrors the real GitWarden shell instead of inventing demo-only app chrome', async ({
  page,
}) => {
  await page.goto('/')

  const demoWindow = page.getByTestId('live-demo-window')
  const sidebar = demoWindow.getByTestId('live-demo-sidebar')
  const commitScreen = demoWindow.getByTestId('live-demo-commit-screen')
  const contextPanel = demoWindow.getByTestId('live-demo-context-panel')
  const controls = page.getByTestId('live-demo-controls')

  const titlebar = demoWindow.getByTestId('live-demo-titlebar')
  const appHeader = demoWindow.getByTestId('live-demo-app-header')

  await expect(titlebar).toBeVisible()
  await expect(appHeader).toBeVisible()
  await expect(titlebar).toHaveCSS('height', '40px')
  await expect(appHeader).toHaveCSS('height', '44px')
  await expect(appHeader.locator('.live-demo-brand-mark')).toHaveCount(1)
  await expect(appHeader.locator('.live-demo-header-picker')).toHaveCount(2)
  await expect(sidebar.locator('.live-demo-nav-svg')).toHaveCount(9)
  await expect(sidebar.locator('.live-demo-nav-item.is-selected')).toContainText('Commit')
  await expect(sidebar.locator('.live-demo-nav-item.is-selected')).toHaveCSS('min-height', '36px')
  await expect(sidebar.locator('[data-live-nav-label]')).toHaveText([
    'Profiles',
    'Repositories',
    'Status',
    'Commit',
    'Remote',
    'Branches',
    'History',
    'Safety Center',
    'Settings',
  ])
  await expect(sidebar.getByText('MANAGE', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('GIT', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('APP', { exact: true })).toBeVisible()
  await expect(commitScreen).toContainText('Commit')
  await expect(contextPanel).toContainText('Context')
  await expect(contextPanel).toContainText('AI Chat')
  await expect(contextPanel).toContainText('PROFILE')
  await expect(contextPanel).toContainText('REPOSITORY')
  await expect(contextPanel).toContainText('BRANCH')
  await expect(contextPanel).toContainText('GUARD')

  await expect(controls).toBeVisible()
  await expect(controls.getByRole('radio')).toHaveCount(3)
  await expect(demoWindow.getByTestId('live-demo-controls')).toHaveCount(0)

  await expect(demoWindow.locator('.live-demo-context')).toHaveCount(0)
  await expect(demoWindow.locator('.live-demo-safety')).toHaveCount(0)

  const [titlebarBox, headerBox, sidebarBox, commitBox, contextBox] = await Promise.all([
    titlebar.boundingBox(),
    appHeader.boundingBox(),
    sidebar.boundingBox(),
    commitScreen.boundingBox(),
    contextPanel.boundingBox(),
  ])
  expect(titlebarBox).not.toBeNull()
  expect(headerBox).not.toBeNull()
  expect(sidebarBox).not.toBeNull()
  expect(commitBox).not.toBeNull()
  expect(contextBox).not.toBeNull()
  expect(headerBox!.y).toBeCloseTo(titlebarBox!.y + titlebarBox!.height, 0)
  expect(sidebarBox!.y).toBeCloseTo(headerBox!.y + headerBox!.height, 0)
  expect(commitBox!.y).toBeCloseTo(sidebarBox!.y, 0)
  expect(contextBox!.y).toBeCloseTo(sidebarBox!.y, 0)
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThanOrEqual(commitBox!.x + 1)
  expect(commitBox!.x + commitBox!.width).toBeLessThanOrEqual(contextBox!.x + 1)
})

test('switches Guard state immediately and clears stale outcomes', async ({ page }) => {
  await page.goto('/')
  const root = page.getByTestId('live-demo')
  const guard = page.getByTestId('live-demo-guard')

  await expect(root).toHaveAttribute('data-profile', 'Personal')
  await expect(root).toHaveAttribute('data-outcome', 'idle')
  await expect(guard).toHaveText('Guard · Blocked')

  await page.getByRole('radio', { name: 'Work' }).check()
  await expect(root).toHaveAttribute('data-profile', 'Work')
  await expect(guard).toHaveText('Guard · Blocked')

  await page.getByRole('radio', { name: 'Client' }).check()
  await expect(root).toHaveAttribute('data-outcome', 'ready')
  await expect(guard).toHaveText('Guard · Ready')

  await page.getByTestId('live-demo-commit').click()
  await expect(root).toHaveAttribute('data-outcome', 'complete')
  await page.getByRole('radio', { name: 'Personal' }).check()
  await expect(root).toHaveAttribute('data-outcome', 'idle')
  await expect(page.getByTestId('live-demo-completion')).toBeHidden()
  await expect(guard).toHaveText('Guard · Blocked')
})

test('blocks the wrong identity, applies the one-click fix, and completes safely', async ({
  page,
}) => {
  await page.goto('/')
  const root = page.getByTestId('live-demo')
  const commit = page.getByTestId('live-demo-commit')
  const alert = page.getByTestId('live-demo-alert')

  await expect(commit).toBeEnabled()
  await expect(alert).toBeHidden()
  await expect(page.getByRole('alert')).toHaveCount(0)

  await commit.click()
  await expect(root).toHaveAttribute('data-outcome', 'blocked')
  await expect(commit).toBeDisabled()
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('live-demo-issue')).toHaveCount(3)
  await expect(alert).toContainText(PROFILE_MISMATCH)
  await expect(alert).toContainText(NAME_MISMATCH)
  await expect(alert).toContainText(EMAIL_MISMATCH)

  await page.getByTestId('live-demo-fix').click()
  await expect(page.getByRole('radio', { name: 'Client' })).toBeChecked()
  await expect(page.getByTestId('live-demo-guard')).toHaveText('Guard · Ready')
  await expect(alert).toBeHidden()
  await expect(alert).not.toHaveAttribute('role', 'alert')
  await expect(commit).toBeFocused()
  await expect(commit).toBeEnabled()

  await commit.click()
  await expect(root).toHaveAttribute('data-outcome', 'complete')
  await expect(page.getByTestId('live-demo-completion')).toContainText('Simulated commit passed')
  await expect(page.getByTestId('live-demo-completion')).toContainText('No repository was changed.')
  await expect(commit).toBeDisabled()

  await page.getByTestId('live-demo-reset').click()
  await expect(root).toHaveAttribute('data-profile', 'Personal')
  await expect(root).toHaveAttribute('data-outcome', 'idle')
  await expect(page.getByRole('radio', { name: 'Personal' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Personal' })).toBeFocused()
  await expect(commit).toBeEnabled()
})

test('supports native keyboard profile selection and announces state changes', async ({ page }) => {
  await page.goto('/')
  const personal = page.getByRole('radio', { name: 'Personal' })
  const announcement = page.locator('[data-live-announcement]')

  await personal.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Work' })).toBeChecked()
  await expect(announcement).toHaveText(
    'Work profile selected. Guard blocked for this Client repository.'
  )

  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Client' })).toBeChecked()
  await expect(page.getByTestId('live-demo-guard')).toHaveText('Guard · Ready')
  await expect(announcement).toHaveText('Client profile selected. Guard ready.')
})

test('uses the app dark/light Guard tokens and removes motion when requested', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  const guard = page.getByTestId('live-demo-guard')

  await expect(guard).toHaveCSS('background-color', 'rgb(201, 61, 75)')
  await expect(guard).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(guard).toHaveCSS('transition-duration', '0s')
  await page.getByRole('radio', { name: 'Client' }).check()
  await expect(guard).toHaveCSS('background-color', 'rgb(29, 130, 85)')
  await page.getByRole('radio', { name: 'Personal' }).check()

  await page.getByRole('button', { name: /toggle light and dark/i }).click()
  await expect(guard).toHaveCSS('background-color', 'rgb(189, 52, 68)')
  await page.getByRole('radio', { name: 'Client' }).check()
  await expect(guard).toHaveCSS('background-color', 'rgb(24, 116, 79)')
})

test('keeps the full interaction readable and tappable at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')

  await expect(page.locator('.live-demo-titlebar')).toBeHidden()
  await expect(page.locator('.live-demo-sidebar')).toBeHidden()
  await expect(page.getByTestId('live-demo-context-panel')).toBeHidden()
  await page.getByTestId('live-demo-commit').click()
  await expect(page.getByTestId('live-demo-alert')).toBeVisible()
  await expect(page.getByTestId('live-demo-fix')).toBeVisible()

  for (const control of [
    page.getByRole('radio', { name: 'Personal' }).locator('+ span'),
    page.getByTestId('live-demo-fix'),
    page.getByTestId('live-demo-reset'),
  ]) {
    expect(
      await control.evaluate((element) => element.getBoundingClientRect().height)
    ).toBeGreaterThanOrEqual(44)
  }

  const offenders = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    return [...document.querySelectorAll('#live-demo *')]
      .filter((element) => element.getBoundingClientRect().right > viewportWidth + 1)
      .map((element) => `${element.tagName}.${element.className}`)
      .slice(0, 8)
  })
  expect(offenders, offenders.join(' | ')).toEqual([])
})

test('keeps the compact app shell contained at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto('/')

  await expect(page.getByTestId('live-demo-sidebar')).toBeVisible()
  await expect(page.getByTestId('live-demo-context-panel')).toBeHidden()

  const offenders = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    return [...document.querySelectorAll('#live-demo *')]
      .filter((element) => element.getBoundingClientRect().right > viewportWidth + 1)
      .map((element) => `${element.tagName}.${element.className}`)
      .slice(0, 8)
  })
  expect(offenders, offenders.join(' | ')).toEqual([])
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('keeps the scenario, anchor, and downloads useful', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-fallback')).toBeVisible()
    await expect(page.getByTestId('hero-live-demo-link')).toHaveAttribute('href', '#live-demo')
    await expect(page.getByTestId('live-demo')).toContainText('northwind-portal')
    await expect(page.getByTestId('live-demo-guard')).toHaveText('Guard · Blocked')
    await expect(page.getByTestId('live-demo-noscript')).toBeVisible()
    await expect(page.getByTestId('all-downloads')).toBeVisible()
  })
})
