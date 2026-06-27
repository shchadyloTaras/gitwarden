# GitWarden — Release Checklist

A repeatable checklist for cutting a new release. Follow top-to-bottom; each step is a hard gate.

---

## 1. Pre-release gate

- [ ] `main` branch is green: `npm test` (594+ passing) and `npm run e2e` pass locally.
- [ ] No unreleased breaking changes left in `## [Unreleased]` of `CHANGELOG.md` that you did not intend to ship.

## 2. Version bump

- [ ] Decide the new version using SemVer:
  - **Patch** (`0.1.0 → 0.1.1`): backward-compatible bug fixes.
  - **Minor** (`0.1.0 → 0.2.0`): new backward-compatible features.
  - **Major** (`0.1.0 → 1.0.0`): breaking changes.
- [ ] Edit `package.json` → `"version": "<new>"`.
- [ ] Edit `CHANGELOG.md`:
  - Rename `## [Unreleased]` to `## [<new>] — <YYYY-MM-DD>`.
  - Add a fresh `## [Unreleased]` section above it (empty).
  - Add a comparison link at the bottom:
    `[<new>]: https://github.com/shchadyloTaras/gitwarden/compare/v<prev>...v<new>`
- [ ] Commit: `git commit -m "chore: bump version to <new>"`.

## 3. Tag and push tag

```bash
git tag v<new>
git push origin v<new>
```

> **Never `git push origin main`** unless you also intend to push the commit. Only push the tag.

## 4. CI build (GitHub Actions)

- [ ] Watch the **Release** workflow run at
      `https://github.com/shchadyloTaras/gitwarden/actions`.
- [ ] Guard job passes: tag matches `v${package.json version}`.
- [ ] All three matrix jobs (macOS, Windows, Linux) go green.
- [ ] A **draft** GitHub Release is created at
      `https://github.com/shchadyloTaras/gitwarden/releases` with these five artifacts:
  - `GitWarden-<ver>-arm64.dmg`
  - `GitWarden-<ver>-x64.dmg`
  - `GitWarden-Setup-<ver>.exe`
  - `GitWarden-<ver>.AppImage`
  - `gitwarden_<ver>_amd64.deb`

## 5. Artifact smoke test

On **at least one OS** (your main development machine):

- [ ] Download the artifact for your OS from the draft release.
- [ ] Install it (open the `.dmg` and drag to Applications, run `.exe`, or `chmod +x` the AppImage).
- [ ] Launch the app and confirm it reaches the shell (header shows, navigation works).
- [ ] macOS (until Phase 43): right-click → Open at the first launch to dismiss the Gatekeeper warning.
- [ ] Windows (until Phase 43): click "More info" → "Run anyway" at the SmartScreen dialog.

## 6. Publish

- [ ] Edit the draft GitHub Release:
  - Paste the `CHANGELOG.md` section for this version into the release notes.
  - Verify the artifact list matches step 4.
- [ ] Click **Publish release**.
- [ ] Confirm `README.md` download links (or the GitHub Releases "latest" link) resolve to the published installers.

---

## Version bump policy (SemVer)

| Change type                      | Version component | Example         |
| -------------------------------- | ----------------- | --------------- |
| Bug fix, docs, refactor          | Patch             | `0.1.0 → 0.1.1` |
| New feature, backward-compatible | Minor             | `0.1.0 → 0.2.0` |
| Breaking API / behavior change   | Major             | `0.1.0 → 1.0.0` |

Pre-1.0 (current): minor = new features; patch = fixes; breaking changes may increment minor rather than major until the public API stabilizes.

---

## One-time OS warning workaround (unsigned builds, until Phase 43)

| OS      | Warning                                                                           | Dismiss                           |
| ------- | --------------------------------------------------------------------------------- | --------------------------------- |
| macOS   | "GitWarden can't be opened because Apple cannot check it for malicious software." | Right-click the app → Open → Open |
| Windows | "Windows protected your PC — Unknown publisher."                                  | More info → Run anyway            |
| Linux   | (none)                                                                            | —                                 |

Document this in release notes until Phase 43 (Code Signing & Notarization) ships.
