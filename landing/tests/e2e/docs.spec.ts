import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.route('https://api.github.com/**', (route) => route.abort())
  await context.route('https://plausible.io/**', (route) => route.abort())
})

test.describe('docs command blocks', () => {
  test('installation terminal commands are readable in light mode and copyable', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            ;(window as Window & { __copiedText?: string }).__copiedText = text
          },
        },
      })
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/docs/installation/')

    const codeBlocks = page.locator('.prose pre[data-copyable="true"]')
    await expect(codeBlocks).toHaveCount(2)
    await expect(page.locator('.code-copy-btn')).toHaveCount(2)

    const firstBlockStyles = await codeBlocks.first().evaluate((el) => {
      const block = getComputedStyle(el)
      const code = getComputedStyle(el.querySelector('code')!)
      return {
        backgroundColor: block.backgroundColor,
        borderColor: block.borderColor,
        codeColor: code.color,
      }
    })
    expect(firstBlockStyles).toEqual({
      backgroundColor: 'rgb(247, 249, 252)',
      borderColor: 'rgb(185, 197, 212)',
      codeColor: 'rgb(17, 24, 39)',
    })

    await page.locator('.code-copy-btn').first().click()
    await expect(page.locator('.code-copy-btn').first()).toHaveText('Copied')
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText))
      .toBe('xattr -dr com.apple.quarantine /Applications/GitWarden.app')

    await page.locator('.code-copy-btn').nth(1).click()
    await expect
      .poll(() => page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText))
      .toBe('chmod +x GitWarden-*.AppImage\n./GitWarden-*.AppImage')
  })
})
