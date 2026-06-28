// Rasterize the branded Open Graph card (public/og-image.svg) to a 1200×630 PNG.
//
// Link-preview crawlers (Facebook, LinkedIn, X/Twitter, Slack, Discord, iMessage) do NOT render
// SVG Open Graph images, so the site ships a PNG. We render with the Chromium that already powers
// the Playwright e2e suite — it reproduces the card's `system-ui` fonts faithfully, which SVG
// rasterizers (librsvg/resvg) often cannot.
//
// Usage:  npm run og:image   (run after editing public/og-image.svg)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const WIDTH = 1200
const HEIGHT = 630

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')
const svg = readFileSync(resolve(publicDir, 'og-image.svg'), 'utf-8')
const outPath = resolve(publicDir, 'og-image.png')

// Wrap the SVG so it fills the viewport exactly, with no page margins or scrollbars.
const html = `<!doctype html><meta charset="utf-8"><style>
  *{ margin: 0; padding: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  svg { display: block; width: ${WIDTH}px; height: ${HEIGHT}px; }
</style>${svg}`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } })
  console.log(`Wrote ${outPath} (${WIDTH}×${HEIGHT})`)
} finally {
  await browser.close()
}
