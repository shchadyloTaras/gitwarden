import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Keep e2e offline + deterministic: block the client self-heal call to the GitHub API so the
// page renders purely from the build-time fixture (plan §6: "no real network call in CI").
test.beforeEach(async ({ context }) => {
  await context.route('https://api.github.com/**', (route) => route.abort())
})

test.describe('all-downloads panel (works without OS detection)', () => {
  test('lists every installer grouped by OS, no sidecars', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('all-downloads')).toBeVisible()
    await expect(page.getByTestId('asset-GitWarden-0.1.0-arm64.dmg')).toBeVisible()
    await expect(page.getByTestId('asset-GitWarden-0.1.0-x64.dmg')).toBeVisible()
    await expect(page.getByTestId('asset-GitWarden-Setup-0.1.0.exe')).toBeVisible()
    await expect(page.getByTestId('asset-GitWarden-0.1.0.AppImage')).toBeVisible()
    await expect(page.getByTestId('asset-gitwarden_0.1.0_amd64.deb')).toBeVisible()
    // Exactly the 5 real installers — the 4 sidecars (latest*.yml, *.blockmap) are excluded.
    await expect(page.locator('[data-testid^="asset-"]')).toHaveCount(5)
  })

  test('asset links point at the resolved browser_download_url', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('asset-GitWarden-0.1.0-arm64.dmg')).toHaveAttribute(
      'href',
      /releases\/download\/v0\.1\.0\/GitWarden-0\.1\.0-arm64\.dmg$/
    )
  })
})

test.describe('smart hero button (client OS detection)', () => {
  // Emulate macOS deterministically instead of relying on the runner OS. Playwright's
  // `Desktop Chrome` device hardcodes a Windows UA, and detectOs() probes
  // userAgentData.platform + navigator.platform + navigator.userAgent — so on the ubuntu CI
  // runner the page detects Windows (no "mac" anywhere, "win" from the device UA wins before
  // "linux"), not the macOS we want to assert. A macOS userAgent makes detection return macOS
  // on any host, since detectOs() matches "mac" before "win"/"linux".
  test.use({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })

  test('emulating macOS → primary arm64 + Intel secondary + version', async ({ page }) => {
    await page.goto('/')
    const primary = page.getByTestId('hero-primary')
    await expect(primary).toBeVisible()
    await expect(primary).toHaveAttribute('data-os', 'macOS')
    await expect(primary).toHaveAttribute('href', /arm64\.dmg$/)
    await expect(page.getByTestId('hero-secondary')).toBeVisible()
    await expect(page.getByTestId('hero-version')).toContainText('v0.1.0')
  })
})

test.describe('progressive enhancement (JavaScript disabled)', () => {
  test.use({ javaScriptEnabled: false })

  test('hero shows the GitHub fallback; panel + install steps still reachable', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-fallback')).toBeVisible()
    await expect(page.getByTestId('hero-primary')).toHaveCount(0)
    // The download path never depends on JS:
    await expect(page.getByTestId('all-downloads')).toBeVisible()
    await expect(page.getByTestId('asset-GitWarden-0.1.0.AppImage')).toBeVisible()
    // Without JS every install panel is visible (content reachable):
    await expect(page.getByTestId('install-panel-Windows')).toBeVisible()
  })
})

test.describe('install steps', () => {
  test('unsigned-warning note present; tabs switch panels with JS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const note = page.getByTestId('install-unsigned-note')
    await expect(note).toContainText('one-time')
    const noteStyles = await note.evaluate((el) => {
      const styles = getComputedStyle(el)
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      }
    })
    expect(noteStyles).toEqual({
      backgroundColor: 'rgb(255, 244, 204)',
      color: 'rgb(109, 75, 0)',
    })
    await page.getByTestId('install-tab-Linux').click()
    await expect(page.getByTestId('install-panel-Linux')).toBeVisible()
  })
})

test.describe('accessibility (axe smoke — core-cut a11y gate)', () => {
  test('home route has no critical or serious WCAG A/AA violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-primary')).toBeVisible() // let the island settle
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
  })
})
