# GitWarden — Distribution & Release Phase Prompts

Copy-paste prompts to drive the Distribution & Release feature one phase at a time. Each prompt is self-contained, points at the plan, and **ends with the standard progress block** that appends an entry to `docs/progress-log.md`.

**How to use:** run prompts in order (40 → 45). Don't start a phase until the previous phase's entry in `docs/progress-log.md` shows Exit criteria ✅. The **recommended cut is Phases 40–42 + 45** — that gives a real, repeatable release: tag the repo, CI builds macOS/Windows/Linux installers, attaches them to a draft GitHub Release, the maintainer publishes it, and `README` points users at the download. **Phase 43 (signing)** is the "no scary warnings" upgrade, added only when the maintainer owns certificates. **Phase 44 (auto-update) is deferred** and must not be built before Phase 43 — shipping unsigned auto-updates is a security risk. References: feature plan in `docs/plans/distribution-release-plan.md`, base plan in `docs/plans/gitwarden-plan.md`, rules in `CLAUDE.md` / `AGENTS.md`.

**No paid prerequisite for the core track.** Phases 40–42 + 45 require **no certificates and no paid accounts** — they produce working _unsigned_ installers that users install after dismissing a one-time OS warning. The only secret used is the built-in `GITHUB_TOKEN`. Signing credentials (Phase 43) are optional and gated on the maintainer owning them; their absence must always degrade to a working unsigned build, never a failed one.

**Global invariants (true for every prompt below):**

- **Tests gate the package.** `electron-builder` runs only after `npm test` (and the e2e suite where the runner allows) is green in the same job. A red suite never produces a release artifact.
- **Version is single-sourced.** `package.json` `version` is the one source of truth; the release tag must be `v${version}` and CI fails the release on a tag/version mismatch.
- **No secrets in the repo.** Certificates, Apple credentials, and tokens live only in GitHub Actions encrypted secrets (and a maintainer's local keychain) — never committed, never logged. `.gitignore` already excludes `dist/`, `build/`, `release/`, `.env*`.
- **Graceful degradation.** Absence of signing secrets produces a working **unsigned** build, not a failed one. Signing is additive — no code path forks, only credentials.
- **Releases start as drafts.** CI publishes to a **draft** GitHub Release; a human reviews artifacts + changelog, then publishes. Nothing reaches users automatically.
- **Per-OS native runners.** Each installer builds on its own OS runner (macOS for `.dmg`, Windows for `.exe`, Linux for `.AppImage`/`.deb`) — cross-building is unreliable and breaks signing (plan Appendix C).
- **No auto-update before signing.** Phase 44 is blocked on Phase 43; an unsigned auto-update channel can ship unverified code to users.
- All new user-facing strings are externalized in `src/renderer/strings.ts`.

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
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md.
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 40 — Packaging Foundations & Local `dist`

```
Work on Phase 40 of GitWarden (see docs/plans/distribution-release-plan.md §2, §3, §4 Phase 40, Appendix A, Appendix C). Goal: a single command builds installable, runnable (UNSIGNED) artifacts on the host OS. No signing, no CI yet — just the local one-liner.

Tasks:
- Add scripts to package.json:
  - "dist": "electron-vite build && electron-builder"        (full installers for the host OS)
  - "dist:dir": "electron-vite build && electron-builder --dir" (unpacked app only — fast smoke build, no installer; reused as the CI smoke step in Phase 42)
  - "pack": "electron-builder --dir"                          (optional convenience)
- Fill required publish/identity metadata in package.json: author (name + email — feeds NSIS publisher and the .deb maintainer), repository ("https://github.com/shchadyloTaras/gitwarden" — feeds the GitHub publish provider), license, homepage.
- Finalize electron-builder.yml:
  - artifactName templates per plan §3:
      mac:   ${productName}-${version}-${arch}.${ext}    → GitWarden-0.1.0-arm64.dmg, GitWarden-0.1.0-x64.dmg
      win:   ${productName}-Setup-${version}.${ext}      → GitWarden-Setup-0.1.0.exe
      linux AppImage: ${productName}-${version}.${ext}   → GitWarden-0.1.0.AppImage
      linux deb:      ${name}_${version}_${arch}.${ext}  → gitwarden_0.1.0_amd64.deb
  - publish block for GitHub (provider: github, owner: shchadyloTaras, repo: gitwarden, releaseType: draft) — consumed in Phase 42; harmless locally (default --publish never).
  - confirm files includes the built out/**/* + package.json and nothing stray; set asar: true.
  - mac.target keeps dmg for [x64, arm64]; keep mac.category public.app-category.developer-tools.
- directories.output stays dist/ (gitignored); buildResources stays resources/ (icons land in Phase 41).
- Verify the produced app LAUNCHES from the installed location (open the .dmg / run the AppImage), not merely that the build succeeded.

Exit criteria: `npm run dist` on the maintainer's OS produces the expected artifact(s) named per §3 in dist/; the installed/opened app launches and reaches the app shell (smoke check on at least the maintainer's OS); `npm run dist:dir` produces a runnable unpacked build; no secrets required (build is unsigned and succeeds); package.json metadata complete; dist/ stays gitignored.

Then run the standard progress footer.
```

---

## Phase 41 — App Identity: Icons, Metadata & Installer UX

```
Work on Phase 41 (docs/plans/distribution-release-plan.md §4 Phase 41). Goal: the installer and installed app look like a real product, not a dev build.

Tasks:
- Add app icons under resources/ (the configured buildResources): icon.icns (macOS), icon.ico (Windows, multi-resolution), icon.png (Linux, ≥ 512×512). Generate all three from one master 1024×1024 source and keep the source in resources/ too.
- macOS DMG presentation: dmg.title, optional background image + icon/window layout, Applications-folder drop target.
- Windows NSIS options: oneClick: false, perMachine: false (per-user install avoids the admin prompt), allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: GitWarden, installer/uninstaller icons.
- Linux desktop integration: linux.category (Development), linux.maintainer (REQUIRED for .deb), a linux.desktop entry (Name, Comment, Categories), synopsis/description.
- App-level metadata: productName: GitWarden, copyright (Copyright © 2026 …), appId (already com.gitwarden.app).
- Add a LICENSE file at repo root and reference it (resolves the README "License: TBD"); pick the license with the maintainer.

Exit criteria: built installers on each OS show the GitWarden icon (Dock/Taskbar/file manager) and correct product name/publisher; the macOS .dmg opens to a drag-to-Applications layout; the Windows NSIS installer lets the user choose the install dir and creates shortcuts; the Linux .deb installs with a working desktop entry; LICENSE present and referenced from package.json / electron-builder.yml.

Then run the standard progress footer.
```

---

## Phase 42 — Release Workflow (GitHub Actions, unsigned matrix)

```
Work on Phase 42 (docs/plans/distribution-release-plan.md §4 Phase 42, Appendix C, Appendix D). Goal: pushing a version tag produces a DRAFT GitHub Release with installers for all three OSes attached — no local builds. Unsigned matrix only; no signing secrets here.

Tasks:
- Add .github/workflows/release.yml (skeleton in plan Appendix D):
  - Trigger: push of a tag matching v* (plus workflow_dispatch for manual reruns).
  - Guard job/step: assert the pushed tag equals v${package.json version}; fail fast on mismatch BEFORE any build.
  - Matrix: macos-latest, windows-latest, ubuntu-latest. Build on native runners only (per-OS rule).
  - Steps per job: checkout → actions/setup-node (Node 20, npm cache) → npm ci → npm test (gate) → npm run dist:dir smoke (optional fast fail) → npx electron-builder --publish always for the matrix OS, with GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}. electron-builder appends artifacts to the draft release for the tag.
  - Permissions: contents: write for the workflow's GITHUB_TOKEN.
  - Linux job builds AppImage + .deb; macOS job builds x64 + arm64 dmg; Windows job builds the NSIS .exe.
- Keep the e2e suite as the existing gate where the runner supports a headless Electron launch; if GUI launch is sandbox-restricted on a runner, document it (mirrors the Phase 18 note) and keep unit tests as the hard gate.
- Add a short "cutting a release" pointer to README / docs/progress-log.md references (the full process lands in Phase 45).

Exit criteria: pushing v0.1.0 (test tag) triggers the workflow and all three matrix jobs go green; a DRAFT GitHub Release for the tag carries GitWarden-…-arm64.dmg + …-x64.dmg, GitWarden-Setup-….exe, GitWarden-….AppImage, gitwarden_…_amd64.deb; a failing npm test aborts the job before any artifact is built/published; a tag/version mismatch fails the guard; the workflow uses only the built-in GITHUB_TOKEN (no extra secrets) on this unsigned path.

Then run the standard progress footer.
```

---

## Phase 43 — Code Signing & Notarization _(optional; gated on certificates)_

```
Work on Phase 43 (docs/plans/distribution-release-plan.md §1 Path B, §4 Phase 43, Appendix B). Goal: signed, notarized installers that install with NO OS warning. STRICTLY ADDITIVE to Phase 42 — when secrets are absent the same workflow still produces a working unsigned build (the graceful-degradation rule). Only start this once the maintainer owns the credentials.

Tasks:
- macOS:
  - mac.hardenedRuntime: true, mac.gatekeeperAssess: false, mac.entitlements + mac.entitlementsInherit (resources/entitlements.mac.plist — allow JIT / unsigned-executable-memory as Electron requires).
  - Notarization via electron-builder mac.notarize (notarytool) reading env APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (or App Store Connect API key: APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER).
  - Signing identity from CSC_LINK (base64 .p12) + CSC_KEY_PASSWORD.
- Windows:
  - Code signing via CSC_LINK / CSC_KEY_PASSWORD (OV/EV .p12) or Azure Trusted Signing (recommended — no physical token in CI).
  - Sign BOTH the installer and the app executable; timestamp the signature.
- CI wiring: add the certificates/credentials as encrypted GitHub Actions secrets; pass them as env ONLY on the signing matrix legs. Make every secret optional — a fork/PR or a maintainer without certs still gets an unsigned build.
- Verification: macOS `spctl --assess --type execute` + `stapler validate` pass; Windows `signtool verify /pa` passes.
- Document, in SECURITY.md, what signing attests (publisher identity + tamper-evidence) and what it does NOT (it is not a security review of GitWarden's behavior).

Exit criteria: with secrets present — macOS build is signed + notarized + stapled (passes Gatekeeper with no right-click-Open) and the Windows build is signed (no "unknown publisher"; SmartScreen reputation note documented for non-EV); with secrets absent — the same workflow completes and produces unsigned artifacts (no hard failure); SECURITY.md updated; no certificate material in the repo or logs.

Then run the standard progress footer.
```

---

## Phase 44 — Auto-Update _(deferred; depends on Phase 43)_

```
Work on Phase 44 (docs/plans/distribution-release-plan.md §4 Phase 44). DEFERRED — do not start until Phase 43 (signing) is done; never ship an unsigned auto-update channel. Goal: the installed app can offer "Update available → download → restart to install," pulling SIGNED releases from GitHub.

Tasks:
- Add electron-updater; wire autoUpdater in main against the GitHub provider (reuses the Phase 40 publish config).
- User-confirmed, NEVER silent: check on launch (and a manual "Check for updates"), surface a non-blocking prompt; download and install only on explicit user action (consistent with GitWarden's "destructive/remote actions stay behind confirmation" rule).
- Handle channels/pre-releases, skip-this-version, and offline/airgapped degradation (no nag loop).
- Security: only apply updates from signed, notarized releases; AppImage updates via the AppImage update mechanism; .deb is update-via-repo/manual (document that auto-update covers mac/win + AppImage, not .deb).
- Externalize all new user-facing strings in src/renderer/strings.ts.

Exit criteria: the app detects a newer published release and prompts; the update applies only on explicit confirm and declining leaves the app untouched; no update path accepts an unsigned/un-notarized artifact; it works offline without errors or repeated prompts; strings externalized.

Then run the standard progress footer.
```

---

## Phase 45 — Release Process, Versioning & Download Docs

```
Work on Phase 45 (docs/plans/distribution-release-plan.md §4 Phase 45). Goal: a documented, repeatable release the maintainer can run from memory, plus a download experience for users. This closes the recommended cut (40–42 + 45).

Tasks:
- Adopt SemVer; document the bump policy (patch/minor/major) and add a CHANGELOG.md (Keep-a-Changelog style); curate release notes per phase.
- Write a Release Checklist in docs/ (or docs/progress-log.md references): green main → bump package.json version → update CHANGELOG → git tag vX.Y.Z → push tag → CI builds the draft release → verify artifacts/notes → publish release.
- Update README with a Download section: per-OS links to the latest GitHub Release, the one-time-warning note for the unsigned path (until Phase 43 ships), and install steps per OS. Add release/version badges.
- Optionally add a lightweight download landing (a static page or just the GitHub Releases "latest" link); the files themselves stay on GitHub Releases.
- Confirm the Distribution & Release phases are in the Phase Checklist and each is logged in docs/progress-log.md as it completes.

Exit criteria: a maintainer can follow the checklist end-to-end and cut a release without referring to anyone; the README Download section links to working installers and states the per-OS install steps (and the warning workaround while unsigned); CHANGELOG.md exists and reflects the released version; tag ↔ version ↔ release notes are consistent.

Then run the standard progress footer.
```

---

## After the core cut (40–42 + 45): manual release verification

Before considering the release real, a maintainer runs the plan's Appendix A by hand (the steps CI cannot fully verify under sandbox):

1. Push a test tag (e.g. `v0.1.0`) and confirm the workflow attaches all five artifacts to a **draft** release.
2. On macOS: open the `.dmg`, drag to Applications, launch, and confirm the one-time Gatekeeper warning dismisses cleanly (until Phase 43) and the app reaches the shell.
3. On Windows: run `GitWarden-Setup-….exe`, dismiss SmartScreen via "More info → Run anyway" (until Phase 43), and confirm shortcuts + launch.
4. On Linux: `chmod +x` the AppImage and run it; install the `.deb` and confirm the desktop entry launches.
5. Publish the draft release, then confirm the README Download links resolve to the published installers.
