# GitWarden — Distribution & Release Plan

> Turn the buildable app into a product an ordinary user can **download → install → open** — no `npm`, no clone, no VS Code. The maintainer (or CI) packages installers once; users grab the file for their OS from a GitHub Release.
>
> Two paths are designed in parallel: the **free/unsigned** path that works today (users dismiss an OS warning once), and the **signed/professional** path (Apple notarization + Windows code signing) that removes those warnings. Signing is **optional and gated** on the maintainer owning certificates — every phase degrades gracefully without them.

## 0. How to Read This Plan

This continues the main plan (`docs/plans/gitwarden-plan.md`), the OAuth plan (`docs/plans/github-oauth-plan.md`), and the AI plan (`docs/plans/ai-integration-plan.md`). Same conventions: each phase has a **Goal**, **Tasks**, and explicit **Exit criteria**; a phase is done only when its exit criteria are green and `docs/progress-log.md` is updated; commit per phase, never push automatically.

Phase order (continues the global counter; the AI track ends at Phase 39):

- **Phase 40 — Packaging Foundations & Local `dist`** (the `npm run dist` one-liner; unsigned installers build on the host OS)
- **Phase 41 — App Identity: Icons, Metadata & Installer UX**
- **Phase 42 — Release Workflow (GitHub Actions, unsigned matrix)** ← the "push a tag, get installers" automation
- **Phase 43 — Code Signing & Notarization** _(optional; gated on maintainer certificates)_
- **Phase 44 — Auto-Update** _(deferred; depends on Phase 43 — never auto-update unsigned builds)_
- **Phase 45 — Release Process, Versioning & Download Docs**

**Recommended cut:** ship **Phases 40–42 + 45**. That gives a real, repeatable release: tag the repo, CI builds macOS/Windows/Linux installers, attaches them to a draft GitHub Release, the maintainer publishes it, and `README` points users at the download. Phase 43 (signing) is the "looks professional, no scary warnings" upgrade and is added when certificates exist. Phase 44 (auto-update) is intentionally last because shipping unsigned auto-updates is a security risk.

**Dependency note:** the distribution track depends only on a **buildable app** (true since Phase 20 — the renderer + main compile and the app launches). It is **independent of the AI track (Phases 30–39)** and can run in parallel with feature work. Releasing does not require the AI features to be finished.

---

## 1. The Two Distribution Paths

GitWarden never asks the end user to run a build. The maintainer/CI compiles once and publishes a file; the user downloads and installs. There are two finish-levels for that file.

### Path A — Free / unsigned (works today)

`npm run dist` (added in Phase 40) produces, on the host OS:

| OS      | Artifact                            | User action                                     |
| ------- | ----------------------------------- | ----------------------------------------------- |
| macOS   | `GitWarden-0.1.0-arm64.dmg` (+ x64) | Open the `.dmg`, drag GitWarden to Applications |
| Windows | `GitWarden-Setup-0.1.0.exe` (NSIS)  | Run the installer                               |
| Linux   | `GitWarden-0.1.0.AppImage`          | `chmod +x` and run                              |
| Linux   | `gitwarden_0.1.0_amd64.deb`         | `sudo apt install ./gitwarden_0.1.0_amd64.deb`  |

Because the binaries are **unsigned**, the OS shows a one-time warning the first time the app runs:

- **macOS Gatekeeper** — "GitWarden can't be opened because Apple cannot check it for malicious software." User right-clicks → Open, or allows it in System Settings → Privacy & Security.
- **Windows SmartScreen** — "Windows protected your PC." User clicks "More info" → "Run anyway."
- **Linux** — no warning; AppImage/`.deb` just run.

This path costs nothing and is correct for early releases and internal testers. It is the answer to "how do I do this **without** signing": you still ship a ready-made installer — the only difference is the dismissable warning.

### Path B — Signed / professional (Phase 43)

The same artifacts, but Apple-notarized and Windows-code-signed, so **no warning appears**. This requires paid credentials:

- **macOS** — Apple Developer Program ($99/yr) → Developer ID Application certificate + notarization.
- **Windows** — a code-signing certificate (OV or, to skip SmartScreen reputation build-up, EV / Azure Trusted Signing).
- **Linux** — no signing needed for AppImage/`.deb`; package-repo GPG signing is out of scope.

Path B is a strict upgrade layered onto Path A: the build config and CI workflow are written so that **when the signing secrets are present they are used, and when they are absent the build still succeeds unsigned** (Path A). No code path forks — only credentials.

---

## 2. Release Rules (non-negotiable)

These extend `AGENTS.md`; they do not replace it.

- **Tests gate the package.** `electron-builder` runs only after `npm test` (and the e2e suite where the runner allows) is green in the same CI job. A red suite never produces a release artifact.
- **Version is single-sourced.** `package.json` `version` is the one source of truth. The release tag must be `v${version}`; CI fails the release if the pushed tag and `package.json` version disagree.
- **No secrets in the repo.** Certificates, Apple credentials, and tokens live only in GitHub Actions encrypted secrets (and a maintainer's local keychain). Never committed, never logged. `.gitignore` already excludes `dist/`, `build/`, `release/`, `.env*`.
- **Graceful degradation.** Absence of signing secrets produces a working **unsigned** build, not a failed one. Signing is additive.
- **Releases start as drafts.** CI publishes to a **draft** GitHub Release; a human reviews the attached artifacts and the changelog, then publishes. Nothing reaches users automatically.
- **Reproducible & offline tests still hold.** The existing Vitest/Playwright suites stay offline; packaging adds no network dependency to the test gate. Real signing/notarization happens only on tag builds that carry secrets, never in PR CI.
- **No auto-update before signing.** An unsigned auto-update channel can ship unverified code to users; Phase 44 is blocked on Phase 43.
- **Per-OS native runners.** Each installer is built on its own OS runner (macOS for `.dmg`, Windows for `.exe`, Linux for `.AppImage`/`.deb`) — cross-building is unreliable and breaks signing (see Appendix C).

---

## 3. Artifacts & Naming

Targets are already declared in `electron-builder.yml`; this plan finalizes naming, metadata, and publishing. Canonical `artifactName` templates (set in Phase 40):

```text
mac:   ${productName}-${version}-${arch}.${ext}     → GitWarden-0.1.0-arm64.dmg, GitWarden-0.1.0-x64.dmg
win:   ${productName}-Setup-${version}.${ext}       → GitWarden-Setup-0.1.0.exe
linux (AppImage): ${productName}-${version}.${ext}  → GitWarden-0.1.0.AppImage
linux (deb):      ${name}_${version}_${arch}.${ext} → gitwarden_0.1.0_amd64.deb
```

`directories.output` stays `dist/` (gitignored). `buildResources` stays `resources/` (where icons land in Phase 41).

---

## 4. Phases

### Phase 40 — Packaging Foundations & Local `dist`

**Goal:** a single command builds installable, runnable (unsigned) artifacts on the host OS.

**Tasks:**

- Add scripts to `package.json`:
  - `"dist": "electron-vite build && electron-builder"` — full installers for the host OS.
  - `"dist:dir": "electron-vite build && electron-builder --dir"` — unpacked app only (fast smoke build, no installer).
  - `"pack": "electron-builder --dir"` (optional convenience).
- Fill required publish/identity metadata in `package.json`: `author` (name + email — feeds NSIS publisher and `.deb` maintainer), `repository` (`https://github.com/shchadyloTaras/gitwarden` — feeds the GitHub publish provider), `license`, `homepage`.
- Finalize `electron-builder.yml`:
  - `artifactName` templates per §3.
  - `publish` block for GitHub (`provider: github`, `owner: shchadyloTaras`, `repo: gitwarden`, `releaseType: draft`) — used by Phase 42; harmless locally with `--publish never` (the default).
  - confirm `files` includes the built `out/**/*` + `package.json` and nothing stray; set `asar: true`.
  - `mac.target` keeps `dmg` for `[x64, arm64]`; add `mac.category` (already `public.app-category.developer-tools`).
- Verify the produced app **launches** from the installed location (open the `.dmg`/run the AppImage), not just that the build succeeds.
- Document the per-OS build limitation (Appendix C) and that local `dist` only builds for the OS you run it on.

**Exit criteria:**

- `npm run dist` on the maintainer's OS produces the expected artifact(s) named per §3 in `dist/`.
- The installed/opened app launches and reaches the app shell (smoke check on at least the maintainer's OS).
- `npm run dist:dir` produces a runnable unpacked build (used as the CI smoke step).
- No secrets required; build is unsigned and succeeds.
- `package.json` metadata complete; `dist/` stays gitignored.

---

### Phase 41 — App Identity: Icons, Metadata & Installer UX

**Goal:** the installer and installed app look like a real product, not a dev build.

**Tasks:**

- Add app icons under `resources/` (the configured `buildResources`):
  - `icon.icns` (macOS), `icon.ico` (Windows, multi-resolution), `icon.png` (Linux, ≥ 512×512). Generate all three from one master 1024×1024 source; keep the source in `resources/` too.
- macOS DMG presentation: `dmg.title`, optional background image + icon/window layout, Applications-folder drop target.
- Windows NSIS options: `oneClick: false`, `perMachine: false` (per-user install avoids admin prompt), `allowToChangeInstallationDirectory: true`, `createDesktopShortcut: true`, `createStartMenuShortcut: true`, `shortcutName: GitWarden`, installer/uninstaller icons.
- Linux desktop integration: `linux.category` (`Development`), `linux.maintainer` (required for `.deb`), `linux.desktop` entry (Name, Comment, Categories), `synopsis`/`description`.
- App-level metadata: `productName: GitWarden`, `copyright` (`Copyright © 2026 …`), `appId` (already `com.gitwarden.app`).
- Add a `LICENSE` file at repo root and reference it (resolves the README "License: TBD"); pick the license with the maintainer.

**Exit criteria:**

- Built installers on each OS show the GitWarden icon (Dock/Taskbar/file manager) and correct product name/publisher.
- macOS `.dmg` opens to a drag-to-Applications layout; Windows NSIS lets the user choose the install dir and creates shortcuts; Linux `.deb` installs with a working desktop entry.
- `LICENSE` present; `package.json`/`electron-builder.yml` reference it.

---

### Phase 42 — Release Workflow (GitHub Actions, unsigned matrix)

**Goal:** pushing a version tag produces a draft GitHub Release with installers for all three OSes attached — no local builds.

**Tasks:**

- Add `.github/workflows/release.yml` (skeleton in Appendix D):
  - **Trigger:** push of a tag matching `v*` (plus `workflow_dispatch` for manual reruns).
  - **Guard job:** assert the tag equals `v${package.json version}`; fail fast on mismatch.
  - **Matrix:** `macos-latest`, `windows-latest`, `ubuntu-latest`.
  - **Steps per job:** checkout → `actions/setup-node` (Node 20, npm cache) → `npm ci` → `npm test` (gate) → `npm run dist:dir` smoke (optional fast fail) → `npx electron-builder --publish always` for the matrix OS, with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. electron-builder appends artifacts to the draft release for the tag.
  - **Permissions:** `contents: write` for the workflow's `GITHUB_TOKEN`.
  - Linux job builds both AppImage + `.deb`; macOS job builds x64 + arm64 dmg; Windows job builds the NSIS `.exe`.
- Keep the e2e suite as the existing gate where the runner supports a headless Electron launch; if GUI launch is sandbox-restricted on a runner, document it (mirrors the Phase 18 note) and keep unit tests as the hard gate.
- Add a short "cutting a release" section to `docs/progress-log.md` references / `README` (full process lands in Phase 45).

**Exit criteria:**

- Pushing `v0.1.0` (test tag) triggers the workflow; all three matrix jobs go green.
- A **draft** GitHub Release for the tag carries: `GitWarden-…-arm64.dmg` + `…-x64.dmg`, `GitWarden-Setup-….exe`, `GitWarden-….AppImage`, `gitwarden_…_amd64.deb`.
- A failing `npm test` aborts the job before any artifact is built/published.
- Tag/version mismatch fails the guard job.
- Workflow uses only the built-in `GITHUB_TOKEN` (no extra secrets) on this unsigned path.

---

### Phase 43 — Code Signing & Notarization _(optional; gated on certificates)_

**Goal:** signed, notarized installers that install with no OS warning. Additive to Phase 42 — absent secrets, the build stays unsigned.

**Tasks:**

- **macOS:**
  - `mac.hardenedRuntime: true`, `mac.gatekeeperAssess: false`, `mac.entitlements` + `mac.entitlementsInherit` (`resources/entitlements.mac.plist` — allow JIT / unsigned-executable-memory as Electron requires).
  - Notarization via electron-builder `mac.notarize` (notarytool) reading env: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (or App Store Connect API key: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`).
  - Signing identity from `CSC_LINK` (base64 `.p12`) + `CSC_KEY_PASSWORD`.
- **Windows:**
  - Code signing via `CSC_LINK`/`CSC_KEY_PASSWORD` (OV/EV `.p12`) or Azure Trusted Signing (recommended — no physical token in CI).
  - Sign both the installer and the app executable; timestamp the signature.
- **CI wiring:** add the certificates/credentials as encrypted GitHub Actions secrets; pass them as env only on the signing matrix legs. Make every secret optional — a fork/PR or a maintainer without certs still gets an unsigned build (the "graceful degradation" rule).
- **Verification:** macOS `spctl --assess --type execute` + `stapler validate` pass; Windows `signtool verify /pa` passes.
- Document, in `SECURITY.md`, what signing attests (publisher identity + tamper-evidence) and what it does **not** (it is not a security review of GitWarden's behavior).

**Exit criteria:**

- With secrets present: macOS build is signed + notarized + stapled (passes Gatekeeper without a right-click-Open); Windows build is signed (no "unknown publisher"; SmartScreen reputation note documented for non-EV).
- With secrets absent: the same workflow completes and produces unsigned artifacts (no hard failure).
- `SECURITY.md` updated; no certificate material in the repo or logs.

---

### Phase 44 — Auto-Update _(deferred; depends on Phase 43)_

**Goal:** the installed app can offer "Update available → download → restart to install," pulling signed releases from GitHub. Deferred until signing exists.

**Tasks:**

- Add `electron-updater`; wire `autoUpdater` in main against the GitHub provider (reuses the Phase 40 `publish` config).
- **User-confirmed, never silent:** check on launch (and a manual "Check for updates"), surface a non-blocking prompt; download and install only on explicit user action (consistent with GitWarden's "destructive/remote actions stay behind confirmation" rule).
- Handle channels/pre-releases; skip-this-version; offline/airgapped degradation (no nag loop).
- Security: only apply updates from signed, notarized releases; AppImage updates via the AppImage update mechanism; `.deb` is update-via-repo/manual (document that auto-update covers mac/win + AppImage, not `.deb`).
- Externalize all new user-facing strings in `src/renderer/strings.ts`.

**Exit criteria:**

- App detects a newer published release and prompts; update applies only on explicit confirm; declining leaves the app untouched.
- No update path accepts an unsigned/un-notarized artifact.
- Works offline without errors or repeated prompts; strings externalized.

---

### Phase 45 — Release Process, Versioning & Download Docs

**Goal:** a documented, repeatable release the maintainer can run from memory, and a download experience for users.

**Tasks:**

- Adopt SemVer; document the bump policy (patch/minor/major) and a `CHANGELOG.md` (Keep-a-Changelog style); generate/curate release notes from merged work per phase.
- Write a **Release Checklist** in `docs/` (or `docs/progress-log.md` references): green `main` → bump `package.json` version → update `CHANGELOG` → `git tag vX.Y.Z` → push tag → CI builds draft release → verify artifacts/notes → publish release.
- Update `README` with a **Download** section: per-OS links to the latest GitHub Release, the one-time-warning note for the unsigned path (until Phase 43), and install steps per OS. Add release/version badges.
- Optionally add a lightweight download landing (a static page or just the GitHub Releases "latest" link); the files themselves stay on GitHub Releases.
- Add the new phases to the Phase Checklist and log each in `docs/progress-log.md` as it completes.

**Exit criteria:**

- A maintainer can follow the checklist end-to-end and cut a release without referring to anyone.
- `README` Download section links to working installers and states the per-OS install steps (and the warning workaround while unsigned).
- `CHANGELOG.md` exists and reflects the released version; tag ↔ version ↔ release notes are consistent.

---

## 5. Non-goals (for this track)

- App Store / Microsoft Store / Snap / Flatpak distribution (GitHub Releases only for now).
- Linux package-repo (apt/yum) hosting with GPG-signed metadata.
- Delta/differential updates and staged rollout percentages.
- Telemetry, crash reporting, or update analytics.
- Multi-arch Linux beyond `amd64` (arm64 Linux deferred).
- Reproducible-build attestation / SBOM signing (can be added later under `SECURITY.md`).

---

## 6. Testing & Verifiability

- **The test gate is unchanged and authoritative:** `npm test` (Vitest) and, where the runner allows, `npm run e2e` (Playwright) must pass in CI **before** `electron-builder` runs. Packaging adds no network dependency to that gate.
- **Smoke build in CI:** `dist:dir` (unpacked) builds fast and catches packaging breakage on every matrix OS before the full installer step.
- **Launch verification:** at least the maintainer's OS gets a manual "install the artifact and confirm the app opens to the shell" check per release (Appendix A); CI cannot fully verify GUI launch under sandbox.
- **No real signing/notarization in PR CI:** signing runs only on tag builds carrying secrets; PRs and forks build unsigned, proving graceful degradation.
- **Secret hygiene assertion:** certificates/credentials appear only in encrypted secrets and never in logs or artifacts; verified by reviewing workflow output on the first signed release.

---

## Appendix A — One-Time Local Release (no CI)

For a maintainer who wants to cut a release from a laptop before the CI workflow exists (Phase 40/41 only):

```bash
npm ci
npm test                 # gate
npm run dist             # builds installers for THIS OS only
# → artifacts land in dist/
```

Then create a GitHub Release manually and upload the files. Note: a single machine only produces its own-OS installers (a Mac can build mac + (with effort) other targets, but signing/notarization is mac-only). The CI matrix (Phase 42) is what produces all three OSes from one tag.

## Appendix B — GitHub Actions Secrets (Phase 43)

| Secret                                                       | Used for                                          | Optional? |
| ------------------------------------------------------------ | ------------------------------------------------- | --------- |
| `GITHUB_TOKEN` (built-in)                                    | Publishing the draft release (Phase 42)           | provided  |
| `CSC_LINK` / `CSC_KEY_PASSWORD`                              | macOS Developer ID + Windows `.p12` signing       | yes       |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | macOS notarization (notarytool)                   | yes       |
| `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`    | macOS notarization (API-key alt)                  | yes       |
| Azure Trusted Signing creds                                  | Windows signing without a physical token (EV alt) | yes       |

All signing secrets are optional: absent → unsigned build (Path A), never a failure.

## Appendix C — Per-OS Build Limitations

- **macOS `.dmg`** must be built on a macOS runner; signing + notarization are macOS-only (`codesign`/`notarytool`).
- **Windows `.exe`** is most reliably built on a Windows runner; building on Linux via Wine works for unsigned NSIS but complicates signing.
- **Linux `.AppImage`/`.deb`** build cleanly on a Linux runner.
- Conclusion: use native runners per OS in the matrix (Phase 42). Do not attempt to cross-build all targets on one host.

## Appendix D — Release Workflow Skeleton (Phase 42)

```yaml
name: Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:
permissions:
  contents: write
jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test # gate — no artifact on red
      - run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Phase 43 (optional, all may be unset → unsigned):
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

(A separate guard step/job asserts the pushed tag equals `v${package.json version}` before building.)

## References

- Internal: `docs/plans/gitwarden-plan.md`, `docs/plans/github-oauth-plan.md`, `docs/plans/ai-integration-plan.md`, `electron-builder.yml`, `package.json`, `SECURITY.md`, `docs/progress-log.md`.
- electron-builder: targets, `artifactName`, `publish` (GitHub provider), `mac.notarize`, NSIS options, Linux `deb`/`AppImage`.
- electron-updater: GitHub provider, user-confirmed update flow.
- Apple: Developer ID signing, hardened runtime, `notarytool` notarization + stapling.
- Windows: Authenticode code signing, SmartScreen reputation, Azure Trusted Signing.
