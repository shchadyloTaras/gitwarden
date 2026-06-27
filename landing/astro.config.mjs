// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  // Canonical site URL — updated to the custom domain in Phase 51 when ready.
  site: 'https://gitwarden.vercel.app',
  // Static output is sufficient: the site only derives links from GitHub Releases
  // at build time + a client-side self-heal fetch (plan §3 / Appendix B).
  output: 'static',
  vite: {
    // Tailwind v4 is wired as a Vite plugin; tokens live in src/styles/global.css (@theme).
    plugins: [tailwindcss()],
  },
})
