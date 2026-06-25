# GitWarden — Landing Page & Download Site Phase Prompts

Copy-paste prompts to drive the Landing Page & Download Site feature one phase at a time. Each prompt is self-contained, points at the plan, and **ends with the standard progress block** that appends an entry to `docs/progress-log.md`.

**How to use:** run prompts in order (46 → 51). Don't start a phase until the previous phase's entry in `docs/progress-log.md` shows Exit criteria ✅. The **recommended cut is Phases 46–49 + 51** — that gives a live, attractive site whose smart Download button resolves the latest installer per OS and deploys automatically. **Phase 50** (SEO / accessibility / analytics / performance) is a strict, high-value polish pass that can trail launch by a day. References: feature plan in `docs/plans/landing-page-plan.md`, the installers it hands out come from `docs/plans/distribution-release-plan.md` (asset names §3), base plan in `docs/plans/gitwarden-plan.md`, rules in `CLAUDE.md` / `AGENTS.md`.

**Dependency:** the site is a **consumer of GitHub Releases, not a producer of binaries.** It can be fully built and tested before any real release exists (all tests mock the GitHub API with fixture JSON — plan Appendix D); only the **live** download links need a published release from the Distribution track. The site lives in its **own isolated `site/` workspace** and never touches the Electron app's `package.json`, lockfile, or tooling.

**Global invariants (true for every prompt below):**

- **The download is never a dead end.** API failure / rate-limit / missing asset → degrade to the GitHub Releases page with a friendly message, never an error or a broken button.
- **Latest, always, hands-off.** The site reflects the newest *published, non-draft, non-prerelease* release without a manual edit (plan §3 / Appendix B).
- **The site hosts no binaries.** GitHub Releases is the single source of truth; the site only derives links/metadata (plan §2).
- **Asset names are a shared contract.** The resolver matches the canonical `artifactName` templates from `distribution-release-plan.md` §3 (plan Appendix A); a contract test pins them.
- **No secrets in the client.** The GitHub Releases endpoint is unauthenticated; any rate-limit token lives only in host/CI env vars, never in the bundle, never committed.
- **Tests run offline.** Every test mocks the GitHub API with fixture JSON (plan Appendix D); no real network call in CI.
- **Externalize copy.** All user-facing strings live in one `content/copy.ts` module.
- **Accessibility is a gate.** Interactive elements are keyboard-reachable and labeled; the download path works with JavaScript disabled (the all-platforms panel + Releases link are always present).
- **Honest about the unsigned warning.** Until Distribution Phase 43 signs builds, install steps state the one-time Gatekeeper/SmartScreen workaround plainly (Distribution plan §1 Path A).

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
Work on Phase 46 of the GitWarden Landing Page (see docs/plans/landing-page-plan.md §2, §5 Phase 46). Goal: an ISOLATED, runnable site project that builds clean and renders a placeholder home page. Do NOT touch the Electron app's package.json, lockfile, or tooling.

Tasks:
- Scaffold a NEW, self-contained npm project under site/ (its own package.json + lockfile + node_modules): Next.js (App Router) + TypeScript (strict) + Tailwind CSS.
- Structure: app/ (routes), components/ (UI), lib/ (pure logic — the resolver lands in Phase 47), content/ (externalized copy), public/ (static assets), tests/ (Vitest + Playwright).
- Scripts in site/package.json: dev, build, start, lint, test (Vitest), e2e (Playwright). Configure Tailwind, ESLint, Prettier, tsconfig (strict).
- Add content/copy.ts (the single strings module) and lib/config.ts holding the repo coordinates (owner: shchadyloTaras, repo: gitwarden) and the canonical Releases URLs — the ONLY place these constants live.
- Render a minimal placeholder home page (product name + tagline) so dev/build are provably green.
- Add site/README.md (run/build/deploy) and ensure node_modules, .next, and .env* are gitignored.

Exit criteria: `npm run dev` in site/ serves the placeholder; `npm run build` succeeds; `npm run lint` and `tsc --noEmit` clean; the site project does not alter or depend on the Electron app's package.json/lockfile; repo coordinates and copy live in single modules (no hardcoded duplication).

Then run the standard progress footer.
```

---

## Phase 47 — Release Metadata & Latest-Binary Resolution

```
Work on Phase 47 (docs/plans/landing-page-plan.md §3, §5 Phase 47, Appendix A, Appendix D). Goal: a PURE, fully unit-tested module that turns a GitHub Release payload into per-OS download targets — offline, deterministic, fallback-safe. Logic-first; no UI this phase.

Tasks:
- In lib/, add a PURE resolver (no fetch, no framework imports):
  - OS/Arch types and DownloadTarget (os, arch, label, ext, url, sizeBytes, filename).
  - resolveTargets(release, os?, arch?) → { primary?, all: Record<OS, DownloadTarget[]>, releaseUrl, version }, matching assets via the Appendix A patterns and EXCLUDING latest*.yml and *.blockmap sidecars.
  - pickPrimary(targets, os, arch): default macOS → arm64, with the Intel x64 alternative still listed (Appendix C).
- Add a thin, separately-tested fetch wrapper (the only impure part) around GET /repos/{owner}/{repo}/releases/latest that returns parsed JSON or null on ANY failure (never throws to the UI), with a typed parser for the fields the resolver needs (Appendix D). Exclude draft/prerelease.
- Define the graceful-fallback contract: release null or no assets for an OS → callers get the canonical Releases-page URL, never a broken link.
- Unit-test the resolver against fixture release JSON (Appendix D): all five canonical assets present; arm64 vs x64 mac selection; Linux AppImage + .deb both surfaced; sidecars ignored; prerelease/draft excluded by the wrapper; empty/asset-less release → fallback; unknown OS → fallback. Add a CONTRACT test pinning the Appendix A patterns to Distribution §3.

Exit criteria: resolver is pure (no network/framework imports) and tsc --noEmit clean; Vitest covers the full matrix against fixtures with NO real network call; the asset-name contract is asserted by test; every path yields a valid versioned browser_download_url OR the Releases-page fallback — never undefined/throw to the UI.

Then run the standard progress footer.
```

---

## Phase 48 — Download Experience & OS Detection

```
Work on Phase 48 (docs/plans/landing-page-plan.md §1, §5 Phase 48, Appendix C). Goal: the visitor sees ONE obvious, correct button — plus a complete, honest set of alternatives. Consume the Phase 47 resolver; do not re-implement matching.

Tasks:
- Add OS detection (lib/detectOs.ts, pure given a UA/platform input): navigator.userAgentData?.platform → navigator.platform → userAgent → macOS | Windows | Linux | unknown. Detection is PROGRESSIVE ENHANCEMENT; the page is correct without it. Document the arch limitation (Appendix C).
- Smart hero Download button: "Download for <detected OS>", wired to the Phase 47 primary target; shows version; falls back to a neutral "Download" linking the all-platforms panel when OS is unknown or JS is off.
- "All downloads" panel: per-OS groups with file type, size, version, and the macOS arm64/Intel choice; each row links the resolved asset with the Releases page as the row-level fallback.
- Per-OS install steps (tabbed) WITH the one-time-warning workaround for the unsigned path (macOS right-click→Open; Windows "More info → Run anyway"; Linux chmod +x / sudo apt install ./…) — copy mirrors Distribution §1 Path A; structured so it's easy to adjust once signing (Distribution Phase 43) ships.
- Friendly error/empty state when resolution fails: "Couldn't reach GitHub — see all releases" linking the fallback. All copy from content/copy.ts. Add data-testids for Playwright.

Exit criteria: with fixture release data injected, the hero button points at the correct asset for a simulated macOS / Windows / Linux visitor and the all-platforms panel lists all five artifacts with sizes; with resolution forced to fail, button + rows fall back to the Releases page with a clear message (no broken link, no thrown error); the page is usable with JS disabled and interactive elements are keyboard-accessible; Playwright covers detected-OS button, all-platforms listing, and the fallback state.

Then run the standard progress footer.
```

---

## Phase 49 — Product Messaging & Marketing UI

```
Work on Phase 49 (docs/plans/landing-page-plan.md §4, §5 Phase 49). Goal: a clean, modern, trustworthy page that earns the click — written for a NON-TECHNICAL reader.

Tasks:
- Implement the §4 sections: Hero, Why GitWarden, Features, Screenshots, FAQ, Footer — all copy from content/copy.ts, benefit-led and jargon-light (source the "Why" + value prop from README.md).
- Tailwind design system: type scale, spacing, color tokens, LIGHT/DARK mode, mobile-first responsive layout, cohesive modern aesthetic (project bar: beautiful, modern UI, best UX).
- Real product screenshots/GIFs of the app shell (light + dark), lazy-loaded and alt-described; placeholders acceptable until captures exist (track as a follow-up).
- FAQ answers the non-technical anxieties explicitly: Is it safe? Why does my computer warn me? Is it free? Which file do I download? (the last cross-links the Phase 48 panel).
- Footer: GitHub repo, license, SECURITY.md, docs, and a live version badge sourced from the resolved release.

Exit criteria: the full page renders responsively at mobile/tablet/desktop in BOTH light and dark mode with no layout breakage; all copy comes from the single content module (no hardcoded strings in components); screenshots (or tracked placeholders) render with alt text; the page reads clearly to a non-technical visitor (no unexplained git/CLI jargon on the primary path).

Then run the standard progress footer.
```

---

## Phase 50 — SEO, Accessibility, Analytics & Performance

```
Work on Phase 50 (docs/plans/landing-page-plan.md §5 Phase 50). Goal: the site is discoverable, inclusive, measurable, and fast. This is the polish pass after the recommended core cut.

Tasks:
- SEO: per-page title/meta description, Open Graph + Twitter cards with a branded preview image, canonical URL, sitemap.xml, robots.txt, and SoftwareApplication/WebSite JSON-LD structured data.
- Accessibility: semantic landmarks, focus-visible states, AA color contrast, labeled controls, prefers-reduced-motion respected, skip-to-content link; verify with an automated a11y pass (e.g. axe) in Playwright.
- Analytics (privacy-respecting): a lightweight cookieless option (Plausible/Umami or Vercel Analytics) behind a documented env toggle; NO PII, default-off when unconfigured.
- Performance: optimize images (next/image), font loading, and bundle size; target Lighthouse ≥ 95 Performance/Accessibility/Best-Practices/SEO and healthy Core Web Vitals on a mid-tier mobile profile.
- Optional thin pages if cheap: /download (the all-platforms panel deep-link) and /changelog (renders CHANGELOG.md or release notes).

Exit criteria: Lighthouse (mobile) ≥ 95 on Performance, Accessibility, Best Practices, SEO on the home route; automated a11y scan reports no critical violations and a keyboard-only walkthrough reaches every interactive element (download button, OS tabs); OG/Twitter preview validates; sitemap.xml + robots.txt served; analytics is cookieless and disabled when unconfigured.

Then run the standard progress footer.
```

---

## Phase 51 — Deployment, CI & Release Integration

```
Work on Phase 51 (docs/plans/landing-page-plan.md §5 Phase 51, Appendix B, Appendix E). Goal: the site is LIVE on a real domain and refreshes itself whenever a new GitWarden release is published. This closes the recommended cut (46–49 + 51).

Tasks:
- Host: deploy to Vercel (recommended) — push-to-deploy from main, PR preview deploys, SSG + ISR for §3 revalidation. Document the GitHub Pages static-export alternative (Appendix E): static export + client-side resolution + a scheduled/triggered rebuild.
- Release-triggered refresh: wire the Distribution release workflow (distribution-release-plan.md Phase 42) to notify the site on publish (repository_dispatch / deploy hook) so freshly published assets appear without a manual redeploy.
- Site CI: a site-scoped GitHub Actions job — npm ci && npm run lint && npm test && npm run build (+ Playwright e2e where the runner allows) — gating deploys; tests stay OFFLINE (mocked API); keep it separate from the app's release matrix.
- Custom domain + HTTPS (e.g. gitwarden.app or a Pages subdomain); set the canonical URL accordingly.
- Wire the site into repo docs: update README.md's Download section (Distribution Phase 45) to point at the live site; add the site to the docs index.
- Verify the LIVE site resolves the REAL latest release end-to-end (the one thing offline tests can't cover).

Exit criteria: the site is reachable at its production URL over HTTPS; pushing to main redeploys and PRs get preview deploys; publishing a new GitHub Release makes the live download buttons resolve to the new version (ISR/rebuild/client-fetch) with no manual edit; the site CI job gates merges (lint + unit + build green, offline) and a failing test blocks deploy; README.md links the live site and the production buttons fetch the correct real installers per OS.

Then run the standard progress footer.
```

---

## After the core cut (46–49 + 51): manual launch verification

Before considering the site launched, a maintainer runs the checks that offline tests cannot cover:

1. Open the production URL on **macOS** — confirm the hero shows "Download for macOS", the button pulls the current `arm64` `.dmg`, and the "Intel Mac?" link pulls the `x64` `.dmg`.
2. Open it on **Windows** — confirm the button pulls `GitWarden-Setup-<version>.exe`; on **Linux** — confirm the `.AppImage` and `.deb` both resolve.
3. Temporarily simulate an API failure (or check during a rate-limit) — confirm every button falls back to the GitHub Releases page with the friendly message, never a broken link.
4. Publish a **new** GitHub Release and confirm the live buttons resolve to the new version without a manual redeploy (ISR/rebuild/client-fetch).
5. Run Lighthouse on the live home route (mobile) and confirm the Phase 50 thresholds hold in production.
```
