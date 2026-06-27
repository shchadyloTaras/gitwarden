/**
 * Build-time release source (plan §3 "Build-time fetch"). Astro calls this in page frontmatter
 * during `astro build` and embeds the resolved URLs into the static HTML.
 *
 * `RELEASE_MODE` makes the build deterministic and offline for tests/CI:
 *   - `fixture` → the Appendix D fixture (used by the Playwright e2e build)
 *   - `empty`   → null, exercising the degraded "no release yet" render
 *   - unset     → the real GitHub fetch (production builds)
 */
import { fetchLatestRelease } from './fetchRelease'
import type { Release } from './types'

export async function getReleaseForBuild(): Promise<Release | null> {
  const mode = process.env.RELEASE_MODE
  if (mode === 'empty') return null
  if (mode === 'fixture') {
    const { latestReleaseFixture } = await import('./__fixtures__/latestRelease')
    return latestReleaseFixture
  }
  return fetchLatestRelease()
}
