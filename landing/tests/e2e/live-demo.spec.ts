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

test('mirrors the real GitWarden shell — merged Commit & Push tab, no demo-only chrome', async ({
  page,
}) => {
  await page.goto('/')

  const demoWindow = page.getByTestId('live-demo-window')
  const sidebar = demoWindow.getByTestId('live-demo-sidebar')
  const commitScreen = demoWindow.getByTestId('live-demo-commit-screen')
  const contextPanel = demoWindow.getByTestId('live-demo-context-panel')

  const titlebar = demoWindow.getByTestId('live-demo-titlebar')
  const appHeader = demoWindow.getByTestId('live-demo-app-header')

  await expect(titlebar).toBeVisible()
  await expect(appHeader).toBeVisible()
  await expect(titlebar).toHaveCSS('height', '40px')
  await expect(appHeader).toHaveCSS('height', '44px')
  await expect(appHeader.locator('.live-demo-brand-mark')).toHaveCount(1)
  await expect(appHeader.locator('.live-demo-brand')).toContainText('Git Warden')
  await expect(appHeader.locator('.live-demo-header-picker')).toHaveCount(2)
  // Post Phase 115 nav: one "Commit & Push" tab, no separate Remote item (8 entries).
  await expect(sidebar.locator('.live-demo-nav-svg')).toHaveCount(8)
  await expect(sidebar.locator('.live-demo-nav-item.is-selected')).toContainText('Commit & Push')
  await expect(sidebar.locator('.live-demo-nav-item.is-selected')).toHaveCSS('min-height', '36px')
  await expect(sidebar.locator('[data-live-nav-label]')).toHaveText([
    'Profiles',
    'Repositories',
    'Status',
    'Commit & Push',
    'Branches',
    'History',
    'Safety Center',
    'Settings',
  ])
  await expect(sidebar.getByText('MANAGE', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('GIT', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('APP', { exact: true })).toBeVisible()
  await expect(commitScreen.locator('h3')).toHaveText('Commit & Push')
  await expect(commitScreen).toContainText('Staged Changes (1)')
  await expect(commitScreen).toContainText('Branch:')
  await expect(commitScreen).toContainText('Remotes (1)')
  await expect(commitScreen.getByTestId('live-demo-remote')).toContainText('origin')
  await expect(contextPanel).toContainText('Context')
  await expect(contextPanel).toContainText('AI Chat')
  await expect(contextPanel).toContainText('PROFILE')
  await expect(contextPanel).toContainText('REPOSITORY')
  await expect(contextPanel).toContainText('BRANCH')
  await expect(contextPanel).toContainText('GUARD')

  // The old landing-only controls strip (profile radios + scenario note) is gone —
  // the only interaction points are the ones the real screen offers.
  await expect(page.getByTestId('live-demo-controls')).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)

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

test('starts blocked like the real screen, applies the one-click fix, commits, and resets', async ({
  page,
}) => {
  await page.goto('/')
  const root = page.getByTestId('live-demo')
  const guard = page.getByTestId('live-demo-guard')
  const issues = page.getByTestId('live-demo-issues')
  const commit = page.getByTestId('live-demo-commit')
  const commitAndPush = page.getByTestId('live-demo-commit-and-push')
  const profile = page.getByTestId('live-demo-active-profile')

  // Initial state: the mistake is already on screen — no demo choreography needed.
  await expect(root).toHaveAttribute('data-profile', 'Personal')
  await expect(root).toHaveAttribute('data-outcome', 'blocked')
  await expect(guard).toHaveText('Guard · Blocked')
  await expect(profile).toHaveText('Personal')
  await expect(issues).toBeVisible()
  await expect(page.getByTestId('live-demo-issue')).toHaveCount(3)
  await expect(issues).toContainText(PROFILE_MISMATCH)
  await expect(issues).toContainText(NAME_MISMATCH)
  await expect(issues).toContainText(EMAIL_MISMATCH)
  await expect(commit).toBeDisabled()
  await expect(commitAndPush).toBeDisabled()

  // One click fixes the identity — same remediation as the real app.
  await page.getByTestId('live-demo-fix').click()
  await expect(root).toHaveAttribute('data-profile', 'Client')
  await expect(root).toHaveAttribute('data-outcome', 'ready')
  await expect(guard).toHaveText('Guard · Ready')
  await expect(profile).toHaveText('Client')
  await expect(page.locator('[data-live-inspector-name]')).toHaveText('Morgan Client')
  await expect(page.locator('[data-live-inspector-email]')).toHaveText('morgan@northwind.example')
  await expect(issues).toBeHidden()
  await expect(commit).toBeFocused()
  await expect(commit).toBeEnabled()
  await expect(commitAndPush).toBeEnabled()

  // Commit lands: success banner, staged list empties, message clears.
  await commit.click()
  await expect(root).toHaveAttribute('data-outcome', 'committed')
  await expect(page.getByTestId('live-demo-completion')).toBeVisible()
  await expect(page.getByTestId('live-demo-completion')).toContainText('✓ Committed 3f2a91c')
  await expect(page.getByTestId('live-demo-completion')).toContainText(
    'Simulated — no repository was changed.'
  )
  await expect(page.getByTestId('live-demo-commit-screen')).toContainText('Staged Changes (0)')
  await expect(page.getByTestId('live-demo-commit-screen')).toContainText('No staged changes')
  await expect(commit).toBeDisabled()
  await expect(commitAndPush).toBeDisabled()

  // Reset restores the scripted mistake and focuses the fix.
  await page.getByTestId('live-demo-reset').click()
  await expect(root).toHaveAttribute('data-profile', 'Personal')
  await expect(root).toHaveAttribute('data-outcome', 'blocked')
  await expect(issues).toBeVisible()
  await expect(page.getByTestId('live-demo-completion')).toBeHidden()
  await expect(page.getByTestId('live-demo-commit-screen')).toContainText('Staged Changes (1)')
  await expect(page.getByTestId('live-demo-fix')).toBeFocused()
})

test('Commit & Push completes with the real combined success banner', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('live-demo-fix').click()
  await page.getByTestId('live-demo-commit-and-push').click()

  await expect(page.getByTestId('live-demo')).toHaveAttribute('data-outcome', 'pushed')
  await expect(page.getByTestId('live-demo-completion')).toContainText(
    '✓ Committed 3f2a91c and pushed to origin.'
  )
  await expect(page.getByTestId('live-demo-completion')).toContainText(
    'Simulated — no repository was changed.'
  )
})

test('supports keyboard operation and announces every state change', async ({ page }) => {
  await page.goto('/')
  const announcement = page.locator('[data-live-announcement]')

  await page.getByTestId('live-demo-fix').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('live-demo-guard')).toHaveText('Guard · Ready')
  await expect(announcement).toHaveText('Client profile selected. Guard ready. Commit unlocked.')

  await page.keyboard.press('Enter') // focus moved to the Commit button after the fix
  await expect(announcement).toHaveText('Simulated commit complete. No repository was changed.')

  await page.getByTestId('live-demo-reset').click()
  await expect(announcement).toHaveText('Demo reset. Personal profile active. Guard blocked.')
})

test('uses the app dark/light Guard tokens and removes motion when requested', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  const guard = page.getByTestId('live-demo-guard')

  await expect(guard).toHaveCSS('background-color', 'rgb(201, 61, 75)')
  await expect(guard).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(guard).toHaveCSS('transition-duration', '0s')
  await page.getByTestId('live-demo-fix').click()
  await expect(guard).toHaveCSS('background-color', 'rgb(29, 130, 85)')
  await page.getByTestId('live-demo-reset').click()

  await page.getByRole('button', { name: /toggle light and dark/i }).click()
  await expect(guard).toHaveCSS('background-color', 'rgb(189, 52, 68)')
  await page.getByTestId('live-demo-fix').click()
  await expect(guard).toHaveCSS('background-color', 'rgb(24, 116, 79)')
})

test('keeps the full interaction readable and tappable at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')

  await expect(page.locator('.live-demo-titlebar')).toBeHidden()
  await expect(page.locator('.live-demo-sidebar')).toBeHidden()
  await expect(page.getByTestId('live-demo-context-panel')).toBeHidden()
  await expect(page.getByTestId('live-demo-issues')).toBeVisible()
  await expect(page.getByTestId('live-demo-fix')).toBeVisible()

  for (const control of [
    page.getByTestId('live-demo-fix'),
    page.getByTestId('live-demo-commit'),
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

  test('shows the real blocked screen statically and keeps downloads useful', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-fallback')).toBeVisible()
    await expect(page.getByTestId('hero-live-demo-link')).toHaveAttribute('href', '#live-demo')
    await expect(page.getByTestId('live-demo')).toContainText('northwind-portal')
    await expect(page.getByTestId('live-demo-guard')).toHaveText('Guard · Blocked')
    // The server-rendered state IS the mid-mistake screen: issues visible, commit locked.
    await expect(page.getByTestId('live-demo-issue')).toHaveCount(3)
    await expect(page.getByTestId('live-demo-commit')).toBeDisabled()
    await expect(page.getByTestId('live-demo-commit-and-push')).toBeDisabled()
    await expect(page.getByTestId('live-demo-noscript')).toBeVisible()
    await expect(page.getByTestId('all-downloads')).toBeVisible()
  })
})
