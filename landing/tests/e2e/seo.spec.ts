import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  // Offline + deterministic: block external calls (GitHub self-heal, analytics host).
  await context.route('https://api.github.com/**', (route) => route.abort())
  await context.route('https://plausible.io/**', (route) => route.abort())
})

test.describe('SEO', () => {
  test('robots.txt is served and points at the sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt')
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toContain('Sitemap:')
    expect(body).toContain('sitemap-index.xml')
  })

  test('sitemap-index.xml is served', async ({ request }) => {
    const res = await request.get('/sitemap-index.xml')
    expect(res.ok()).toBeTruthy()
    expect(await res.text()).toContain('<sitemapindex')
  })

  test('canonical + Open Graph + Twitter meta are present', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /gitwarden\.vercel\.app/
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /GitWarden/)
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /og-image\.svg$/
    )
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image'
    )
  })

  test('JSON-LD SoftwareApplication + WebSite are present and valid JSON', async ({ page }) => {
    await page.goto('/')
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    const types = blocks.map((b) => JSON.parse(b)['@type'])
    expect(types).toContain('SoftwareApplication')
    expect(types).toContain('WebSite')
  })
})

test.describe('analytics (cookieless, default-off)', () => {
  test('no analytics script when PUBLIC_PLAUSIBLE_DOMAIN is unset', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('script[src*="plausible.io"]')).toHaveCount(0)
  })
})

test.describe('accessibility', () => {
  test('skip-to-content is the first focusable element', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const cls = await page.evaluate(() => document.activeElement?.className ?? '')
    expect(cls).toContain('skip-link')
  })

  test('keyboard reaches the primary download and the theme toggle', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-primary')).toBeVisible()
    const reached: string[] = []
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return ''
        return `${el.getAttribute('data-testid') ?? ''} ${el.getAttribute('aria-label') ?? ''}`
      })
      reached.push(info)
    }
    const joined = reached.join(' | ')
    expect(joined).toContain('hero-primary')
    expect(joined.toLowerCase()).toContain('toggle light and dark')
  })
})
