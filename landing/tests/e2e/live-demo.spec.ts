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
  const main = demoWindow.getByTestId('live-demo-main')
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
  await expect(page.getByTestId('live-demo-screen-commit').locator('h3')).toHaveText(
    'Commit & Push'
  )
  await expect(main).toContainText('Staged Changes (1)')
  await expect(main).toContainText('Branch:')
  await expect(main).toContainText('Remotes (1)')
  await expect(main.getByTestId('live-demo-remote')).toContainText('origin')
  await expect(contextPanel).toContainText('Context')
  await expect(contextPanel).toContainText('AI Chat')
  await expect(contextPanel).toContainText('PROFILE')
  await expect(contextPanel).toContainText('REPOSITORY')
  await expect(contextPanel).toContainText('BRANCH')
  await expect(contextPanel).toContainText('GUARD')

  // The old landing-only controls strip (profile radios + scenario note) is gone —
  // the only interaction points are the ones the real app offers.
  await expect(page.getByTestId('live-demo-controls')).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)

  const [titlebarBox, headerBox, sidebarBox, mainBox, contextBox] = await Promise.all([
    titlebar.boundingBox(),
    appHeader.boundingBox(),
    sidebar.boundingBox(),
    main.boundingBox(),
    contextPanel.boundingBox(),
  ])
  expect(titlebarBox).not.toBeNull()
  expect(headerBox).not.toBeNull()
  expect(sidebarBox).not.toBeNull()
  expect(mainBox).not.toBeNull()
  expect(contextBox).not.toBeNull()
  expect(headerBox!.y).toBeCloseTo(titlebarBox!.y + titlebarBox!.height, 0)
  expect(sidebarBox!.y).toBeCloseTo(headerBox!.y + headerBox!.height, 0)
  expect(mainBox!.y).toBeCloseTo(sidebarBox!.y, 0)
  expect(contextBox!.y).toBeCloseTo(sidebarBox!.y, 0)
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThanOrEqual(mainBox!.x + 1)
  expect(mainBox!.x + mainBox!.width).toBeLessThanOrEqual(contextBox!.x + 1)
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
  await expect(page.getByTestId('live-demo-main')).toContainText('Staged Changes (0)')
  await expect(page.getByTestId('live-demo-main')).toContainText('No staged changes')
  await expect(commit).toBeDisabled()
  await expect(commitAndPush).toBeDisabled()

  // Reset restores the scripted mistake and focuses the fix.
  await page.getByTestId('live-demo-reset').click()
  await expect(root).toHaveAttribute('data-profile', 'Personal')
  await expect(root).toHaveAttribute('data-outcome', 'blocked')
  await expect(issues).toBeVisible()
  await expect(page.getByTestId('live-demo-completion')).toBeHidden()
  await expect(page.getByTestId('live-demo-main')).toContainText('Staged Changes (1)')
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

test('every sidebar screen opens with its real content', async ({ page }) => {
  await page.goto('/')
  const root = page.getByTestId('live-demo')

  // Profiles — all three identities, everything already connected.
  await page.getByTestId('live-demo-nav-profiles').click()
  await expect(root).toHaveAttribute('data-screen', 'profiles')
  await expect(page.getByTestId('live-demo-nav-profiles')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('live-demo-screen-commit')).toBeHidden()
  const profilesScreen = page.getByTestId('live-demo-screen-profiles')
  await expect(profilesScreen).toBeVisible()
  await expect(profilesScreen).toContainText('Morgan Personal')
  await expect(profilesScreen).toContainText('Morgan Work')
  await expect(profilesScreen).toContainText('Morgan Client')
  await expect(profilesScreen).toContainText('@morgan-northwind')

  // Repositories — one repo per profile, the open one marked Active.
  await page.getByTestId('live-demo-nav-repositories').click()
  const reposScreen = page.getByTestId('live-demo-screen-repositories')
  await expect(reposScreen).toBeVisible()
  await expect(reposScreen).toContainText('northwind-portal')
  await expect(reposScreen).toContainText('personal-site')
  await expect(reposScreen).toContainText('acme-app')
  await expect(reposScreen.locator('.live-demo-badge')).toHaveText(['Active'])

  // Status — the real working-copy → destination-branch flow.
  await page.getByTestId('live-demo-nav-status').click()
  const statusScreen = page.getByTestId('live-demo-screen-status')
  await expect(statusScreen).toBeVisible()
  await expect(statusScreen).toContainText('WORKING COPY')
  await expect(statusScreen).toContainText('1 uncommitted change')
  await expect(statusScreen).toContainText('COMMIT →')
  await expect(statusScreen).toContainText('DESTINATION BRANCH')

  // Branches — current badge on main, Switch on the other.
  await page.getByTestId('live-demo-nav-branches').click()
  const branchesScreen = page.getByTestId('live-demo-screen-branches')
  await expect(branchesScreen).toBeVisible()
  await expect(branchesScreen).toContainText('feature/access-rules')
  await expect(branchesScreen).toContainText('Current branch')

  // History — the seeded commits, no simulated commit yet.
  await page.getByTestId('live-demo-nav-history').click()
  const historyScreen = page.getByTestId('live-demo-screen-history')
  await expect(historyScreen).toBeVisible()
  await expect(historyScreen).toContainText('Restrict client portal exports')
  await expect(historyScreen).toContainText('9c41b7e')
  await expect(page.getByTestId('live-demo-history-new')).toBeHidden()

  // Safety Center — the same live issues the guard sees.
  await page.getByTestId('live-demo-nav-safety-center').click()
  const safetyScreen = page.getByTestId('live-demo-screen-safety-center')
  await expect(safetyScreen).toBeVisible()
  await expect(safetyScreen).toContainText(PROFILE_MISMATCH)
  await expect(page.getByTestId('live-demo-safety-fix')).toBeVisible()

  // Settings — appearance, AI connection, version.
  await page.getByTestId('live-demo-nav-settings').click()
  const settingsScreen = page.getByTestId('live-demo-screen-settings')
  await expect(settingsScreen).toBeVisible()
  await expect(settingsScreen).toContainText('Appearance')
  await expect(settingsScreen).toContainText('AI Assistant')
  await expect(settingsScreen).toContainText('Connected · advisory only')

  // Back to the scenario.
  await page.getByTestId('live-demo-nav-commit').click()
  await expect(page.getByTestId('live-demo-screen-commit')).toBeVisible()
})

test('Profiles screen switches the active profile like the real app', async ({ page }) => {
  await page.goto('/')
  const root = page.getByTestId('live-demo')
  const guard = page.getByTestId('live-demo-guard')

  await page.getByTestId('live-demo-nav-profiles').click()

  // Work is also the wrong identity for this Client repository.
  await page.getByTestId('live-demo-set-active-Work').click()
  await expect(root).toHaveAttribute('data-profile', 'Work')
  await expect(guard).toHaveText('Guard · Blocked')
  await expect(page.getByTestId('live-demo-active-profile')).toHaveText('Work')
  await expect(page.locator('[data-live-inspector-name]')).toHaveText('Morgan Work')
  await expect(page.getByTestId('live-demo-set-active-Work')).toBeHidden()
  await expect(page.getByTestId('live-demo-set-active-Personal')).toBeVisible()

  // Client is the right one — Guard goes green and committing unlocks.
  await page.getByTestId('live-demo-set-active-Client').click()
  await expect(guard).toHaveText('Guard · Ready')
  await page.getByTestId('live-demo-nav-commit').click()
  await expect(page.getByTestId('live-demo-issues')).toBeHidden()
  await expect(page.getByTestId('live-demo-commit')).toBeEnabled()
})

test('the header Guard badge opens Safety Center and its fix clears the issues', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByTestId('live-demo-guard').click()
  await expect(page.getByTestId('live-demo')).toHaveAttribute('data-screen', 'safety-center')
  await expect(page.getByTestId('live-demo-screen-safety-center')).toBeVisible()
  await expect(page.getByTestId('live-demo-safety-clear')).toBeHidden()

  await page.getByTestId('live-demo-safety-fix').click()
  await expect(page.getByTestId('live-demo-guard')).toHaveText('Guard · Ready')
  await expect(page.getByTestId('live-demo-safety-clear')).toBeVisible()
  await expect(page.getByTestId('live-demo-safety-clear')).toContainText(
    'No identity issues detected'
  )
})

test('switching branches updates the checked-out branch everywhere', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('live-demo-nav-branches').click()
  await page.getByTestId('live-demo-switch-feature-access-rules').click()

  await expect(page.getByTestId('live-demo')).toHaveAttribute('data-branch', 'feature/access-rules')
  const header = page.getByTestId('live-demo-app-header')
  await expect(header.locator('[data-live-branch]')).toHaveText('feature/access-rules')
  await expect(page.getByTestId('live-demo-switch-feature-access-rules')).toBeHidden()
  await expect(page.getByTestId('live-demo-switch-main')).toBeVisible()

  await page.getByTestId('live-demo-nav-commit').click()
  await expect(
    page.getByTestId('live-demo-screen-commit').locator('[data-live-branch]')
  ).toHaveText('feature/access-rules')
})

test('History gains the simulated commit — Unpushed after commit, clean after push', async ({
  page,
}) => {
  await page.goto('/')

  // Commit only → the new entry carries the real Unpushed marker.
  await page.getByTestId('live-demo-fix').click()
  await page.getByTestId('live-demo-commit').click()
  await page.getByTestId('live-demo-nav-history').click()
  await expect(page.getByTestId('live-demo-history-new')).toBeVisible()
  await expect(page.getByTestId('live-demo-history-new')).toContainText(
    'Update client access rules'
  )
  await expect(page.getByTestId('live-demo-history-new')).toContainText('3f2a91c')
  await expect(page.getByTestId('live-demo-history-unpushed')).toBeVisible()

  // Commit & Push → the entry is there without the marker.
  await page.getByTestId('live-demo-reset').click()
  await page.getByTestId('live-demo-fix').click()
  await page.getByTestId('live-demo-commit-and-push').click()
  await page.getByTestId('live-demo-nav-history').click()
  await expect(page.getByTestId('live-demo-history-new')).toBeVisible()
  await expect(page.getByTestId('live-demo-history-unpushed')).toBeHidden()
})

test('the right panel switches tabs, opens AI Chat from the header, and toggles with ⓘ', async ({
  page,
}) => {
  await page.goto('/')
  const chat = page.getByTestId('live-demo-chat')
  const panel = page.getByTestId('live-demo-context-panel')

  await expect(chat).toBeHidden()
  await page.getByTestId('live-demo-tab-chat').click()
  await expect(chat).toBeVisible()
  await expect(chat).toContainText('Git Warden AI')
  await expect(chat).toContainText('I advise only — I never run Git for you.')
  await expect(page.getByTestId('live-demo-tab-chat')).toHaveAttribute('aria-selected', 'true')

  await page.getByTestId('live-demo-tab-context').click()
  await expect(chat).toBeHidden()

  // The header AI button jumps straight to the chat tab — like the real app.
  await page.getByTestId('live-demo-header-ai').click()
  await expect(chat).toBeVisible()

  // ⓘ collapses and restores the whole panel.
  await page.getByTestId('live-demo-header-info').click()
  await expect(panel).toBeHidden()
  await expect(page.getByTestId('live-demo-header-info')).toHaveAttribute('aria-expanded', 'false')
  await page.getByTestId('live-demo-header-info').click()
  await expect(panel).toBeVisible()
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
  await expect(page.getByTestId('live-demo-context-panel')).toBeHidden()
  // The sidebar collapses to a horizontal icon strip — navigation stays usable.
  await expect(page.getByTestId('live-demo-sidebar')).toBeVisible()
  await page.getByTestId('live-demo-nav-profiles').click()
  await expect(page.getByTestId('live-demo-screen-profiles')).toBeVisible()
  await page.getByTestId('live-demo-nav-commit').click()

  await expect(page.getByTestId('live-demo-issues')).toBeVisible()
  await expect(page.getByTestId('live-demo-fix')).toBeVisible()

  for (const control of [
    page.getByTestId('live-demo-nav-commit'),
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
