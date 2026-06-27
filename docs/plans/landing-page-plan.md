# GitWarden — Landing Page & Download Site Plan

> Give GitWarden a **public face**: a fast, professional marketing site whose hero is a single, obvious **Download** button. A non-technical visitor lands, the site detects their OS, and one click pulls the **latest** installer for their platform straight from GitHub Releases — `.dmg` for macOS, `.exe` for Windows, `.AppImage` for Linux. No git, no `npm`, no README spelunking.
>
> The site is a **consumer of releases, not a producer of binaries.** GitHub Releases (produced by the Distribution & Release track, Phases 40–45) stays the single source of truth for every artifact; this site only discovers the newest assets and links to them, always with a graceful fallback to the Releases page when the network or API is unavailable.

## 0. How to Read This Plan

This continues the main plan (`docs/plans/gitwarden-plan.md`) and — most directly — the **Distribution & Release plan** (`docs/plans/distribution-release-plan.md`), which produces the installers this site hands out. Same conventions: each phase has a **Goal**, **Tasks**, and explicit **Exit criteria**; a phase is done only when its exit criteria are green and `docs/progress-log.md` is updated; commit per phase, never push automatically.

Phase order (continues the global counter; the Distribution track ends at Phase 45):

- **Phase 46 — Site Foundations & Toolchain** (Astro + TypeScript strict + Tailwind scaffold in an isolated `landing/` workspace)
- **Phase 47 — Release Metadata & Latest-Binary Resolution** ← pure logic; matches GitHub Release assets to OS/arch, unit-tested offline
- **Phase 48 — Download Experience & OS Detection** (the smart hero button + all-platforms panel + install steps)
- **Phase 49 — Product Messaging & Marketing UI** (hero, value props, feature sections, safety story, screenshots, FAQ, footer; light/dark)
- **Phase 50 — SEO, Accessibility, Analytics & Performance** (metadata/OG, sitemap/robots, Lighthouse, a11y, Core Web Vitals)
- **Phase 51 — Deployment, CI & Release Integration** (Vercel; auto-refresh on each new release)

**Recommended cut:** ship **Phases 46–49 + 51**. That gives a real, live, attractive site whose download button resolves the latest installer for each OS and deploys automatically. **Phase 50** (SEO/a11y/perf polish) is a strict, high-value upgrade that can trail launch by a day without blocking it.

**Dependency note:** this track depends on the Distribution & Release track having produced **at least one published GitHub Release** with the canonical asset names (Distribution plan §3) so the resolver has something real to match. The site can be **built and fully tested before that** using fixture release JSON (the GitHub API is mocked in all tests — see §6); only the live download links need a real release. It is otherwise **independent of the app's feature work** and can be developed in parallel.

---

## 1. Product Direction: One Obvious Download, Zero Friction

The visitor is assumed to be **non-technical**. The site optimizes for a single outcome — _get the right installer onto this person's machine in one click_ — and treats everything else (features, screenshots, FAQ) as supporting material that earns that click.

### Primary flow (the 80% path)

```text
Visitor lands on gitwarden.vercel.app (or gitwarden.app)
  → site detects the OS from the browser          (macOS / Windows / Linux)
  → hero shows ONE primary button: "Download for <OS>"
  → click → the LATEST matching installer downloads (resolved from GitHub Releases)
  → a short, friendly "first run" note explains the one-time OS warning
     (until the Distribution track signs builds — plan §1 Path A)
```

### OS detection strategy (decided)

Three primary download targets; everything else falls back to GitHub:

| Detected OS         | Primary button                                         | Secondary link            |
| ------------------- | ------------------------------------------------------ | ------------------------- |
| **macOS**           | `GitWarden-<ver>-arm64.dmg` (Apple Silicon)            | "Intel Mac? Download x64" |
| **Windows**         | `GitWarden-Setup-<ver>.exe`                            | —                         |
| **Linux**           | `GitWarden-<ver>.AppImage`                             | ".deb (Debian/Ubuntu)"    |
| **Other / unknown** | "Find your version on GitHub →" (GitHub Releases page) | —                         |

macOS defaults to **arm64** — all Macs from 2020+ are Apple Silicon; the Intel secondary link handles the rest. No attempt to auto-detect CPU arch (unreliable in browsers — Appendix C).

### Non-negotiable principles

- **The download must never be a dead end.** If the GitHub API fails, is rate-limited, or returns no usable asset, the button degrades to the GitHub Releases "latest" page — never to an error.
- **Latest, always.** The site reflects the newest _published, non-draft, non-prerelease_ release without a manual edit (resolution strategy in §3 / Appendix B).
- **The site hosts no binaries.** Files live on GitHub Releases (Distribution plan §2). The site stores only links/metadata.
- **Honest about the unsigned warning.** Until Distribution Phase 43 signs builds, the install steps state the one-time Gatekeeper/SmartScreen workaround plainly (Distribution plan §1).
- **Accessible and fast by default.** Non-technical, possibly low-bandwidth visitors: keyboard-navigable, screen-reader-labeled, and light enough to score well on Core Web Vitals.

---

## 2. Site Rules (non-negotiable)

These are the landing-site analogues of the app's Architecture rules; they govern this track only and do not change `AGENTS.md`.

- **The site is isolated.** It lives in `landing/` with its **own `package.json`, `node_modules`, and tooling**, so the Electron app's dependency tree, lint config, and test runners are untouched.
- **No secrets in the client.** The public GitHub Releases endpoint is unauthenticated. If a build-time token is ever added (only to raise rate limits), it lives in host env vars / CI secrets — never in the bundle, never committed. `.gitignore` already excludes `.env*`.
- **Single source of truth for downloads.** GitHub Releases. The site derives links; it never duplicates version numbers or filenames by hand (they come from the API or the asset-name patterns in Appendix A).
- **Graceful degradation everywhere.** API down / rate-limited / asset missing → fall back to the Releases page and show a clear, friendly message, never a stack trace or a broken button.
- **Tests run offline.** Every test mocks the GitHub API with fixture JSON (sample payload in Appendix D). No test makes a real network call.
- **Externalize copy.** All user-facing strings live in one `src/content/copy.ts` module, so messaging is edited in one place.
- **Asset names are a shared contract.** The resolver matches the canonical `artifactName` templates fixed in Distribution plan §3 (Appendix A). If those names change, the resolver's patterns change in lockstep — and a test asserts the contract.
- **Accessibility is a gate, not a nicety.** Interactive elements are keyboard-reachable and labeled; the download button works without JavaScript-driven OS detection (a no-JS visitor still sees the all-platforms panel). A keyboard pass plus a minimal automated axe check ship in the core cut (Phase 48); the full a11y audit is Phase 50.
- **Visual consistency with the app.** The landing page uses the same design tokens as the Electron app (`src/renderer/theme.css`) so the brand feels unified. Key values to mirror in the Tailwind theme (a `@theme` block in the global stylesheet on Tailwind v4 — the version `astro add tailwind` installs today — or `tailwind.config.*` on v3): dark background `#09090b`, surface `#18181b`, accent `#6366f1` (indigo), primary `#3b82f6` (blue), text `#f4f4f5` (dark) / `#0a0a0a` (light). Light mode mirrors the app's `data-theme='light'` palette. Do not invent a separate color system.

---

## 3. Latest-Binary Resolution (the core mechanism)

The site must turn "the newest GitHub Release" into "the exact installer URL for _this_ visitor's OS." There are two layers; the resolver (Phase 47) is pure logic shared by both.

1. **Where the truth lives.** GitHub's REST endpoint
   `GET https://api.github.com/repos/shchadyloTaras/gitwarden/releases/latest`
   returns the latest published, non-draft, non-prerelease release and its `assets[]` (each with `name`, `browser_download_url`, `size`). This is the canonical input. (Appendix D shows the trimmed shape the resolver consumes.)
   When **no** published release exists yet (only drafts/prereleases, or none at all), this endpoint returns **404** — the fetch wrapper treats that exactly like any other failure and the page degrades to the Releases-page fallback. This is the expected state of the very first deploy, before `v0.1.0` is cut.

2. **How "latest" reaches the page.** Two complementary layers:
   - **Build-time fetch (primary).** Astro fetches the GitHub API in the page frontmatter during `astro build`, embeds the resolved URLs into the static HTML. Vercel rebuilds on every push to `main`; a **Vercel deploy hook** — fired by the Distribution release workflow (Phase 42, wired in Phase 51) — triggers an immediate rebuild on each new release.
   - **Client-side fetch (self-healing fallback).** A small client-side Astro island re-fetches on load and updates the button URL if the build-time data is stale (e.g. a release published between deploys). Falls back to the Releases page on any network error. The unauthenticated 60 req/hr/IP limit is fine for a landing page. (`api.github.com` sends permissive CORS headers, so the browser fetch is allowed; the 60/hr cap is per client IP, so a shared NAT just reaches the Releases-page fallback sooner — never an error.)

3. **How an asset maps to a visitor.** The pure resolver takes `(assets, detectedOS)` and returns the best `DownloadTarget` per platform using the Appendix A patterns, ignoring auto-update sidecars (`latest*.yml`, `*.blockmap`). It always also returns the full per-OS list (for the "All downloads" panel) and the Releases-page fallback URL.

---

## 4. Information Architecture & Content

A single long-scroll page — enough to sell and to instruct, never a sprawling site.

| Section           | Purpose                                                                   | Notes                                                                                        |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Hero**          | One-line value prop + the smart Download button + OS-detected label       | Above the fold; version + "What's new" link beside the button                                |
| **All downloads** | Every artifact, grouped by OS, with type/size/version                     | macOS arm64 primary + x64 link; Linux AppImage primary + `.deb` link; Releases-page fallback |
| **Install steps** | Per-OS, friendly, with the one-time-warning workaround                    | Tabbed by OS; mirrors Distribution §1 Path A copy                                            |
| **Why GitWarden** | The multi-account safety story (from README "Why")                        | Plain language; the "wrong account" pain                                                     |
| **Features**      | Profiles, pre-commit/pre-push safety, GitHub connect, AI assists          | Short, benefit-led; screenshots/GIFs                                                         |
| **Screenshots**   | Show the actual app shell                                                 | Light/dark; lazy-loaded                                                                      |
| **FAQ**           | "Is it safe?", "Why the warning?", "Is it free?", "Which file do I pick?" | Addresses non-technical anxieties + the unsigned note                                        |
| **Footer**        | Repo, license, docs, security, version badge                              | Links to GitHub, `SECURITY.md`, releases                                                     |

---

## 5. Phases

### Phase 46 — Site Foundations & Toolchain

**Goal:** an isolated, runnable site project that builds clean and renders a placeholder home page.

**Tasks:**

- Scaffold a NEW, self-contained npm project under `landing/` (its own `package.json` + lockfile + `node_modules`): **Astro + TypeScript (strict) + Tailwind CSS**. Keep it fully separate from the Electron app's tooling.
- Structure:
  ```
  landing/
    src/
      pages/       ← Astro file-based routing; index.astro = home
      components/  ← .astro components (+ React islands via @astrojs/react if needed)
      content/     ← copy.ts (all user-facing strings)
      lib/         ← pure logic (resolver lands here in Phase 47)
    public/        ← static assets (favicon, OG image)
    astro.config.mjs
    tailwind.config.mjs   ← Tailwind v3 only; v4 (current) configures via @theme in CSS — no JS config file
    tsconfig.json
    package.json
  ```
- Scripts in `landing/package.json`: `dev` (`astro dev`), `build` (`astro build`), `preview` (`astro preview`), `check` (`astro check`, the `.astro` typecheck), `lint`, `test` (Vitest for `src/lib/`).
- The `minimal` template ships none of the lint/test tooling — add it explicitly: ESLint (`eslint-plugin-astro` + `astro-eslint-parser`), Prettier (`prettier-plugin-astro`), Vitest, and `@astrojs/check` for `astro check`. (Playwright is added in Phase 48, when the first e2e lands.)
- Add `src/content/copy.ts` (the single strings module) and `src/lib/config.ts` holding the repo coordinates (`owner: shchadyloTaras`, `repo: gitwarden`) and the canonical Releases URLs — the **only** place these constants live.
- Render a minimal placeholder home page (`src/pages/index.astro` — product name + tagline) so `dev`/`build` are provably green.
- Add `landing/README.md` (how to run, build, deploy to Vercel) and ensure `landing/node_modules`, `landing/dist`, `landing/.astro`, `.env*` are gitignored (add to root `.gitignore`).

**Exit criteria:**

- `npm run dev` in `landing/` serves the placeholder page; `npm run build` succeeds; `npm run lint`, `astro check` (`.astro` files), and `tsc --noEmit` (the `src/lib/` logic) are clean.
- The `landing/` project does not alter or depend on the Electron app's `package.json`/lockfile.
- Repo coordinates and copy live in single modules; no hardcoded duplication.

---

### Phase 47 — Release Metadata & Latest-Binary Resolution

**Goal:** a pure, fully unit-tested module that turns a GitHub Release payload into per-OS download targets — offline, deterministic, and fallback-safe.

**Tasks:**

- In `src/lib/`, add a **pure resolver** (no `fetch`, no framework imports) with:
  - `OS` type: `'macOS' | 'Windows' | 'Linux' | 'unknown'` and `DownloadTarget` (`os`, `arch?` (`'arm64' | 'x64' | 'amd64'`), `label`, `ext`, `url`, `sizeBytes`, `filename`).
  - `resolveTargets(release, os)` → `{ primary?: DownloadTarget; secondary?: DownloadTarget; all: Record<OS, DownloadTarget[]>; releaseUrl: string; version: string }`, matching assets via the **Appendix A** patterns and **excluding** `latest*.yml` and `*.blockmap` sidecars.
  - `primary` = the main download for the detected OS (arm64 dmg / .exe / AppImage); `secondary` = the alternative link (Intel dmg / .deb); `unknown` OS → no `primary`, always show fallback link.
- Add a thin, separately-tested **fetch wrapper** (the only impure part) around `GET /repos/{owner}/{repo}/releases/latest` that returns parsed JSON or `null` on any failure (never throws to the UI), excluding drafts and prereleases.
- Define the **graceful-fallback contract**: when `release` is `null` or yields no assets for an OS, callers get the canonical Releases-page URL instead of a broken link.
- Unit-test the resolver against **fixture release JSON** (Appendix D) covering: macOS → arm64 primary + x64 secondary; Windows → .exe primary; Linux → AppImage primary + .deb secondary; unknown OS → no primary (fallback); sidecars ignored; prerelease/draft excluded; empty asset list → fallback; `null` release (fetch failed or 404 — no release published yet) → fallback.

**Exit criteria:**

- The resolver is pure (no network/framework imports) and `tsc --noEmit` clean.
- Vitest covers the full matrix above against fixtures, **with no real network call**; the asset-name contract (Appendix A) is asserted by test.
- Every code path yields either a valid versioned `browser_download_url` or the Releases-page fallback — never `undefined`/throw to the UI.

---

### Phase 48 — Download Experience & OS Detection

**Goal:** the visitor sees one obvious, correct button — and a complete, honest set of alternatives.

**Tasks:**

- Add OS detection (`src/lib/detectOs.ts`, pure given a UA/platform input): map `navigator.userAgentData?.platform` → `navigator.platform` → `userAgent` to `macOS | Windows | Linux | unknown`; document the arch limitation (Appendix C). Detection is **progressive enhancement** — the page is correct without it.
- Build the **smart hero download button**: "Download for macOS" / "Download for Windows" / "Download for Linux" wired to the Phase 47 `primary` target; shows version; falls back to "Find your version on GitHub →" (Releases page) when OS is `unknown` or JS is off.
- Show the **secondary link** under the primary button where applicable: "Intel Mac? Download x64" for macOS, ".deb (Debian/Ubuntu)" for Linux.
- Build the **"All downloads" panel**: per-OS groups listing all artifacts with file type, size, version; every row links the resolved asset with the Releases page as the row-level fallback.
- Build the **per-OS install steps** (tabbed), including the **one-time-warning workaround** for the unsigned path: macOS right-click→Open; Windows "More info → Run anyway"; Linux `chmod +x`; Linux deb `sudo apt install ./…` — copy mirrors Distribution plan §1 Path A and is easy to remove once signing (Distribution Phase 43) ships.
- Show a friendly **error/empty state** when resolution fails: "Couldn't reach GitHub — see all releases →" linking the fallback. In this degraded state, hide the version label (there is no resolved version to show). All copy from `src/content/copy.ts`. Add `data-testid`s.

**Exit criteria:**

- With fixture release data injected: macOS visitor sees arm64.dmg primary + x64 secondary; Windows sees .exe; Linux sees AppImage + .deb secondary; unknown OS sees only the GitHub Releases fallback link.
- With resolution forced to fail: button falls back to the Releases page with a clear message — no broken link, no thrown error.
- The page is usable with JavaScript disabled (all-platforms panel + Releases link reachable); interactive elements are keyboard-accessible; a minimal automated axe check (the core-cut a11y gate) passes on the home route.
- Vitest covers the resolver logic; any Playwright test covers the hero button + fallback state.

---

### Phase 49 — Product Messaging & Marketing UI

**Goal:** a clean, modern, trustworthy page that earns the click — built for a non-technical reader.

**Tasks:**

- Implement the §4 sections: Hero, Why GitWarden, Features, Screenshots, FAQ, Footer — all copy from `src/content/copy.ts`, all benefit-led and jargon-light (source the "Why" + value prop from `README.md`).
- Design system with Tailwind: wire the app's design tokens (`src/renderer/theme.css`) into the Tailwind theme (a `@theme` block in the global CSS on Tailwind v4, or `tailwind.config.*` on v3) as named colors — `gw-bg`, `gw-accent`, `gw-primary`, etc. — so the landing page shares the same palette. Dark-first (matches the app's default); light mode mirrors `data-theme='light'`. Type scale, spacing, responsive (mobile-first) layout, and cohesive modern aesthetic consistent with the Electron app's UI.
- Add real product screenshots/GIFs of the app shell (light + dark), lazy-loaded and `alt`-described. _(Done: real captures — dark Status, light Repositories — live in `landing/src/assets/screenshots/`, optimized at build via `astro:assets` `<Image>`. The earlier hand-drawn SVG placeholders were removed.)_
- FAQ explicitly answers non-technical anxieties: _Is it safe? Why does my computer warn me? Is it free? Which file do I download?_ (the last cross-links the all-downloads panel).
- Footer: GitHub repo, license, `SECURITY.md`, docs, and a live version badge sourced from the resolved release.

**Exit criteria:**

- The full page renders responsively at mobile/tablet/desktop widths in both light and dark mode with no layout breakage.
- All copy comes from the single content module; no hardcoded strings in components.
- Screenshots render with `alt` text; the page reads clearly to a non-technical visitor (no unexplained git/CLI jargon in the primary path).

---

### Phase 50 — SEO, Accessibility, Analytics & Performance

**Goal:** the site is discoverable, inclusive, measurable, and fast.

**Tasks:**

- **SEO:** per-page `<title>`/meta description, Open Graph + Twitter cards with a branded preview image (a design asset — track as a follow-up if not ready, like screenshots), canonical URL, `sitemap.xml`, `robots.txt`, and `SoftwareApplication`/`WebSite` JSON-LD structured data (the community `astro-seo` `<SEO>` component or manual `<head>` tags).
- **Accessibility:** semantic landmarks, focus-visible states, color-contrast AA, labeled controls, `prefers-reduced-motion` respected, skip-to-content link; verify with an automated a11y pass (e.g. axe) in Playwright.
- **Analytics (privacy-respecting):** a lightweight, cookieless option (Plausible/Umami or Vercel Analytics) behind a documented env toggle; **no PII, no invasive tracking**; default-off if not configured.
- **Performance:** optimize images (Astro `<Image />`), font loading, and bundle size; target Lighthouse ≥ 95 Performance/Best-Practices/SEO/Accessibility on a mid-tier mobile profile.
- Optional thin pages: `/changelog` (renders `CHANGELOG.md` or release notes).

**Exit criteria:**

- Lighthouse (mobile) ≥ 95 on Performance, Accessibility, Best Practices, SEO on the home route.
- Automated a11y scan reports no critical violations; keyboard-only walkthrough reaches every interactive element including the download button and OS tabs.
- OG/Twitter preview renders correctly (validated); `sitemap.xml` + `robots.txt` served; analytics is cookieless and disabled when unconfigured.

---

### Phase 51 — Deployment, CI & Release Integration

**Goal:** the site is live on Vercel and refreshes itself whenever a new GitWarden release is published.

**Tasks:**

- **Host:** deploy to **Vercel** — connect the `landing/` folder (set Root Directory = `landing/` in Vercel project settings); push-to-deploy from `main`, PR preview deploys. Initial test URL: `gitwarden.vercel.app`.
- **Astro Vercel adapter** (optional): add `@astrojs/vercel` if server-side rendering is needed; otherwise use static output (`output: 'static'`) — simpler and fully sufficient for this site.
- **Release-triggered rebuild:** wire the Distribution release workflow (`distribution-release-plan.md` Phase 42) to trigger a Vercel deploy hook on publish — so freshly released assets appear without a manual redeploy.
- **Site CI:** a `landing/`-scoped GitHub Actions job — `npm ci && npm run lint && npm test && npm run build` — gating deploys; tests stay **offline** (mocked API); keep it separate from the app's release matrix.
- **Custom domain + HTTPS** (e.g. `gitwarden.app`) when ready; set the canonical URL in `astro.config.mjs` accordingly.
- **Wire into repo docs:** update `README.md`'s Download section to point at the live site; add the site to the docs index.
- Verify the **live site** resolves the **real** latest release end-to-end (the one thing tests can't do offline). This requires a published release: if `v0.1.0` hasn't been cut yet (the Distribution Phase 42 workflow has shipped but not yet been run), the live buttons correctly show the Releases-page fallback until it is — cut the first release before sign-off.

**Exit criteria:**

- The site is reachable at its Vercel URL over HTTPS; pushing to `main` redeploys; PRs get preview deploys.
- Publishing a new GitHub Release causes the live download buttons to resolve to the new version (rebuild + client-side fetch self-heal) without a manual edit.
- The `landing/` CI job gates merges (lint + unit + build green, offline); a failing test blocks deploy.
- `README.md` links the live site; the production download buttons fetch the correct real installers per OS.

---

## 6. Testing & Verifiability

- **Offline by default.** Every unit/e2e test mocks the GitHub API with fixture JSON (Appendix D). No real network call runs in CI.
- **Pure resolver is the backbone.** The Phase 47 resolver is logic-first and exhaustively unit-tested (asset matching, OS routing, sidecar exclusion, fallback) before any UI consumes it.
- **Contract test.** A test pins the Appendix A asset-name patterns to the Distribution §3 templates so a rename on either side fails loudly.
- **The live check is manual/CI-smoke at deploy.** Resolving the _real_ latest release is verified once on the deployed site (Phase 51), the single step fixtures can't cover.
- **a11y + Lighthouse are gates** (Phase 50), not afterthoughts.

---

## 7. Non-goals (for this track)

- Hosting installers anywhere other than GitHub Releases.
- In-browser auto-update or update-channel UI (the app handles updates — Distribution Phase 44).
- Accounts, payments, license keys, or a download gate.
- A full CMS/blog/docs portal (a thin optional `/changelog` is the ceiling here).
- Telemetry beyond cookieless, aggregate page analytics; no user tracking or PII.
- Localization/i18n (English-only for now; copy is centralized so i18n is possible later).
- Arch detection beyond best-effort (browsers don't reliably expose CPU arch — Appendix C).

---

## Appendix A — Asset → OS Mapping (contract with Distribution §3)

The resolver matches the canonical `artifactName` templates fixed in `docs/plans/distribution-release-plan.md` §3:

| Visitor OS | Role      | File type     | Asset name (example)        | Match pattern                 |
| ---------- | --------- | ------------- | --------------------------- | ----------------------------- |
| macOS      | primary   | `.dmg`        | `GitWarden-0.1.0-arm64.dmg` | `/^GitWarden-.+-arm64\.dmg$/` |
| macOS      | secondary | `.dmg`        | `GitWarden-0.1.0-x64.dmg`   | `/^GitWarden-.+-x64\.dmg$/`   |
| Windows    | primary   | `.exe` (NSIS) | `GitWarden-Setup-0.1.0.exe` | `/^GitWarden-Setup-.+\.exe$/` |
| Linux      | primary   | `.AppImage`   | `GitWarden-0.1.0.AppImage`  | `/^GitWarden-.+\.AppImage$/`  |
| Linux      | secondary | `.deb`        | `gitwarden_0.1.0_amd64.deb` | `/^gitwarden_.+_amd64\.deb$/` |

**Ignored sidecars:** `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and any `*.blockmap`.

## Appendix B — "Latest" Resolution Strategies

| Strategy                             | Freshness                                 | Hosting         | Used in this plan?       |
| ------------------------------------ | ----------------------------------------- | --------------- | ------------------------ |
| **Build-time fetch + redeploy hook** | Fresh on each release (rebuild triggered) | Vercel static   | ✅ primary               |
| **Client-side fetch**                | Real-time on load                         | Any static host | ✅ self-healing fallback |
| **GitHub Releases page**             | Real-time                                 | n/a             | ✅ ultimate fallback     |

The recommended cut combines **build-time fetch** (fast, no client API call) with **client-side fetch as self-healing fallback** and the **Releases page** as the ultimate human fallback.

## Appendix C — OS / Arch Detection Heuristics

- **OS** (reliable enough): prefer `navigator.userAgentData?.platform`, then `navigator.platform`, then parse `navigator.userAgent` → `macOS | Windows | Linux | unknown`. Detection is progressive enhancement; the all-platforms panel is always present.
- **Arch** (unreliable): browsers don't expose CPU architecture dependably. Apple Silicon vs Intel cannot be detected with confidence. **Decision:** default macOS primary button to **arm64** (all Macs from 2020+) and always show an explicit **"Intel Mac? Download x64"** secondary link. Never auto-pick an arch the user can't override.
- **No-JS:** hero shows "Find your version on GitHub →" linking the Releases page; the all-platforms panel is always present.

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
      "browser_download_url": "https://github.com/shchadyloTaras/gitwarden/releases/download/v0.1.0/GitWarden-0.1.0-arm64.dmg",
    },
    {
      "name": "GitWarden-0.1.0-x64.dmg",
      "size": 99123456,
      "browser_download_url": "https://github.com/.../GitWarden-0.1.0-x64.dmg",
    },
    {
      "name": "GitWarden-Setup-0.1.0.exe",
      "size": 78123456,
      "browser_download_url": "https://github.com/.../GitWarden-Setup-0.1.0.exe",
    },
    {
      "name": "GitWarden-0.1.0.AppImage",
      "size": 102123456,
      "browser_download_url": "https://github.com/.../GitWarden-0.1.0.AppImage",
    },
    {
      "name": "gitwarden_0.1.0_amd64.deb",
      "size": 70123456,
      "browser_download_url": "https://github.com/.../gitwarden_0.1.0_amd64.deb",
    },
    { "name": "latest.yml", "size": 412, "browser_download_url": "https://…/latest.yml" },
    {
      "name": "GitWarden-Setup-0.1.0.exe.blockmap",
      "size": 51234,
      "browser_download_url": "https://…/.blockmap",
    },
  ],
}
```

The two trailing entries (`latest.yml`, `*.blockmap`) must be **excluded** by the resolver.

## References

- Internal: `docs/plans/distribution-release-plan.md` (asset names §3, two-paths §1, release workflow Phase 42), `docs/plans/gitwarden-plan.md`, `README.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/progress-log.md`.
- Astro: file-based routing, Astro islands, `astro build`, `@astrojs/vercel`, `@astrojs/tailwind`, `<Image />`.
- Vercel: static hosting, deploy hooks, PR previews, Root Directory setting.
- GitHub REST: `GET /repos/{owner}/{repo}/releases/latest`, `browser_download_url`, unauthenticated rate limits.
- Web platform: `navigator.userAgentData`, Core Web Vitals, WCAG AA, JSON-LD `SoftwareApplication`.
