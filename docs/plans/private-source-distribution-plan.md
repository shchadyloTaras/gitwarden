# Plan — Private-Source Distribution: keep the app downloadable while the source goes private

**Status:** 🟡 in progress — Phases 72–74 done, 75 open — **derived view**; the authoritative
state is the Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 72 → 75.
**Feature-complete stop point:** Phase 75.
**Prompts:** [`docs/prompts/private-source-distribution-prompts.md`](../prompts/private-source-distribution-prompts.md).

## Goal

Today the source repo `shchadyloTaras/gitwarden` is **public**, and the shipped installers, the
landing page's download links, and the marketing copy all live on it (the published release is
`v0.2.0` on that repo). The maintainer wants to **(A) protect the source from copying** and **(C)
prepare to monetize** — which means the source must become **private** while end users keep a
**public** place to download the app.

This feature splits distribution into two repos: `gitwarden` becomes **private** (code, history, CI,
`landing/` source) and `gitwarden-releases` becomes the **public storefront** (installers + a
README + a proprietary LICENSE + SECURITY.md — **no source**). CI keeps running in the private repo
but publishes installers **cross-repo** to the public one; the landing page fetches downloads from
the public storefront; the "open source / MIT / free" claims are removed. The private-flip is the
**last** step, after a public download has been verified end-to-end, so there is **zero public
download downtime**.

**Product boundary (decided — "repo split only; deeper IP protection is a separate track"):** this
feature does **repo topology + clean distribution + license/marketing realignment only**. It does
**not** obfuscate the shipped JavaScript and does **not** add server-side licensing. Two facts are
accepted up front: (1) a private repo does **not** hide the code inside a shipped Electron app — the
`asar` archive is trivially `npx asar extract`-able, so the bundled JS remains readable in every
download; (2) code already published under **MIT** stays MIT for anyone who has a copy — relicensing
is **forward-only**. Both are deliberately out of scope here and deferred to a future
**monetization-protection track** (see Non-goals).

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a claim with real
`file:line` links and the **consequence** for this feature:

1. **electron-builder publishes to the source repo.** The `publish` block is
   `provider: github`, `owner: shchadyloTaras`, `repo: gitwarden`, `releaseType: draft`
   ([electron-builder.yml:15-19](../../electron-builder.yml)). **Consequence:** `repo` must move to
   `gitwarden-releases` so the built installers land on the public storefront, not the private repo.

2. **The release workflow authenticates with the built-in `GITHUB_TOKEN`.** Both publish steps run
   `npx electron-builder --publish always` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
   ([release.yml:74-83](../../.github/workflows/release.yml) signed,
   [release.yml:85-91](../../.github/workflows/release.yml) unsigned); the workflow triggers on tag
   `v*` ([release.yml:3-7](../../.github/workflows/release.yml)) and a `refresh-landing` job curls a
   Vercel deploy hook ([release.yml:93-109](../../.github/workflows/release.yml)). **Consequence:**
   the built-in `GITHUB_TOKEN` can only write to its **own** repo. Cross-repo publishing needs a
   fine-grained PAT scoped to `gitwarden-releases`, passed as `GH_TOKEN` instead of `GITHUB_TOKEN`.
   The tag trigger and the Vercel-refresh job are unchanged.

3. **The version and repo URLs are single-sourced in `package.json`.** `version` is `0.2.0`, and
   `repository.url` / `homepage` point at `github.com/shchadyloTaras/gitwarden`; `license` is `MIT`
   (package.json `version`, `repository`, `homepage`, `license` fields). **Consequence:** the
   forward relicense flips `license` to `UNLICENSED` (npm's proprietary marker); the `repository`
   URL stays the (now-private) source repo — that field feeds developer tooling, not the public
   download, so it does not need to move.

4. **The landing page derives every download + link from one config module.**
   [config.ts:10-11](../../landing/src/lib/config.ts) defines `OWNER`/`REPO`; `REPO_URL`
   ([config.ts:14](../../landing/src/lib/config.ts)), `RELEASES_URL`
   ([config.ts:20](../../landing/src/lib/config.ts)), `LATEST_RELEASE_URL`
   ([config.ts:23](../../landing/src/lib/config.ts)), `RELEASES_API_URL`
   ([config.ts:29](../../landing/src/lib/config.ts)), `SECURITY_URL`
   ([config.ts:32](../../landing/src/lib/config.ts)), and `LICENSE_URL`
   ([config.ts:33](../../landing/src/lib/config.ts)) are all built from `OWNER`/`REPO`.
   **Consequence:** repointing the download/release/security/license links to the storefront is
   mostly a change to these constants — but `REPO_URL` is also the "view source" target (finding 6),
   so it needs splitting, not just flipping.

5. **The release fetch reads `RELEASES_API_URL` and degrades to `null` on 404.**
   `fetchLatestRelease` calls `RELEASES_API_URL` and returns `null` on any non-2xx (explicitly
   including "404 when no release is published yet") ([fetchRelease.ts:48-58](../../landing/src/lib/fetchRelease.ts)).
   **Consequence:** the moment `gitwarden` goes private, the current `.../gitwarden/releases/latest`
   call 404s and the site silently loses its download buttons — which is exactly why the storefront
   must carry a published `v0.2.0` and the config must be repointed **before** the private-flip.

6. **The landing exposes "view source" links that must disappear.** The header renders a `GitHub`
   nav link to `REPO_URL` ([Header.astro:14](../../landing/src/components/Header.astro), importing
   `REPO_URL` at [Header.astro:3](../../landing/src/components/Header.astro)); the footer links
   `github`/`releases`/`security`/`license` ([Footer.astro:19-22](../../landing/src/components/Footer.astro)).
   The labels/claims live in copy: `nav.github: 'GitHub'` ([copy.ts:82](../../landing/src/content/copy.ts)),
   `footer.links.github: 'GitHub repository'` ([copy.ts:177](../../landing/src/content/copy.ts)).
   **Consequence:** remove the header "GitHub" link and the footer "GitHub repository" link
   entirely; repoint "Releases"/"Security"/"License" at the storefront.

7. **The marketing copy advertises the product as open source and free.** The FAQ says "GitWarden is
   open source under the MIT license" ([copy.ts:152](../../landing/src/content/copy.ts)) and "free
   and open source — no accounts, no payment, no license keys"
   ([copy.ts:160](../../landing/src/content/copy.ts)); the footer says "Open source under the MIT
   license." ([copy.ts:174](../../landing/src/content/copy.ts)). **Consequence:** these three claims
   contradict goals (A)+(C) and must be reworded (drop "open source"/"MIT"; soften the "free"
   framing without committing to pricing yet).

8. **Root `LICENSE` is MIT.** The repo root ships the MIT text ([LICENSE:1-3](../../LICENSE)).
   **Consequence:** the forward relicense replaces this with a proprietary/all-rights-reserved
   placeholder in the private repo; the public storefront gets its own proprietary
   EULA/terms file. Neither undoes the MIT grant on already-published code (accepted).

9. **The landing tests assert repo-specific URLs.** `resolveTargets.test.ts` asserts a download URL
   of `github.com/shchadyloTaras/gitwarden/releases/download/...`
   ([resolveTargets.test.ts:51-53](../../landing/src/lib/resolveTargets.test.ts)) and
   `fetchRelease.test.ts` asserts the call hits `RELEASES_API_URL`
   ([fetchRelease.test.ts:23-26](../../landing/src/lib/fetchRelease.test.ts)). **Consequence:**
   Phase 74's config change is a real, test-gated code change — these specs (and any snapshot of the
   footer/header links) update with it, giving this phase a normal green-test exit.

10. **The app itself has no real "view source" link.** The only reference to the repo URL in
    application source is a **test fake**
    ([updateFakes.ts:22](../../src/main/testing/updateFakes.ts)). **Consequence:** nothing
    user-facing inside the desktop app needs changing; the update **notifier** (Phase 44 partial)
    reads its feed from the electron-builder `publish` config (finding 1), which the storefront move
    already covers.

11. **The presentation was moved off the source repo (Pages consequence resolved).** `gitwarden`
    previously served a GitHub Pages presentation from a `presentation` branch; as of **2026-07-02**
    the deck was moved to its own public repo **`gitwarden-presentation`** (Pages at
    `https://shchadylotaras.github.io/gitwarden-presentation/`, built from `main`), and `gitwarden`
    **no longer serves Pages** (the Pages API returns 404; only `main` remains). **Consequence:** the
    private-flip (Phase 75) takes **no** Pages site offline — this former blocker is cleared.

## Scope

- **In:**
  - Make `gitwarden-releases` a public **storefront** repo: README, a proprietary LICENSE/EULA
    (placeholder), SECURITY.md — **no source**.
  - Migrate `v0.2.0` by **copying** the already-built installers into a new `v0.2.0` release on the
    storefront (same version, new URL).
  - Cross-repo CI publishing: a fine-grained PAT scoped to `gitwarden-releases`, stored as a secret;
    `electron-builder.yml` `publish.repo` → `gitwarden-releases`; `release.yml` `GH_TOKEN` → the PAT.
    Releases stay `draft` (human publishes).
  - Landing repoint (download/releases/security/license → storefront), removal of the "view source"
    links, and license/marketing realignment (drop "open source"/"MIT"/"free" claims).
  - Forward relicense of the private repo (root `LICENSE` → proprietary placeholder;
    `package.json` `license` → `UNLICENSED`).
  - Make `gitwarden` **private** — as the **last** step, after an end-to-end public-download check.
- **Out / Non-goals:**
  - **No source obfuscation/minification of the shipped Electron JS** — deferred to the
    monetization-protection track (the `asar` remains extractable; a private repo does not hide it).
  - **No server-side licensing / paywall / feature-gating** — deferred to the same future track;
    this feature adds no backend and no client license check.
  - **No pricing model or pricing copy** — the "free" claim is only softened, not replaced with a
    price.
  - **No signing/notarization changes** (that is the still-open Phase 43); the storefront ships the
    same unsigned installers, and the existing signed/unsigned CI branches are preserved verbatim.
  - **No auto-update behavior change** — the update notifier keeps reading the electron-builder
    feed, which now points at the (public) storefront; the deferred in-app installer (Phase 44)
    is unaffected.
  - **No retroactive relicensing** of already-published MIT code (impossible; accepted).
  - **No deletion of git history** to scrub past public exposure (accepted; 0 forks / 0 stars means
    low practical exposure).

## Cutover order (the safety property this plan enforces)

The phases are ordered so the **public-flip of the source repo is the very last action**, and a
public download is proven to work **before** it. Any reordering that privatizes `gitwarden` before
the storefront + landing are live would break public downloads — do not do it.

1. Storefront exists (README/LICENSE/SECURITY) — **Phase 72**
2. `v0.2.0` installers live on the storefront — **Phase 72**
3. PAT + CI rewired to publish cross-repo — **Phase 73**
4. Landing repointed + redeployed; source links removed; license/marketing realigned — **Phase 74**
5. **Verify** public download end-to-end (site → storefront → file downloads) — **Phase 75**
6. **Only then** flip `gitwarden` to private (after resolving the Pages/presentation question) — **Phase 75**
7. (Optional) test release to confirm cross-repo publish post-privatization — **Phase 75**

---

## Phase 72 — Public storefront + v0.2.0 migration (ops + docs)

**Goal:** `gitwarden-releases` is a credible public "home" for the product — README, a proprietary
LICENSE/EULA, SECURITY.md — and it hosts a published `v0.2.0` whose installers download for the
public. No source, no CI, no landing change yet.

**Implementation:**

- Author the storefront's public docs (committed to `gitwarden-releases`, **not** the private repo):
  - `README.md` — product blurb + "Download the latest release" pointer + install notes (adapt from
    the root [README.md](../../README.md), stripping any "clone/build from source" instructions).
  - `LICENSE` — a **proprietary/all-rights-reserved EULA placeholder** for the downloadable binaries
    (explicitly not MIT). Placeholder text now; a standard EULA template or lawyer review later (see
    Open questions).
  - `SECURITY.md` — a public-facing copy of the root [SECURITY.md](../../SECURITY.md) (the app's
    security posture stays publicly documented even with the source private).
- Migrate `v0.2.0` by **copying the existing built assets** from the current `gitwarden` release to a
  new `v0.2.0` release on `gitwarden-releases` (same version, new URL). A small maintainer-run script
  under `scripts/` (e.g. `scripts/migrate-release.sh`) may wrap `gh release download <tag> -R
  shchadyloTaras/gitwarden` → `gh release create <tag> -R shchadyloTaras/gitwarden-releases <files>`
  so the step is repeatable and auditable. Draft releases `v0.1.0`/`v0.1.1` are **not** migrated
  (they stay private).

**Manual (maintainer) steps (not code):** run the migration script (uses the maintainer's own `gh`
auth); publish the storefront `v0.2.0` release (or leave as draft and publish after the end-to-end
check in Phase 75 — decide at kickoff).

**Exit criteria (verification, not unit tests):**

- `gitwarden-releases` has `README.md`, a proprietary `LICENSE` (not MIT), and `SECURITY.md`.
- A `v0.2.0` release exists on `gitwarden-releases` carrying the same 5 installers
  (`GitWarden-0.2.0-arm64.dmg`, `-x64.dmg`, `GitWarden-Setup-0.2.0.exe`, `GitWarden-0.2.0.AppImage`,
  `gitwarden_0.2.0_amd64.deb`).
- Each asset's `browser_download_url` returns HTTP 200 (e.g. `curl -I`) for an unauthenticated
  request.
- No source files are present in `gitwarden-releases`.

**Files:** none in this repo except an optional `scripts/migrate-release.sh`. The README/LICENSE/
SECURITY live in the **`gitwarden-releases`** repo (out-of-tree), so this phase produces mostly
maintainer actions + one optional helper script.

---

## Phase 73 — Cross-repo publish automation (CI config + ops)

**Goal:** the release workflow builds in the private repo and publishes installers to the **public**
storefront, using a narrowly-scoped token, with releases still landing as **drafts** for human
publish. Honors AGENTS.md rule #5 (never log secrets).

**Implementation:**

- Point electron-builder at the storefront: in [electron-builder.yml:15-19](../../electron-builder.yml)
  change `repo: gitwarden` → `repo: gitwarden-releases` (keep `owner`, `provider`, `releaseType:
  draft`).
- Rewire the workflow token: in [release.yml:74-91](../../.github/workflows/release.yml) change both
  publish steps' `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` → `GH_TOKEN: ${{
  secrets.RELEASES_REPO_TOKEN }}` (a new secret name). Leave the guard job, the signing detection,
  the matrix, the `contents: write` permission, and the `refresh-landing` job unchanged.
- Document the token in `SECURITY.md` (root) / the release docs: a **fine-grained PAT**, resource
  owner `shchadyloTaras`, **repository access limited to `gitwarden-releases` only**, permission
  **Contents: Read and write**, ~1-year expiry with a renewal note.

**Manual (maintainer) steps (not code):** create the fine-grained PAT in GitHub settings; add it as
the `RELEASES_REPO_TOKEN` **secret** on the `gitwarden` repo. (The agent never sees or commits the
token value.)

**Exit criteria (verification, not unit tests):**

- Config review: `electron-builder.yml` targets `gitwarden-releases`; `release.yml` uses
  `RELEASES_REPO_TOKEN` in both publish steps; no token value is present anywhere in the repo.
- Cross-repo publish proven **once**, cheaply: a single-OS local `npx electron-builder --publish
  always` (with `GH_TOKEN=<PAT>` in the maintainer's shell) creates a **draft** release/asset on
  `gitwarden-releases` — **not** on `gitwarden` — then the throwaway draft/asset is deleted. (A full
  `v*` test tag is the alternative but costs the whole ~150–220-min matrix; prefer the local check.)
- `npm run lint` clean (YAML/format) for the touched config files.

**Files:** edit [electron-builder.yml](../../electron-builder.yml),
[.github/workflows/release.yml](../../.github/workflows/release.yml); optional docs edit to
[SECURITY.md](../../SECURITY.md) / release docs describing the token.

---

## Phase 74 — Landing repoint + license/marketing realignment (renderer + tests)

**Goal:** the public landing page resolves all downloads/links from the **storefront**, shows **no
"view source" links**, and no longer claims "open source / MIT / free" — with the change gated by the
landing's own green Vitest + Playwright suites. This is the one phase with a normal test gate.

**Implementation:**

- Split the config so "downloads" and "source" are decoupled
  ([config.ts:10-33](../../landing/src/lib/config.ts)): introduce a storefront coordinate
  (`RELEASES_OWNER`/`RELEASES_REPO = 'gitwarden-releases'`) and derive `RELEASES_URL`,
  `LATEST_RELEASE_URL`, `RELEASES_API_URL`, `SECURITY_URL`, `LICENSE_URL` from it. Remove `REPO_URL`
  (the "view source" constant) rather than repoint it.
- Remove the header "GitHub" link ([Header.astro:3,14](../../landing/src/components/Header.astro))
  and the footer "GitHub repository" link
  ([Footer.astro:19](../../landing/src/components/Footer.astro)); keep Releases/Security/License
  (now storefront-based). Drop the now-unused `nav.github`
  ([copy.ts:82](../../landing/src/content/copy.ts)) and `footer.links.github`
  ([copy.ts:177](../../landing/src/content/copy.ts)) copy keys.
- Reword the claims in [copy.ts](../../landing/src/content/copy.ts): the FAQ "safe" answer
  ([copy.ts:152](../../landing/src/content/copy.ts)) drops "open source under the MIT license"
  (keep the "only changes local Git settings / no telemetry" substance); the FAQ "free" answer
  ([copy.ts:160](../../landing/src/content/copy.ts)) drops "open source" and softens the framing
  (no pricing commitment); the footer license line
  ([copy.ts:174](../../landing/src/content/copy.ts)) stops saying "Open source under the MIT
  license."
- Forward relicense the private repo: replace root [LICENSE](../../LICENSE) with a proprietary/all-
  rights-reserved placeholder and set `package.json` `license` → `UNLICENSED`.
- Update the landing tests to the new coordinates/links:
  [fetchRelease.test.ts:23-26](../../landing/src/lib/fetchRelease.test.ts) (new `RELEASES_API_URL`),
  [resolveTargets.test.ts:51-53](../../landing/src/lib/resolveTargets.test.ts) (new download host),
  and any footer/header link assertions or Playwright checks that referenced the removed "GitHub"
  link.

**Manual (maintainer) steps (not code):** after merge, trigger the Vercel deploy (the existing hook,
or a push) so the live site reflects the new links.

**Exit criteria:**

- `landing` Vitest green (`landing/ npm test`) with the updated URL/link assertions.
- `landing` Playwright e2e green (`landing/ npm run e2e`, offline) — the download buttons resolve to
  `gitwarden-releases`, no "GitHub / view source" link renders, and the "open source / MIT" strings
  are gone.
- `landing` lint + type-check clean (`npm run lint`, `npm run check`, `npm run typecheck`).
- Root repo: `LICENSE` is proprietary; `package.json` `license` is `UNLICENSED`; root `npm run lint`
  clean.

**Files:** edit [landing/src/lib/config.ts](../../landing/src/lib/config.ts),
[landing/src/components/Header.astro](../../landing/src/components/Header.astro),
[landing/src/components/Footer.astro](../../landing/src/components/Footer.astro),
[landing/src/content/copy.ts](../../landing/src/content/copy.ts),
[landing/src/lib/fetchRelease.test.ts](../../landing/src/lib/fetchRelease.test.ts),
[landing/src/lib/resolveTargets.test.ts](../../landing/src/lib/resolveTargets.test.ts),
[LICENSE](../../LICENSE), [package.json](../../package.json); plus any landing e2e spec asserting
the header/footer links.

---

## Phase 75 — Privatization + end-to-end verification (ops, private-flip last)

**Goal:** with the storefront live, CI rewired, and the landing repointed + deployed, prove the
public download works end-to-end, resolve the GitHub Pages consequence, then make `gitwarden`
private — the final, irreversible-in-effect step.

**Implementation / sequence (order matters):**

- **Verify first (while `gitwarden` is still public):** on the live site, the download button
  resolves to a `gitwarden-releases` asset and the file actually downloads; the footer
  Releases/Security/License links open the storefront; no "view source" link is present.
- **Pages/presentation prerequisite — already done (2026-07-02):** the deck now lives in the public
  `gitwarden-presentation` repo (`shchadylotaras.github.io/gitwarden-presentation/`) and `gitwarden`
  no longer serves Pages, so the flip affects no Pages site. No action needed here — just re-confirm
  the new URL is live before flipping.
- **Flip `gitwarden` to private** (maintainer action in GitHub settings).
- **Post-flip checks:** the public site still downloads (storefront is public and untouched); Vercel
  still builds and deploys the (now-private-source) `landing/` — confirm the Vercel↔GitHub
  integration remains authorized; the old `.../gitwarden/releases/...` URLs now 404 for the public
  (expected).
- **(Optional) confirm cross-repo publish post-privatization:** push a throwaway `v*` test tag (or
  `workflow_dispatch`) and confirm the workflow publishes a **draft** to `gitwarden-releases` using
  `RELEASES_REPO_TOKEN`; delete the throwaway release. (Costs the full matrix — optional.)

**Manual (maintainer) steps (not code):** the end-to-end download check; the visibility flip; the
Vercel re-check; the optional test release. (The Pages/presentation migration is **already done** —
see the prerequisite above.) This phase is almost entirely maintainer actions with verification —
there is little or no code to write.

**Exit criteria (verification):**

- Before the flip: a real browser download from the live site succeeds via a `gitwarden-releases`
  asset URL.
- After the flip: `gitwarden` is private; the public site still downloads; Vercel still deploys;
  `gitwarden/releases` is not publicly reachable.
- The presentation site is served from its new public home (`gitwarden-presentation`) — done.
- (If run) a test tag publishes a draft to `gitwarden-releases`, not to `gitwarden`.

**Files:** none required (ops/verification). Any presentation-migration scripting, if chosen, is
out-of-tree or a small `scripts/` helper.

---

## Acceptance criteria (feature)

- The public can download GitWarden from `gitwarden-releases` (a published `v0.2.0` with all 5
  installers), and the landing page's buttons resolve there.
- `gitwarden` (source, history, `landing/`) is **private**; there was **no public download
  downtime** (the storefront + repointed site went live before the flip).
- CI in the private repo publishes installers cross-repo to the public storefront via a fine-grained
  PAT scoped to `gitwarden-releases`, releases still land as **drafts**, and the token is never
  committed or logged.
- The landing page shows **no "view source" link** and no longer claims "open source / MIT / free";
  the private repo is forward-relicensed (proprietary `LICENSE`, `package.json` `UNLICENSED`).
- The deferred realities are documented, not silently assumed away: the shipped `asar` is still
  extractable and past MIT code stays MIT (both explicitly out of scope, tracked for the future
  monetization-protection work).
- The GitHub Pages / presentation consequence of privatization is resolved (not discovered in
  production).

## Decisions (resolved)

1. **Two-repo split** — private `gitwarden` (source) + public `gitwarden-releases` (storefront). Not
   off-GitHub hosting (the site + CI + future auto-update already assume GitHub Releases).
2. **Scope is (i) repo split only.** Binary obfuscation (ii) and a server-side moat (iii) are a
   separate future track; a private repo alone is necessary-but-not-sufficient for IP protection.
3. **v0.2.0 migrated by copying** the already-built installers (same version, new URL); drafts
   0.1.x stay private.
4. **Fine-grained PAT scoped to `gitwarden-releases` only** (Contents: RW), stored as a secret
   (`RELEASES_REPO_TOKEN`); ~yearly renewal. Not a classic all-repos PAT; not a GitHub App.
5. **Minimal license/marketing realignment** — proprietary EULA placeholder on public artifacts,
   forward relicense of the private repo, drop "open source"/"MIT"/"free" claims; **defer pricing
   copy**. (Not legal advice — placeholder now, template/lawyer later.)
6. **Remove "view source" links** from the landing entirely (option a), rather than repoint them at
   the storefront.
7. **Keep the full 3-OS CI matrix** — release builds are tag-triggered and infrequent, so metered
   private-repo minutes (macOS ×10) stay within the free tier.
8. **Private-flip is the last step**, after an end-to-end public-download verification — the plan's
   central safety property.

## Open questions (resolve at kickoff)

- **GitHub Pages / presentation (finding 11) — ✅ resolved (2026-07-02).** The presentation was moved
  to the public `gitwarden-presentation` repo (Pages live at
  `shchadylotaras.github.io/gitwarden-presentation/`, built from `main`); `gitwarden` no longer
  serves Pages, so the private-flip is safe. No remaining action. (Rejected alternatives: upgrade to
  GitHub Pro for private Pages; retire the presentation URL.)
- **Publish the storefront `v0.2.0` immediately, or hold as draft** until the Phase 75 end-to-end
  check passes? Lean: publish in Phase 72 so the landing repoint (Phase 74) has a live "latest" to
  resolve against; the site stays valid throughout because `gitwarden` is still public until Phase 75.
- **EULA text source** — a standard EULA template vs a lawyer-reviewed one. Lean: placeholder now,
  upgrade before charging (part of the monetization track).
- **Delete the old public `v0.2.0` from `gitwarden`** after copying, or leave it (it becomes private
  on the flip anyway)? Lean: leave it; the flip hides it.
