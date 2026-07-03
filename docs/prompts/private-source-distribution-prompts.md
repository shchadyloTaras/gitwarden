# GitWarden — Private-Source Distribution Phase Prompts

Copy-paste prompts to drive the **Private-Source Distribution** feature (make the source repo
private while the app stays publicly downloadable from a separate storefront repo) one phase at a
time. Each prompt is self-contained, points at the plan in
`docs/plans/private-source-distribution-plan.md`, and **ends with the standard progress footer**
that records progress in `docs/progress-log.md`. Rules live in `CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (72 → 75). Don't start a phase until the previous phase's entry
in `docs/progress-log.md` shows Exit criteria ✅. This is a numbered feature: **one commit per
phase**, the progress-log entry written **before** the commit.

**⚠️ This feature is ops-heavy, not the usual code feature.** Many steps are **manual maintainer
actions** on GitHub (creating a fine-grained PAT, uploading release assets, flipping repo
visibility, publishing releases) that an agent cannot and must not perform or fake. In each phase:
do the **in-repo code/config** parts yourself, then **clearly hand the manual steps to the
maintainer** and mark the phase's exit as *pending the maintainer's action* rather than claiming it
done. Only **Phase 74** has a normal green-test gate (the `landing/` suites).

**Prerequisites / offline note:** the `landing/` tests run offline (Vitest mocks the GitHub API; the
e2e build blocks `api.github.com`). The cross-repo publish and privatization steps need the
maintainer's GitHub account and are verified against the live GitHub API, not in the offline test
suite.

**Cutover safety property (do not reorder):** the private-flip of `gitwarden` is the **last** action
(Phase 75), performed only **after** a public download is verified end-to-end. Storefront →
v0.2.0 → CI rewire → landing repoint → verify → **then** privatize.

Background facts (already verified against the tree — don't re-litigate):

- **electron-builder publishes to the source repo.** `publish` = github / owner `shchadyloTaras` /
  repo `gitwarden` / `releaseType: draft` (`electron-builder.yml:15-19`). `repo` must move to
  `gitwarden-releases`.
- **The workflow uses the built-in `GITHUB_TOKEN`.** Both publish steps pass `GH_TOKEN: ${{
  secrets.GITHUB_TOKEN }}` (`.github/workflows/release.yml:74-83,85-91`); trigger is tag `v*`
  (`:3-7`); a `refresh-landing` job curls a Vercel hook (`:93-109`). `GITHUB_TOKEN` can't write
  cross-repo → needs a fine-grained PAT scoped to `gitwarden-releases`, passed as `GH_TOKEN`.
- **The landing derives every link from one config.** `OWNER`/`REPO` (`landing/src/lib/config.ts:10-11`)
  build `REPO_URL:14`, `RELEASES_URL:20`, `LATEST_RELEASE_URL:23`, `RELEASES_API_URL:29`,
  `SECURITY_URL:32`, `LICENSE_URL:33`. `fetchLatestRelease` reads `RELEASES_API_URL` and returns
  `null` on 404 (`landing/src/lib/fetchRelease.ts:48-58`) — so it silently loses downloads the moment
  `gitwarden` goes private.
- **"View source" links + "open source" claims live in the landing.** Header "GitHub" →
  `REPO_URL` (`landing/src/components/Header.astro:3,14`); footer github/releases/security/license
  (`landing/src/components/Footer.astro:19-22`); copy claims "open source under the MIT license"
  (`landing/src/content/copy.ts:152`), "free and open source" (`:160`), footer "Open source under
  the MIT license." (`:174`); labels `nav.github` (`:82`), `footer.links.github` (`:177`).
- **Landing tests assert repo-specific URLs.** `resolveTargets.test.ts:51-53` (download host),
  `fetchRelease.test.ts:23-26` (`RELEASES_API_URL`) — Phase 74's config change is test-gated.
- **Root `LICENSE` is MIT** (`LICENSE:1-3`); `package.json` `license` is `MIT`. Forward relicense
  only (past MIT code stays MIT for anyone who copied it — accepted).
- **The app has no real "view source" link** — only a test fake (`src/main/testing/updateFakes.ts:22`).
- **Presentation Pages already moved off `gitwarden` (2026-07-02).** The deck now lives in the
  public `gitwarden-presentation` repo (`shchadylotaras.github.io/gitwarden-presentation/`, from
  `main`); `gitwarden` no longer serves Pages (API 404, only `main` left), so the private-flip
  affects no Pages site — this former blocker is cleared.

---

## 🔁 Standard progress footer (included in every prompt)

Every prompt below ends with this block. It is the mechanism that records progress:

```
When the phase's Exit criteria are met:
1. Append an entry to the "## Progress Log" section of docs/progress-log.md (newest last, do not rewrite past entries):
   ### <today's date> — Phase N: <name>
   - Built: <what was implemented>
   - Files: <files added/changed>
   - Tests: <exact vitest/playwright result, e.g. "12 passed">
   - Exit criteria: ✅ met  (or ⚠️ partial — explain what's left)
   - Notes / follow-ups: <anything worth knowing for next phase>
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md and re-derive any affected derived views (Feature Track Status row, AGENTS.md build order).
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 72 — Public storefront + v0.2.0 migration

```
Work on Phase 72 of GitWarden (docs/plans/private-source-distribution-plan.md §"Phase 72"). Ops + docs — the storefront's README/LICENSE/SECURITY live in the SEPARATE gitwarden-releases repo (out of this tree). Do NOT make gitwarden private in this phase. Do NOT touch CI, electron-builder, or the landing yet.

In-repo work you do:
- Optionally add scripts/migrate-release.sh — a repeatable, auditable helper that copies an already-built release's assets from the source repo to the storefront: `gh release download <tag> -R shchadyloTaras/gitwarden -D <tmp>` then `gh release create <tag> -R shchadyloTaras/gitwarden-releases <tmp>/* --title <tag> --notes <notes>`. It must NOT rebuild anything (same bytes). Keep it idempotent-ish (clear failure if the release already exists).
- Draft the storefront's public docs as files I can drop into gitwarden-releases (write them somewhere clearly out-of-tree, e.g. the scratchpad, and tell me the paths): README.md (product blurb + "Download the latest release" pointer + install notes adapted from the root README.md, WITH any clone/build-from-source instructions removed), a proprietary/all-rights-reserved LICENSE placeholder (explicitly NOT MIT), and a public-facing SECURITY.md copied from the root SECURITY.md.

Manual steps you HAND TO ME (do not do these yourself):
- Run scripts/migrate-release.sh v0.2.0 (uses my gh auth) to copy the 5 v0.2.0 installers into a v0.2.0 release on gitwarden-releases.
- Commit the storefront README/LICENSE/SECURITY into gitwarden-releases.
- Decide whether to publish the storefront v0.2.0 now or hold as draft until the Phase 75 end-to-end check (plan Open questions — lean: publish now).

Exit (verification, not unit tests — mark PENDING until I confirm the manual steps): gitwarden-releases has README.md + a proprietary LICENSE (not MIT) + SECURITY.md; a v0.2.0 release there carries the same 5 installers (GitWarden-0.2.0-arm64.dmg, -x64.dmg, GitWarden-Setup-0.2.0.exe, GitWarden-0.2.0.AppImage, gitwarden_0.2.0_amd64.deb); each asset's browser_download_url returns HTTP 200 unauthenticated; no source files in gitwarden-releases.

Then run the standard progress footer.
```

---

## Phase 73 — Cross-repo publish automation

```
Work on Phase 73 of GitWarden (docs/plans/private-source-distribution-plan.md §"Phase 73"). CI config + ops. Honors AGENTS.md rule #5 (never log secrets — the token value must never appear in the repo or in output).

In-repo work you do:
- electron-builder.yml:15-19 — change `repo: gitwarden` to `repo: gitwarden-releases`. Keep owner, provider: github, and releaseType: draft unchanged.
- .github/workflows/release.yml:74-91 — in BOTH publish steps (signed and unsigned), change `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` to `GH_TOKEN: ${{ secrets.RELEASES_REPO_TOKEN }}`. Leave the guard job, signing detection, the matrix, `permissions: contents: write`, and the refresh-landing job unchanged.
- Document the token in SECURITY.md (root) / release docs: a fine-grained PAT, resource owner shchadyloTaras, repository access limited to gitwarden-releases ONLY, permission Contents: Read and write, ~1-year expiry + a renewal note. Do NOT put any token value in the repo.

Manual steps you HAND TO ME (do not do these yourself):
- Create the fine-grained PAT in GitHub settings (scoped to gitwarden-releases, Contents: RW).
- Add it as the `RELEASES_REPO_TOKEN` Actions secret on the gitwarden repo.
- Prove cross-repo publish once, cheaply: run a single-OS local `GH_TOKEN=<PAT> npx electron-builder --publish always`, confirm a DRAFT release/asset appears on gitwarden-releases (NOT on gitwarden), then delete the throwaway. (A full v* test tag is the alternative but costs the whole ~150–220-min matrix — prefer the local check.)

Exit (verification — mark PENDING until I confirm the manual steps): electron-builder.yml targets gitwarden-releases; release.yml uses RELEASES_REPO_TOKEN in both publish steps; no token value anywhere in the repo; a single-OS local publish lands a draft on gitwarden-releases (not gitwarden); `npm run lint` clean for the touched config/YAML.

Then run the standard progress footer.
```

---

## Phase 74 — Landing repoint + license/marketing realignment

```
Work on Phase 74 of GitWarden (docs/plans/private-source-distribution-plan.md §"Phase 74"). Renderer + tests — this is the one phase with a normal green-test gate (the landing/ suites). Do NOT make gitwarden private here.

Tasks:
- Split the landing config so downloads and "source" are decoupled (landing/src/lib/config.ts:10-33): add storefront coordinates (RELEASES_OWNER / RELEASES_REPO = 'gitwarden-releases') and derive RELEASES_URL, LATEST_RELEASE_URL, RELEASES_API_URL, SECURITY_URL, LICENSE_URL from them. REMOVE REPO_URL (the "view source" constant) rather than repoint it.
- Remove the header "GitHub" link (landing/src/components/Header.astro:3,14) and the footer "GitHub repository" link (landing/src/components/Footer.astro:19); keep Releases/Security/License (now storefront-based). Drop the now-unused copy keys nav.github (landing/src/content/copy.ts:82) and footer.links.github (:177).
- Reword the claims in landing/src/content/copy.ts: FAQ "safe" answer (:152) drops "open source under the MIT license" but keeps the "only changes local Git settings / no telemetry" substance; FAQ "free" answer (:160) drops "open source" and softens the framing with NO pricing commitment; footer license line (:174) no longer says "Open source under the MIT license."
- Forward relicense the private repo: replace root LICENSE (LICENSE:1-3) with a proprietary/all-rights-reserved placeholder, and set package.json `license` to `UNLICENSED`.
- Update the landing tests to the new coordinates/links: fetchRelease.test.ts:23-26 (new RELEASES_API_URL), resolveTargets.test.ts:51-53 (new download host), and any footer/header link assertions or Playwright checks that referenced the removed "GitHub" link.

Manual step you HAND TO ME: after merge, trigger the Vercel deploy (existing hook or a push) so the live site reflects the new links.

Exit: landing Vitest green (cd landing && npm test) with updated URL/link assertions; landing Playwright e2e green (cd landing && npm run e2e, offline) — download buttons resolve to gitwarden-releases, no "view source" link renders, "open source / MIT" strings gone; landing lint + type-check clean (npm run lint, npm run check, npm run typecheck); root LICENSE is proprietary and package.json license is UNLICENSED; root `npm run lint` clean.

Then run the standard progress footer.
```

---

## Phase 75 — Privatization + end-to-end verification (private-flip last)

```
Work on Phase 75 of GitWarden (docs/plans/private-source-distribution-plan.md §"Phase 75", §"Acceptance criteria"). Ops + verification. Feature-complete stop point. There is little or no code here — the value is doing the steps IN ORDER and verifying, with the private-flip LAST. Do not fake any GitHub action.

Sequence (order matters — you guide me, I execute the GitHub actions):
1. VERIFY FIRST, while gitwarden is still public: on the live site, a download button resolves to a gitwarden-releases asset and the file actually downloads; the footer Releases/Security/License links open the storefront; no "view source" link is present.
2. Pages/presentation prerequisite — ALREADY DONE (2026-07-02): the deck lives in the public gitwarden-presentation repo (shchadylotaras.github.io/gitwarden-presentation/) and gitwarden no longer serves Pages. No action — just confirm that new URL is still live before the flip.
3. Flip gitwarden to private (my action in GitHub settings).
4. Post-flip checks: the public site still downloads (storefront is public/untouched); Vercel still builds and deploys the now-private landing/ (confirm the Vercel↔GitHub integration is still authorized); the old .../gitwarden/releases/... URLs now 404 for the public (expected).
5. (Optional) confirm cross-repo publish post-privatization: push a throwaway v* test tag (or workflow_dispatch) and confirm the workflow publishes a DRAFT to gitwarden-releases using RELEASES_REPO_TOKEN; delete the throwaway. (Costs the full matrix — optional.)

Exit (verification — mark PENDING until I confirm each GitHub action): before the flip, a real browser download from the live site succeeds via a gitwarden-releases asset URL; after the flip, gitwarden is private, the public site still downloads, Vercel still deploys, and gitwarden/releases is not publicly reachable; the presentation site is served from its new public home; (if run) a test tag publishes a draft to gitwarden-releases, not gitwarden.

Then run the standard progress footer. This is the feature-complete stop point for Private-Source Distribution (72–75).
```
