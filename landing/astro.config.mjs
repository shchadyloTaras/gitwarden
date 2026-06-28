// @ts-check
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import sitemap from '@astrojs/sitemap'

// Sync the root CHANGELOG.md into src/content/docs/changelog.md so it renders
// as a static docs page without manually duplicating content.
const rootDir = fileURLToPath(new URL('..', import.meta.url))
const landingDir = fileURLToPath(new URL('.', import.meta.url))

function syncChangelog() {
  const src = resolve(rootDir, 'CHANGELOG.md')
  const dest = resolve(landingDir, 'src/content/docs/changelog.md')
  if (!existsSync(src)) return
  // Keep the source's leading `# Changelog` H1 so the rendered docs page has a top-level
  // heading (DocsLayout renders the page title only into <title>, not as an on-page <h1>).
  const body = readFileSync(src, 'utf-8').trimStart()
  writeFileSync(
    dest,
    `---\ntitle: Changelog\ndescription: Full version history for GitWarden.\norder: 9\n---\n\n${body}`,
    'utf-8'
  )
}

// Run at config-load time so the file exists before content collection scan.
syncChangelog()

/** @type {import('vite').Plugin} */
const changelogSyncPlugin = {
  name: 'gitwarden-sync-changelog',
  buildStart: syncChangelog,
}

// https://astro.build/config
export default defineConfig({
  // Canonical site URL — drives canonical links, OG URLs, and the sitemap.
  // Updated to the custom domain in Phase 51 when ready.
  site: 'https://gitwarden.vercel.app',
  // Static output is sufficient: the site only derives links from GitHub Releases
  // at build time + a client-side self-heal fetch (plan §3 / Appendix B).
  output: 'static',
  // @astrojs/sitemap emits sitemap-index.xml + sitemap-0.xml from `site` (Phase 50).
  // `lastmod` stamps every URL with the build time so crawlers can prioritize re-crawls;
  // a static marketing site rebuilds + redeploys on content change, so build time is accurate.
  integrations: [sitemap({ lastmod: new Date() })],
  vite: {
    // Tailwind v4 is wired as a Vite plugin; tokens live in src/styles/global.css (@theme).
    plugins: [tailwindcss(), changelogSyncPlugin],
  },
})
