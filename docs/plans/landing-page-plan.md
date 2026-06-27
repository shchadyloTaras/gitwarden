# GitWarden — Landing Page & Download Site Plan

> Give GitWarden a **public face**: a fast, professional marketing site whose hero is a single, obvious **Download** button. A non-technical visitor lands, the site detects their OS, and one click pulls the **latest** installer for their platform straight from GitHub Releases — `.dmg` for macOS, `.exe` for Windows, `.AppImage`/`.deb` for Linux. No git, no `npm`, no README spelunking.
>
> The site is a **consumer of releases, not a producer of binaries.** GitHub Releases (produced by the Distribution & Release track, Phases 40–45) stays the single source of truth for every artifact; this site only discovers the newest assets and links to them, always with a graceful fallback to the Releases page when the network or API is unavailable.

## 0. How to Read This Plan

This continues the main plan (`docs/plans/gitwarden-plan.md`), the OAuth plan (`docs/plans/github-oauth-plan.md`), the AI plan (`docs/plans/ai-integration-plan.md`), and — most directly — the **Distribution & Release plan** (`docs/plans/distribution-release-plan.md`), which produces the installers this site hands out. Same conventions: each phase has a **Goal**, **Tasks**, and explicit **Exit criteria**; a phase is done only when its exit criteria are green and `docs/progress-log.md` is updated; commit per phase, never push automatically.

Phase order (continues the global counter; the Distribution track ends at Phase 45):

- **Phase 46 — Site Foundations & Toolchain** (Next.js + TypeScript strict + Tailwind scaffold in an isolated `site/` workspace)
- **Phase 47 — Release Metadata & Latest-Binary Resolution** ← pure logic; matches GitHub Release assets to OS/arch, unit-tested offline
- **Phase 48 — Download Experience & OS Detection** (the smart hero button + all-platforms panel + install steps)
- **Phase 49 — Product Messaging & Marketing UI** (hero, value props, feature sections, safety story, screenshots, FAQ, footer; light/dark)
- **Phase 50 — SEO, Accessibility, Analytics & Performance** (metadata/OG, sitemap/robots, Lighthouse, a11y, Core Web Vitals)
- **Phase 51 — Deployment, CI & Release Integration** (host on Vercel or GitHub Pages; auto-refresh on each new release)

**Recommended cut:** ship **Phases 46–49 + 51**. That gives a real, live, attractive site whose download button resolves the latest installer for each OS and deploys automatically — the whole point of the track. **Phase 50** (SEO/a11y/perf polish) is a strict, high-value upgrade that can trail launch by a day without blocking it.

**Dependency note:** this track depends on the Distribution & Release track having produced **at least one published GitHub Release** with the canonical asset names (Distribution plan §3) so the resolver has something real to match. The site can be **built and fully tested before that** using fixture release JSON (the GitHub API is mocked in all tests — see §6); only the live download links need a real release. It is otherwise **independent of the app's feature work** and can be developed in parallel.

---

## 1. Product Direction: One Obvious Download, Zero Friction

The visitor is assumed to be **non-technical**. The site optimizes for a single outcome — _get the right installer onto this person's machine in one click_ — and treats everything else (features, screenshots, FAQ) as supporting material that earns that click.

### Primary flow (the 80% path)

```text
Visitor lands on gitwarden.app
  → site detects the OS from the browser            (macOS / Windows / Linux)
  → hero shows ONE primary button: "Download for <OS>"
  → click → the LATEST matching installer downloads  (resolved from GitHub Releases)
  → a short, friendly "first run" note explains the one-time OS warning
     (until the Distribution track signs builds — plan §1 Path A)
```

### Secondary flow (the visitor isn't on their target machine, or wants another build)

A persistent **"All downloads"** panel lists every artifact with its OS, file type, size, and version, plus an "Apple Silicon vs Intel" choice for macOS (browser arch detection is unreliable — Appendix C). Every entry also links to the canonical GitHub Releases page as the ultimate fallback.

### Non-negotiable principles

- **The download must never be a dead end.** If the GitHub API fails, is rate-limited, or returns no usable asset, the button degrades to the GitHub Releases "latest" page — never to an error.
- **Latest, always.** The site reflects the newest _published, non-draft, non-prerelease_ release without a manual edit (resolution strategy in §3 / Appendix B).
- **The site hosts no binaries.** Files live on GitHub Releases (Distribution plan §2). The site stores only links/metadata.
- **Honest about the unsigned warning.** Until Distribution Phase 43 signs builds, the install steps state the one-time Gatekeeper/SmartScreen workaround plainly (Distribution plan §1).
- **Accessible and fast by default.** Non-technical, possibly low-bandwidth visitors: keyboard-navigable, screen-reader-labeled, and light enough to score well on Core Web Vitals.

---

## 2. Site Rules (non-negotiable)

These are the landing-site analogues of the app's Architecture rules; they govern this track only and do not change `AGENTS.md`.

- **The site is isolated.** It lives in its own `site/` workspace with its **own `package.json`, `node_modules`, and tooling**, so the Electron app's dependency tree, lint config, and test runners are untouched. The app's "`src/core/` is pure" rule does not apply to the site, but the spirit does: **download-resolution logic is a pure, dependency-free module** that is unit-tested in isolation (§6).
- **No secrets in the client.** The public GitHub Releases endpoint is unauthenticated. If a build-time/serverless token is ever added (only to raise rate limits), it lives in host env vars / CI secrets — never in the bundle, never committed. `.gitignore` already excludes `.env*`.
- **Single source of truth for downloads.** GitHub Releases. The site derives links; it never duplicates version numbers or filenames by hand (they come from the API or the asset-name patterns in Appendix A).
- **Graceful degradation everywhere.** API down / rate-limited / asset missing → fall back to the Releases page and show a clear, friendly message, never a stack trace or a broken button.
- **Tests run offline.** Every test mocks the GitHub API with fixture JSON (sample payload in Appendix D). No test makes a real network call — same discipline as the app's "tests run offline" rule.
- **Externalize copy.** All user-facing strings live in one `content`/`copy` module (the site's analogue of `src/renderer/strings.ts`), so messaging is edited in one place.
- **Asset names are a shared contract.** The resolver matches the canonical `artifactName` templates fixed in Distribution plan §3 (Appendix A). If those names change, the resolver's patterns change in lockstep — and a test asserts the contract.
- **Accessibility is a gate, not a nicety.** Interactive elements are keyboard-reachable and labeled; the download button works without JavaScript-driven OS detection (a no-JS visitor still sees the all-platforms panel).

---

## 3. Latest-Binary Resolution (the core mechanism)

The site must turn "the newest GitHub Release" into "the exact installer URL for _this_ visitor's OS." There are three layers; the resolver (Phase 47) is pure logic shared by all of them.

1. **Where the truth lives.** GitHub's REST endpoint
   `GET https://api.github.com/repos/shchadyloTaras/gitwarden/releases/latest`
   returns the latest published, non-draft, non-prerelease release and its `assets[]` (each with `name`, `browser_download_url`, `size`, `content_type`). This is the canonical input. (Appendix D shows the trimmed shape the resolver consumes.)

2. **How "latest" reaches the page.** Chosen in Phase 47/51, compared in Appendix B:
   - **SSG + revalidate (recommended).** Resolve assets at build time and re-resolve on an interval (Next.js ISR on Vercel) — fast, cache-friendly, no client rate-limit exposure; a repository-dispatch from the release workflow can also trigger an immediate rebuild (Phase 51).
   - **Client-side fetch (fallback layer).** The page also resolves on the client so a stale SSG snapshot self-heals; the unauthenticated 60-req/hr/IP limit is fine for a landing page and is cached.
   - **Serverless proxy (optional).** A tiny route that caches + (optionally) authenticates the GitHub call to lift rate limits; not required for the recommended cut.

3. **How an asset maps to a visitor.** The pure resolver takes `(assets, detectedOS, arch?)` and returns the best `DownloadTarget` per platform using the Appendix A patterns, ignoring auto-update sidecars (`latest*.yml`, `*.blockmap`). It always also returns the full per-OS list (for the "All downloads" panel) and the Releases-page fallback URL.

**Why not GitHub's stable `/releases/latest/download/<name>` shortcut?** That trick needs a _fixed_ filename, but GitWarden's artifacts are version-stamped (`GitWarden-0.1.0-arm64.dmg`), so the name changes every release. Resolving via the API (which yields the real versioned `browser_download_url`) is the robust path; the stable-URL shortcut is kept only as the human-facing fallback ("see all releases").

---

## 4. Information Architecture & Content

A single long-scroll page (plus a couple of thin sub-pages) — enough to sell and to instruct, never a sprawling site.

| Section           | Purpose                                                                   | Notes                                                                   |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Hero**          | One-line value prop + the smart Download button + OS-detected label       | Above the fold; version + "What's new" link beside the button           |
| **All downloads** | Every artifact, grouped by OS, with type/size/version                     | macOS arm64/x64 choice; Linux AppImage + `.deb`; Releases-page fallback |
| **Install steps** | Per-OS, friendly, with the one-time-warning workaround                    | Tabbed by OS; mirrors Distribution §1 Path A copy                       |
| **Why GitWarden** | The multi-account safety story (from README "Why")                        | Plain language; the "wrong account" pain                                |
| **Features**      | Profiles, pre-commit/pre-push safety, GitHub connect, AI assists          | Short, benefit-led; screenshots/GIFs                                    |
| **Screenshots**   | Show the actual app shell                                                 | Light/dark; lazy-loaded                                                 |
| **FAQ**           | "Is it safe?", "Why the warning?", "Is it free?", "Which file do I pick?" | Addresses non-technical anxieties + the unsigned note                   |
| **Footer**        | Repo, license, docs, security, version badge                              | Links to GitHub, `SECURITY.md`, releases                                |

Thin sub-pages (optional, in the recommended cut only if cheap): `/download` (the all-platforms panel as its own URL for deep-links) and `/changelog` (renders `CHANGELOG.md` or the release notes). Both can be deferred to Phase 50.

---

## 5. Phases

### Phase 46 — Site Foundations & Toolchain

**Goal:** an isolated, runnable site project that builds clean and renders a placeholder home page.

**Tasks:**

- Scaffold the site under `site/` as its **own npm project** (own `package.json`/lockfile): **Next.js (App Router) + TypeScript (strict) + Tailwind CSS**. Keep it fully separate from the Electron app's tooling.
- Establish structure: `app/` (routes), `components/` (UI), `lib/` (pure logic — the resolver lands here in Phase 47), `content/` (externalized copy), `public/` (static assets), `tests/` (Vitest + Playwright).
- Wire scripts in `site/package.json`: `dev`, `build`, `start`, `lint`, `test` (Vitest), `e2e` (Playwright). Configure Tailwind, ESLint, Prettier, `tsconfig` (strict).
- Add a single `content/copy.ts` (the strings module) and a `lib/config.ts` holding the repo coordinates (`owner: shchadyloTaras`, `repo: gitwarden`) and the canonical Releases URLs — the only place these constants live.
- Render a minimal placeholder home page (product name + tagline) so `dev`/`build` are provably green.
- Add `site/README.md` (how to run, build, deploy) and ensure `site/.gitignore` (or the root one) excludes `site/node_modules`, `site/.next`, `.env*`.

**Exit criteria:**

- `npm run dev` in `site/` serves the placeholder page; `npm run build` succeeds; `npm run lint` and `tsc --noEmit` are clean.
- The site project does not alter or depend on the Electron app's `package.json`/lockfile.
- Repo coordinates and copy live in single modules; no hardcoded duplication.

---

### Phase 47 — Release Metadata & Latest-Binary Resolution

**Goal:** a pure, fully unit-tested module that turns a GitHub Release payload into per-OS download targets — offline, deterministic, and fallback-safe.

**Tasks:**

- In `lib/`, add a **pure resolver** (no `fetch`, no framework imports) with:
  - `OS`/`Arch` types and `DownloadTarget` (`os`, `arch`, `label`, `ext`, `url`, `sizeBytes`, `filename`).
  - `resolveTargets(release, os?, arch?)` → `{ primary?: DownloadTarget; all: Record<OS, DownloadTarget[]>; releaseUrl: string; version: string }`, matching assets via the **Appendix A** patterns and **excluding** `latest*.yml` and `*.blockmap` sidecars.
  - `pickPrimary(targets, os, arch)` (default macOS → arm64, with the Intel alternative still listed — Appendix C).
- Add a thin, separately-tested **fetch wrapper** (the only impure part) around `GET /repos/{owner}/{repo}/releases/latest` that returns parsed JSON or `null` on any failure (never throws to the UI), with a typed parser/validator for the subset of fields the resolver needs (Appendix D).
- Define the **graceful-fallback contract**: when `release` is `null` or yields no assets for an OS, callers get the canonical Releases-page URL instead of a broken link.
- Unit-test the resolver against **fixture release JSON** (Appendix D) covering: all five canonical assets present; arm64 vs x64 mac selection; Linux AppImage + `.deb` both surfaced; sidecar files ignored; a prerelease/draft excluded by the wrapper; an empty/asset-less release → fallback; and an unknown OS → fallback.

**Exit criteria:**

- The resolver is pure (no network/framework imports) and `tsc --noEmit` clean.
- Vitest covers the full matrix above against fixtures, **with no real network call**; the asset-name contract (Appendix A) is asserted by test.
- Every code path yields either a valid versioned `browser_download_url` or the Releases-page fallback — never `undefined`/throw to the UI.

---

### Phase 48 — Download Experience & OS Detection

**Goal:** the visitor sees one obvious, correct button — and a complete, honest set of alternatives.

**Tasks:**

- Add OS detection (`lib/detectOs.ts`, pure given a UA/platform input): map `navigator.userAgentData?.platform` → `navigator.platform` → `userAgent` to `macOS | Windows | Linux | unknown`; document the arch limitation (Appendix C). Detection is a **progressive enhancement** — the page is correct without it.
- Build the **smart hero download button**: "Download for <detected OS>", wired to the Phase 47 `primary` target; shows version; falls back to a neutral "Download" linking the all-platforms panel when OS is `unknown` or JS is off.
- Build the **"All downloads" panel**: per-OS groups with file type, size, version, and the macOS arm64/Intel choice; each row links the resolved asset, with the Releases page as the row-level fallback.
- Build the **per-OS install steps** (tabbed), including the **one-time-warning workaround** for the unsigned path (macOS right-click→Open; Windows "More info → Run anyway"; Linux `chmod +x`/`sudo apt install ./…`) — copy mirrors Distribution plan §1 Path A and is removed/adjusted once signing (Distribution Phase 43) ships.
- Show a friendly **error/empty state** when resolution fails: "Couldn't reach GitHub — see all releases" linking the fallback. All copy from `content/copy.ts`.
- Add `data-testid`s for Playwright (mirroring the app's e2e conventions).

**Exit criteria:**

- With fixture release data injected, the hero button points at the correct asset for a simulated macOS / Windows / Linux visitor, and the all-platforms panel lists all five artifacts with sizes.
- With resolution forced to fail, the button and rows fall back to the Releases page and a clear message — no broken link, no thrown error.
- The page is usable with JavaScript disabled (all-platforms panel + Releases link reachable); interactive elements are keyboard-accessible.
- Playwright covers: detected-OS primary button, all-platforms listing, and the fallback state.

---

### Phase 49 — Product Messaging & Marketing UI

**Goal:** a clean, modern, trustworthy page that earns the click — built for a non-technical reader.

**Tasks:**

- Implement the §4 sections: Hero, Why GitWarden, Features, Screenshots, FAQ, Footer — all copy from `content/copy.ts`, all benefit-led and jargon-light (source the "Why" + value prop from `README.md`).
- Design system with Tailwind: type scale, spacing, color tokens, **light/dark mode**, responsive (mobile-first) layout, and a cohesive, modern aesthetic (per the project's UI bar — "beautiful and modern UI, best UX").
- Add real product screenshots/GIFs of the app shell (light + dark), lazy-loaded and `alt`-described; placeholders are acceptable until captures exist, tracked as a follow-up.
- FAQ explicitly answers the non-technical anxieties: _Is it safe? Why does my computer warn me? Is it free? Which file do I download?_ (the last cross-links the Phase 48 panel).
- Footer: GitHub repo, license, `SECURITY.md`, docs, and a live version badge sourced from the resolved release.

**Exit criteria:**

- The full page renders responsively at mobile/tablet/desktop widths in both light and dark mode with no layout breakage.
- All copy comes from the single content module; no hardcoded strings in components.
- Screenshots (or tracked placeholders) render with `alt` text; the page reads clearly to a non-technical visitor (no unexplained git/CLI jargon in the primary path).

---

### Phase 50 — SEO, Accessibility, Analytics & Performance

**Goal:** the site is discoverable, inclusive, measurable, and fast.

**Tasks:**

- **SEO:** per-page `<title>`/meta description, Open Graph + Twitter cards with a branded preview image, canonical URL, `sitemap.xml`, `robots.txt`, and `SoftwareApplication`/`WebSite` JSON-LD structured data.
- **Accessibility:** semantic landmarks, focus-visible states, color-contrast AA, labeled controls, `prefers-reduced-motion` respected, skip-to-content link; verify with an automated a11y pass (e.g. axe) in Playwright.
- **Analytics (privacy-respecting):** a lightweight, cookieless analytics option (e.g. Plausible/Umami or Vercel Analytics) behind a documented env toggle; **no PII, no invasive tracking**; default-off if not configured.
- **Performance:** optimize images (`next/image`), font loading, and bundle size; target Lighthouse ≥ 95 Performance/Best-Practices/SEO/Accessibility and healthy Core Web Vitals on a mid-tier mobile profile.
- Optional thin pages from §4 (`/download`, `/changelog`) if cheap.

**Exit criteria:**

- Lighthouse (mobile) ≥ 95 on Performance, Accessibility, Best Practices, SEO on the home route.
- Automated a11y scan reports no critical violations; keyboard-only walkthrough reaches every interactive element including the download button and OS tabs.
- OG/Twitter preview renders correctly (validated); `sitemap.xml` + `robots.txt` served; analytics is cookieless and disabled when unconfigured.

---

### Phase 51 — Deployment, CI & Release Integration

**Goal:** the site is live on a real domain and refreshes itself whenever a new GitWarden release is published.

**Tasks:**

- **Host:** deploy to **Vercel (recommended)** — push-to-deploy from `main`, preview deploys on PRs, SSG + ISR for §3 revalidation. Document the **GitHub Pages static-export alternative** (Appendix E) for a zero-cost, GitHub-only option (static export with client-side resolution + a scheduled/triggered rebuild).
- **Release-triggered refresh:** wire the Distribution release workflow (Distribution plan Phase 42) to notify the site on publish — a `repository_dispatch`/deploy-hook so the freshly published assets appear without a manual redeploy. If on pure SSG without ISR, this rebuild is what makes "latest" current; on ISR/client-fetch it's an optimization.
- **CI for the site:** a `site`-scoped GitHub Actions job — `npm ci && npm run lint && npm test && npm run build` (and the Playwright e2e where the runner allows) — gating deploys; tests stay offline (mocked API). Keep it separate from the app's release matrix.
- **Custom domain + HTTPS** (e.g. `gitwarden.app` or a Pages subdomain); set the canonical URL accordingly.
- **Wire the site into the repo docs:** update `README.md`'s Download section (Distribution Phase 45) to point at the live site; add the site to the docs index.
- Verify the live site resolves the **real** latest release end-to-end (the one thing tests can't do offline).

**Exit criteria:**

- The site is reachable at its production URL over HTTPS; pushing to `main` redeploys; PRs get preview deploys.
- Publishing a new GitHub Release causes the live download buttons to resolve to the new version (via ISR/rebuild/client-fetch) without a manual edit.
- The `site` CI job gates merges (lint + unit + build green, offline); a failing test blocks deploy.
- `README.md` links the live site; the production download buttons fetch the correct real installers per OS.

---

## 6. Testing & Verifiability

- **Offline by default.** Every unit/e2e test mocks the GitHub API with fixture JSON (Appendix D). No real network call runs in CI — mirroring the app's rule.
- **Pure resolver is the backbone.** The Phase 47 resolver is logic-first and exhaustively unit-tested (asset matching, arch selection, sidecar exclusion, fallback) before any UI consumes it.
- **Contract test.** A test pins the Appendix A asset-name patterns to the Distribution §3 templates so a rename on either side fails loudly.
- **UI e2e with injected fixtures.** Playwright drives the page with a stubbed resolver/response to assert the detected-OS button, the all-platforms panel, and the fallback state — no live GitHub dependency.
- **The live check is manual/CI-smoke at deploy.** Resolving the _real_ latest release is verified once on the deployed site (Phase 51), the single step fixtures can't cover.
- **a11y + Lighthouse are gates** (Phase 50), not afterthoughts.

---

## 7. Non-goals (for this track)

- Hosting installers anywhere other than GitHub Releases (no self-hosted CDN/object storage in the recommended cut; the resolver is written so a cloud-storage source _could_ be added later behind the same `DownloadTarget` contract).
- In-browser auto-update or update-channel UI (the app handles updates — Distribution Phase 44).
- Accounts, payments, license keys, or a download gate (GitWarden is a free desktop app).
- A full CMS/blog/docs portal (a thin optional `/changelog` is the ceiling here).
- Telemetry beyond cookieless, aggregate page analytics; no user tracking or PII.
- Localization/i18n of the marketing copy (English-only for now; copy is centralized so i18n is possible later).
- Arch detection beyond best-effort (browsers don't reliably expose CPU arch — Appendix C).

---

## Appendix A — Asset → OS/Arch Mapping (contract with Distribution §3)

The resolver matches the canonical `artifactName` templates fixed in `docs/plans/distribution-release-plan.md` §3. Patterns are anchored to the end of the asset `name`:

| Visitor OS | Arch                  | File type     | Asset name (example)        | Match pattern                 |
| ---------- | --------------------- | ------------- | --------------------------- | ----------------------------- |
| macOS      | arm64 (Apple Silicon) | `.dmg`        | `GitWarden-0.1.0-arm64.dmg` | `/^GitWarden-.+-arm64\.dmg$/` |
| macOS      | x64 (Intel)           | `.dmg`        | `GitWarden-0.1.0-x64.dmg`   | `/^GitWarden-.+-x64\.dmg$/`   |
| Windows    | x64                   | `.exe` (NSIS) | `GitWarden-Setup-0.1.0.exe` | `/^GitWarden-Setup-.+\.exe$/` |
| Linux      | x64                   | `.AppImage`   | `GitWarden-0.1.0.AppImage`  | `/^GitWarden-.+\.AppImage$/`  |
| Linux      | x64                   | `.deb`        | `gitwarden_0.1.0_amd64.deb` | `/^gitwarden_.+_amd64\.deb$/` |

**Ignored sidecars** (never offered as downloads): `latest.yml`, `latest-mac.yml`, `latest-linux.yml` (electron-updater metadata) and any `*.blockmap`. If Distribution §3 naming changes, update these patterns **and** the contract test in the same commit.

## Appendix B — "Latest" Resolution Strategies (trade-offs)

| Strategy                                      | Freshness                                  | Rate-limit exposure        | Hosting need       | Recommended?                                             |
| --------------------------------------------- | ------------------------------------------ | -------------------------- | ------------------ | -------------------------------------------------------- |
| **SSG + ISR (revalidate)**                    | Near-real-time via interval + release hook | None (server-side)         | Vercel-style ISR   | ✅ primary                                               |
| **Client-side fetch**                         | Real-time on load                          | 60/hr/IP unauth (cache it) | Any static host    | ✅ as self-healing fallback layer                        |
| **Serverless proxy (+ optional token)**       | Real-time, cached                          | Lifted via token           | A function runtime | ◻ optional, only if limits bite                          |
| **Build-time only (no ISR)**                  | Stale until next deploy                    | None                       | Any static host    | ◻ acceptable only with a release→rebuild hook (Phase 51) |
| **Stable `/releases/latest/download/<name>`** | Real-time                                  | None                       | n/a                | ✗ unusable — needs a fixed filename; ours is versioned   |

The recommended cut combines **SSG/ISR as primary** with **client-side fetch as the self-healing fallback**, and the **Releases page** as the ultimate human fallback.

## Appendix C — OS / Arch Detection Heuristics

- **OS** (reliable enough): prefer `navigator.userAgentData?.platform`, then `navigator.platform`, then parse `navigator.userAgent` → `macOS | Windows | Linux | unknown`. Detection is progressive enhancement; the all-platforms panel is always present.
- **Arch** (unreliable): browsers don't expose CPU architecture dependably. Apple Silicon vs Intel can't be detected with confidence, and modern Macs may report Intel UA strings under Rosetta. **Decision:** default the macOS primary button to **arm64** (the overwhelming majority of current Macs) and always show an explicit **"Intel Mac? Download x64"** secondary link. Never auto-pick an arch the user can't override.
- **No-JS:** when detection can't run, the hero shows a neutral "Download" that scrolls to / links the all-platforms panel.

## Appendix D — Example `releases/latest` Payload (trimmed, the resolver's input)

```jsonc
{
  "tag_name": "v0.1.0",
  "name": "GitWarden 0.1.0",
  "draft": false,
  "prerelease": false,
  "html_url": "https://github.com/shchadyloTaras/gitwarden/releases/tag/v0.1.0",
  "assets": [
    {
      "name": "GitWarden-0.1.0-arm64.dmg",
      "size": 98123456,
      "content_type": "application/x-apple-diskimage",
      "browser_download_url": "https://github.com/shchadyloTaras/gitwarden/releases/download/v0.1.0/GitWarden-0.1.0-arm64.dmg",
    },
    {
      "name": "GitWarden-0.1.0-x64.dmg",
      "size": 99123456,
      "content_type": "application/x-apple-diskimage",
      "browser_download_url": "https://github.com/.../GitWarden-0.1.0-x64.dmg",
    },
    {
      "name": "GitWarden-Setup-0.1.0.exe",
      "size": 78123456,
      "content_type": "application/octet-stream",
      "browser_download_url": "https://github.com/.../GitWarden-Setup-0.1.0.exe",
    },
    {
      "name": "GitWarden-0.1.0.AppImage",
      "size": 102123456,
      "content_type": "application/octet-stream",
      "browser_download_url": "https://github.com/.../GitWarden-0.1.0.AppImage",
    },
    {
      "name": "gitwarden_0.1.0_amd64.deb",
      "size": 70123456,
      "content_type": "application/vnd.debian.binary-package",
      "browser_download_url": "https://github.com/.../gitwarden_0.1.0_amd64.deb",
    },
    {
      "name": "latest.yml",
      "size": 412,
      "content_type": "text/yaml",
      "browser_download_url": "https://…/latest.yml",
    },
    {
      "name": "GitWarden-Setup-0.1.0.exe.blockmap",
      "size": 51234,
      "content_type": "application/octet-stream",
      "browser_download_url": "https://…/.blockmap",
    },
  ],
}
```

The two trailing entries (`latest.yml`, `*.blockmap`) must be **excluded** by the resolver (Appendix A).

## Appendix E — Deployment Options

- **Vercel (recommended):** native Next.js, push-to-deploy, PR previews, ISR for §3 revalidation, easy custom domain + HTTPS, optional Vercel Analytics. Lowest-friction for the recommended cut.
- **GitHub Pages (zero-cost, GitHub-only):** Next.js **static export** (no server) + **client-side** release resolution; "latest" stays current via client fetch and/or a scheduled (`cron`) or release-triggered Actions rebuild. Good if the project wants everything on GitHub, at the cost of ISR.
- Either way: a custom domain over HTTPS, the canonical URL set to match, and the release→site refresh hook from Phase 51.

## References

- Internal: `docs/plans/distribution-release-plan.md` (asset names §3, two-paths §1, release workflow Phase 42), `docs/plans/gitwarden-plan.md`, `README.md` ("Why" + value prop), `SECURITY.md`, `electron-builder.yml`, `docs/progress-log.md`.
- GitHub REST: `GET /repos/{owner}/{repo}/releases/latest`, release assets (`browser_download_url`), unauthenticated rate limits, `repository_dispatch`.
- Next.js: App Router, static export, ISR/`revalidate`, `next/image`, metadata/OG API.
- Web platform: `navigator.userAgentData` / `navigator.platform` (and their limits), Core Web Vitals, WCAG AA, JSON-LD `SoftwareApplication`.
