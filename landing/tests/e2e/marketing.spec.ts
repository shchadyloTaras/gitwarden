import { test, expect } from '@playwright/test'

// Offline: block the hero island's self-heal call so the page renders from fixture data.
test.beforeEach(async ({ context }) => {
  await context.route('https://api.github.com/**', (route) => route.abort())
})

test.describe('marketing sections', () => {
  test('all §4 sections are present', async ({ page }) => {
    await page.goto('/')
    for (const id of ['why', 'features', 'screenshots', 'all-downloads', 'install-steps', 'faq']) {
      await expect(page.getByTestId(id)).toBeVisible()
    }
    await expect(page.getByTestId('footer')).toBeVisible()
  })

  test('footer shows a live version badge from the resolved release', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('footer-version')).toContainText('v0.1.0')
  })

  test('screenshots have alt text and lazy loading', async ({ page }) => {
    await page.goto('/')
    const imgs = page.locator('[data-testid="screenshots"] img')
    await expect(imgs).toHaveCount(2)
    for (const img of await imgs.all()) {
      await expect(img).toHaveAttribute('alt', /.+/)
      await expect(img).toHaveAttribute('loading', 'lazy')
    }
  })

  test('FAQ expands and the "which file" answer links the downloads section', async ({ page }) => {
    await page.goto('/')
    const answer = page.getByText(/sends no telemetry/)
    await expect(answer).toBeHidden()
    await page.getByText('Is it safe?').click()
    await expect(answer).toBeVisible()
    // Open the "which file" item, then assert its cross-link to the downloads section.
    await page.getByText('Which file should I download?').click()
    await expect(page.getByRole('link', { name: 'See every installer' })).toHaveAttribute(
      'href',
      '#downloads'
    )
  })
})

test.describe('theme (light + dark)', () => {
  test('honors the OS light preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe('rgb(255, 255, 255)')
  })

  test('the toggle flips the theme and persists it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: /toggle light and dark/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe('rgb(255, 255, 255)')
  })
})

test.describe('responsive layout', () => {
  test('no horizontal overflow on a 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await expect(page.getByTestId('hero')).toBeVisible()
    // List any element extending past the viewport so failures name the culprit.
    const offenders = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      return [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > vw + 1)
        .map((el) => `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}`)
        .slice(0, 8)
    })
    expect(offenders, offenders.join(' | ')).toEqual([])
  })
})
