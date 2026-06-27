# GitWarden — Landing Page & Download Site Phase Prompts

Copy-paste prompts to drive the Landing Page & Download Site feature one phase at a time. Each prompt is self-contained, points at the plan, and **ends with the standard progress block** that appends an entry to `docs/progress-log.md`.

**How to use:** run prompts in order (46 → 51). Don't start a phase until the previous phase's entry in `docs/progress-log.md` shows Exit criteria ✅. The **recommended cut is Phases 46–49 + 51** — that gives a live, attractive site whose smart Download button resolves the latest installer per OS and deploys automatically. **Phase 50** (SEO / accessibility / analytics / performance) is a strict, high-value polish pass that can trail launch by a day.

**Stack (decided):**

- **Astro + TypeScript strict + Tailwind CSS** — simple to start, expandable (add blog/docs/pricing as plain files later).
- **`landing/` folder** in the same repo — no separate project needed.
- **Vercel** for hosting — connects to the `landing/` subfolder (Root Directory = `landing/`). Initial test URL: `gitwarden.vercel.app`.

**OS detection (decided):**

| Detected OS     | Primary button                  | Secondary link            |
| --------------- | ------------------------------- | ------------------------- |
| macOS           | arm64 `.dmg` (Apple Silicon)    | "Intel Mac? Download x64" |
| Windows         | `.exe` NSIS installer           | —                         |
| Linux           | `.AppImage`                     | ".deb (Debian/Ubuntu)"    |
| Other / unknown | "Find your version on GitHub →" | —                         |

**Dependency:** the site is a **consumer of GitHub Releases, not a producer of binaries.** It can be fully built and tested before any real release exists (all tests mock the GitHub API with fixture JSON — plan Appendix D); only the **live** download links need a published release from the Distribution track. The site lives in its **own isolated `landing/` workspace** and never touches the Electron app's `package.json`, lockfile, or tooling.

**Global invariants (true for every prompt below):**

- **The download is never a dead end.** API failure / rate-limit / missing asset → degrade to the GitHub Releases page with a friendly message, never an error or a broken button.
- **Latest, always, hands-off.** The site reflects the newest _published, non-draft, non-prerelease_ release without a manual edit (plan §3 / Appendix B).
- **The site hosts no binaries.** GitHub Releases is the single source of truth; the site only derives links/metadata.
- **Asset names are a shared contract.** The resolver matches the canonical `artifactName` templates from `distribution-release-plan.md` §3 (plan Appendix A); a contract test pins them.
- **No secrets in the client.** The GitHub Releases endpoint is unauthenticated; any rate-limit token lives only in host/CI env vars, never in the bundle, never committed.
- **Tests run offline.** Every test mocks the GitHub API with fixture JSON (plan Appendix D); no real network call in CI.
- **Externalize copy.** All user-facing strings live in one `src/content/copy.ts` module.
- **Accessibility is a gate.** Interactive elements are keyboard-reachable and labeled; the download path works with JavaScript disabled (the all-platforms panel + Releases link are always present).
- **Honest about the unsigned warning.** Until Distribution Phase 43 signs builds, install steps state the one-time Gatekeeper/SmartScreen workaround plainly.

---

## 🔁 Standard progress footer (included in every prompt)

Every prompt below ends with this block. It is the mechanism that records progress:

```
When the phase's Exit criteria are met:
1. Append an entry to the "## Progress Log" section of docs/progress-log.md (newest last, do not rewrite past entries):
   ### <today's date> — Phase N: <name>
   - Built: <what was implemented>
   - Files: <files added/changed>
   - Tests: <exact vitest/playwright/lighthouse result, e.g. "12 passed">
   - Exit criteria: ✅ met  (or ⚠️ partial — explain what's left)
   - Notes / follow-ups: <anything worth knowing for next phase>
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md.
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 46 — Site Foundations & Toolchain

```
Work on Phase 46 of the GitWarden Landing Page (see docs/plans/landing-page-plan.md §2, §5 Phase 46). Goal: an ISOLATED, runnable Astro site that builds clean and renders a placeholder home page. Do NOT touch the Electron app's package.json, lockfile, or tooling.

Stack (decided): Astro + TypeScript strict + Tailwind CSS. Location: landing/ in the same repo.

Tasks:
- Scaffold a NEW, self-contained npm project under landing/ (its own package.json + lockfile + node_modules).
  Astro scaffold: npm create astro@latest landing -- --template minimal --typescript strict --no-git
  Then add Tailwind: npx astro add tailwind (inside landing/).
- Structure:
    landing/src/pages/index.astro        ← home page
    landing/src/components/             ← .astro components
    landing/src/content/copy.ts         ← ALL user-facing strings (the only place)
    landing/src/lib/config.ts           ← repo coordinates + Releases URL constants
    landing/public/                     ← favicon, OG image
    landing/astro.config.mjs
    landing/tailwind.config.mjs
    landing/tsconfig.json               ← strict: true
    landing/package.json
- Scripts in landing/package.json: dev (astro dev), build (astro build), preview (astro preview), lint (eslint + prettier), test (vitest for src/lib/).
- src/content/copy.ts: export all UI strings (hero title, tagline, download labels, install step text, FAQ, footer). No hardcoded strings in .astro files.
- src/lib/config.ts: export OWNER = 'shchadyloTaras', REPO = 'gitwarden', RELEASES_URL = 'https://github.com/shchadyloTaras/gitwarden/releases/latest'. The ONLY place these constants live.
- Render a minimal placeholder home page (product name + tagline from copy.ts) so dev/build are provably green.
- Add landing/README.md (how to run, build, deploy to Vercel: Root Directory = landing/).
- Ensure landing/node_modules, landing/dist, landing/.astro, .env* are gitignored (add to root .gitignore if not already present).

Exit criteria: `npm run dev` inside landing/ serves the placeholder at localhost:4321; `npm run build` succeeds and outputs to landing/dist/; `npm run lint` and `tsc --noEmit` clean; the landing/ project does not alter or depend on the Electron app's package.json/lockfile; repo coordinates and copy live in single modules (no hardcoded duplication).

Then run the standard progress footer.
```

---

## Phase 47 — Release Metadata & Latest-Binary Resolution

```
Work on Phase 47 (docs/plans/landing-page-plan.md §3, §5 Phase 47, Appendix A, Appendix D). Goal: a PURE, fully unit-tested module that turns a GitHub Release payload into per-OS download targets — offline, deterministic, fallback-safe. Logic-first; no UI this phase.

OS routing (decided):
- macOS: primary = arm64.dmg, secondary = x64.dmg ("Intel Mac? Download x64")
- Windows: primary = .exe, no secondary
- Linux: primary = .AppImage, secondary = .deb
- unknown: no primary → caller falls back to GitHub Releases page

Tasks:
- In src/lib/, add a PURE resolver (no fetch, no framework imports):
  - Types: OS = 'macOS' | 'Windows' | 'Linux' | 'unknown'
  - DownloadTarget: { os: OS, label: string, ext: string, url: string, sizeBytes: number, filename: string }
  - resolveTargets(release, os: OS) → { primary?: DownloadTarget; secondary?: DownloadTarget; all: Record<OS, DownloadTarget[]>; releaseUrl: string; version: string }
    Matches assets via Appendix A patterns; excludes latest*.yml and *.blockmap sidecars.
  - For macOS: primary = arm64.dmg, secondary = x64.dmg
  - For Linux: primary = .AppImage, secondary = .deb
  - For unknown: primary = undefined (caller shows fallback link)
- Add a thin, separately-tested fetch wrapper in src/lib/fetchRelease.ts (the only impure part):
  GET https://api.github.com/repos/{owner}/{repo}/releases/latest → returns parsed JSON or null on ANY failure (never throws), excludes draft/prerelease.
- Graceful-fallback contract: release null or no assets for an OS → callers get releaseUrl (the GitHub Releases page) instead of a broken link.
- Unit-test with fixture JSON (Appendix D):
  - macOS → arm64 primary + x64 secondary ✓
  - Windows → .exe primary, no secondary ✓
  - Linux → AppImage primary + .deb secondary ✓
  - unknown OS → no primary (fallback URL returned) ✓
  - sidecar files (latest.yml, .blockmap) excluded ✓
  - draft/prerelease excluded by fetch wrapper ✓
  - empty asset list → fallback ✓
  - CONTRACT test: Appendix A patterns match Distribution §3 filenames ✓

Exit criteria: resolver is pure (no network/framework imports) and tsc --noEmit clean; Vitest covers the full matrix against fixtures with NO real network call; the asset-name contract is asserted by test; every code path yields a valid versioned browser_download_url OR the Releases-page fallback — never undefined/throw to the UI.

Then run the standard progress footer.
```

---

## Phase 48 — Download Experience & OS Detection

```
Work on Phase 48 (docs/plans/landing-page-plan.md §1, §5 Phase 48, Appendix C). Goal: the visitor sees ONE obvious, correct button — plus a complete, honest set of alternatives. Consume the Phase 47 resolver; do not re-implement matching.

OS detection (decided): 3 primary targets + GitHub fallback for unknown OS.

Tasks:
- Add src/lib/detectOs.ts (pure, given UA/platform string input):
  navigator.userAgentData?.platform → navigator.platform → userAgent → 'macOS' | 'Windows' | 'Linux' | 'unknown'
  Detection is PROGRESSIVE ENHANCEMENT; the all-platforms panel is always present without JS.
- Smart hero download button (Astro island with client:load):
  - macOS → "Download for macOS" → arm64.dmg + "Intel Mac? Download x64" secondary link
  - Windows → "Download for Windows" → .exe
  - Linux → "Download for Linux" → AppImage + ".deb (Debian/Ubuntu)" secondary link
  - unknown / JS off → "Find your version on GitHub →" (links releaseUrl)
  - Show version number beside the button
- "All downloads" panel (always visible, no JS required):
  Per-OS groups; each row shows file type, size, version; links the resolved asset URL with the Releases page as the row-level fallback.
- Per-OS install steps (tabbed by OS), with the one-time OS-warning workaround for the UNSIGNED path:
  - macOS: right-click the app → Open → Open (one-time; until Distribution Phase 43 ships)
  - Windows: "More info" → "Run anyway" (one-time; until Phase 43)
  - Linux AppImage: chmod +x GitWarden-*.AppImage && ./GitWarden-*.AppImage
  - Linux deb: sudo apt install ./gitwarden_*.deb
  Structure so these steps are easy to remove/adjust once signing ships.
- Friendly error state when resolution fails: "Couldn't reach GitHub — see all releases →" (links releaseUrl). All copy from src/content/copy.ts. Add data-testid attributes.

Exit criteria:
- macOS visitor sees arm64.dmg primary + "Intel Mac? Download x64" secondary.
- Windows sees .exe primary.
- Linux sees AppImage primary + .deb secondary.
- unknown OS / JS off → only the "Find your version on GitHub →" fallback link is shown.
- Resolution failure → friendly message + Releases page link; no broken link, no thrown error.
- All-platforms panel reachable without JS; interactive elements keyboard-accessible.
- Vitest covers resolver; test covers hero button states + fallback.

Then run the standard progress footer.
```

---

## Phase 49 — Product Messaging & Marketing UI

```
Work on Phase 49 (docs/plans/landing-page-plan.md §4, §5 Phase 49). Goal: a clean, modern, trustworthy page that earns the click — written for a NON-TECHNICAL reader.

Tasks:
- Implement the §4 sections: Hero, Why GitWarden, Features, Screenshots, FAQ, Footer — all copy from src/content/copy.ts, benefit-led and jargon-light (source the "Why" + value prop from README.md).
- Tailwind design system: type scale, spacing, color tokens, LIGHT/DARK mode, mobile-first responsive layout, cohesive modern aesthetic.
- Real product screenshots/GIFs of the app shell (light + dark), lazy-loaded with Astro <Image /> and alt-described; placeholders acceptable until captures exist (track as a follow-up).
- FAQ answers the non-technical anxieties explicitly:
  - "Is it safe?" → open source, no telemetry
  - "Why does my computer warn me?" → unsigned builds (honest; links the install steps workaround)
  - "Is it free?" → yes
  - "Which file do I download?" → cross-links the all-downloads panel from Phase 48
- Footer: GitHub repo, license, SECURITY.md, docs, and a live version badge sourced from the resolved release.

Exit criteria: the full page renders responsively at mobile/tablet/desktop in BOTH light and dark mode with no layout breakage; all copy comes from the single content module (no hardcoded strings in components); screenshots (or tracked placeholders) render with alt text; the page reads clearly to a non-technical visitor (no unexplained git/CLI jargon on the primary path).

Then run the standard progress footer.
```

---

## Phase 50 — SEO, Accessibility, Analytics & Performance

```
Work on Phase 50 (docs/plans/landing-page-plan.md §5 Phase 50). Goal: the site is discoverable, inclusive, measurable, and fast. This is the polish pass after the recommended core cut.

Tasks:
- SEO: per-page <title>/meta description, Open Graph + Twitter cards with a branded preview image, canonical URL, sitemap.xml, robots.txt, and SoftwareApplication/WebSite JSON-LD structured data (use Astro's <head> slot or astro-seo component).
- Accessibility: semantic landmarks, focus-visible states, AA color contrast, labeled controls, prefers-reduced-motion respected, skip-to-content link; verify with an automated a11y pass (axe) in Playwright.
- Analytics (privacy-respecting): a lightweight cookieless option (Vercel Analytics or Plausible) behind a documented env toggle; NO PII, default-off when unconfigured.
- Performance: optimize images (Astro <Image />), font loading, bundle size; target Lighthouse ≥ 95 Performance/Accessibility/Best-Practices/SEO on a mid-tier mobile profile.
- Optional thin page: /changelog (renders CHANGELOG.md or the latest release notes) if cheap.

Exit criteria: Lighthouse (mobile) ≥ 95 on Performance, Accessibility, Best Practices, SEO on the home route; automated a11y scan reports no critical violations and a keyboard-only walkthrough reaches every interactive element; OG/Twitter preview validates; sitemap.xml + robots.txt served; analytics is cookieless and disabled when unconfigured.

Then run the standard progress footer.
```

---

## Phase 51 — Deployment, CI & Release Integration

```
Work on Phase 51 (docs/plans/landing-page-plan.md §5 Phase 51, Appendix B). Goal: the site is LIVE on Vercel and refreshes itself whenever a new GitWarden release is published. This closes the recommended cut (46–49 + 51).

Hosting (decided): Vercel, static output. Initial test URL: gitwarden.vercel.app. Root Directory = landing/.

Tasks:
- Connect the landing/ folder to Vercel (Root Directory = landing/ in Vercel project settings). Use static output (output: 'static' in astro.config.mjs) — no server-side rendering needed; add @astrojs/vercel adapter only if SSR is required.
- Release-triggered rebuild: add a Vercel deploy hook URL as a secret in the GitHub repo; wire the Distribution release workflow (.github/workflows/release.yml Phase 42) to POST to this hook on publish — so freshly released assets appear within minutes without a manual redeploy.
- Client-side self-healing: confirm the Phase 48 client-side fetch island updates the download URL on load if the build-time data is stale (the fallback layer from plan §3).
- Site CI: add a landing/-scoped GitHub Actions job (.github/workflows/landing-ci.yml):
    npm ci && npm run lint && npm test && npm run build
    Tests stay OFFLINE (mocked GitHub API). Keep separate from the app's release.yml matrix.
- Custom domain + HTTPS (e.g. gitwarden.app): configure in Vercel when ready; update site:url in astro.config.mjs accordingly.
- Wire into repo docs: update README.md's Download section to point at the live Vercel URL; add the site to the docs index.
- Verify the LIVE site resolves the REAL latest release end-to-end: open the deployed URL, confirm the download buttons point at the correct files for macOS / Windows / Linux.

Exit criteria: the site is reachable at its Vercel URL over HTTPS; pushing to main redeploys and PRs get preview deploys; publishing a new GitHub Release causes the live download buttons to resolve to the new version (rebuild hook + client-side self-heal) with no manual edit; the landing CI job gates merges (lint + unit + build green, offline); README.md links the live site; production download buttons fetch the correct real installers per OS.

Then run the standard progress footer.
```

---

## After the core cut (46–49 + 51): manual launch verification

Before considering the site launched, a maintainer runs the checks that offline tests cannot cover:

1. Open the production Vercel URL on **macOS** — confirm the hero shows "Download for macOS", the button links the current `arm64.dmg`, and "Intel Mac? Download x64" links the `x64.dmg`.
2. Open it on **Windows** — confirm the button links `GitWarden-Setup-<version>.exe`.
3. Open it on **Linux** — confirm the AppImage and .deb links both resolve.
4. Simulate an unknown OS (e.g. open on mobile) — confirm the page shows "Find your version on GitHub →" and **no broken button**.
5. Temporarily block the GitHub API (DevTools offline) — confirm the hero falls back to the Releases page with the friendly message, never a broken link.
6. Publish a **new** GitHub Release and confirm the deploy hook triggers a rebuild and the live buttons resolve to the new version.
