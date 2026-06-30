import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
  })
}

// The universal tooltip is driven by a `data-tooltip` attribute and rendered by
// <TooltipLayer/> into a single portaled bubble ([data-testid="tooltip-bubble"]),
// positioned with viewport-aware flip + clamp.
test.describe('Universal data-tooltip', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.mouse.move(0, 0)
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('hovering a [data-tooltip] control shows a bubble with its text', async () => {
    const badge = win.getByTestId('header-guard-badge')
    await expect(badge).toBeVisible()
    const text = await badge.getAttribute('data-tooltip')
    expect(text).toBeTruthy()

    // No bubble until something is hovered.
    await expect(win.getByTestId('tooltip-bubble')).toHaveCount(0)

    await badge.hover()
    const bubble = win.getByTestId('tooltip-bubble')
    await expect(bubble).toBeVisible()
    await expect(bubble).toHaveText(text as string)
  })

  test('the right-most control keeps its tooltip inside the viewport (no edge clip)', async () => {
    const inspector = win.getByRole('button', { name: 'Toggle inspector' })
    await expect(inspector).toBeVisible()

    await inspector.hover()
    const bubble = win.getByTestId('tooltip-bubble')
    await expect(bubble).toBeVisible()

    const [box, vw] = await Promise.all([
      bubble.boundingBox(),
      win.evaluate(() => window.innerWidth),
    ])
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
  })

  test('collapsing the sidebar hides labels and restores nav tooltips', async () => {
    // Normalise to a known (expanded) starting point — the collapsed flag persists.
    await win.evaluate(() =>
      window.localStorage.setItem('gitwarden.layout.sidebarCollapsed.v1', 'false')
    )
    await win.reload()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
    await win.mouse.move(0, 0)

    const sidebar = win.getByTestId('sidebar-nav')
    const statusNav = win.getByTestId('nav-status')
    const toggle = win.getByTestId('sidebar-collapse-toggle')

    // Expanded: the label is visible and there is no nav tooltip.
    await expect(statusNav).toContainText('Status')
    const expandedWidth = (await sidebar.boundingBox())!.width

    // Collapse → label hidden (icon only), narrower rail.
    await toggle.click()
    await expect(statusNav).not.toContainText('Status')
    const collapsedWidth = (await sidebar.boundingBox())!.width
    expect(collapsedWidth).toBeLessThan(expandedWidth)

    // The nav tooltip is back: hovering the icon shows the screen name.
    await statusNav.hover()
    const bubble = win.getByTestId('tooltip-bubble')
    await expect(bubble).toBeVisible()
    await expect(bubble).toHaveText('Status')

    // Expand again restores the label (and leaves the flag expanded).
    await toggle.click()
    await expect(statusNav).toContainText('Status')
  })
})
