# GitWarden

[![Release](https://img.shields.io/github/v/release/shchadyloTaras/gitwarden?label=release)](https://github.com/shchadyloTaras/gitwarden/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A cross-platform desktop Git GUI focused on **safe multi-account GitHub usage** — it prevents committing or pushing with the wrong profile, author name, email, SSH key, or repository.

Built around **profiles** (e.g. Personal / Work / Client). Each repository is assigned to exactly one profile, and GitWarden surfaces identity safety **before** every commit and push — so you never accidentally push with the wrong account or key.

## Download

**Easiest:** the [download site](https://gitwarden.vercel.app) detects your OS and links the right installer in one click.

Prefer to choose yourself? Grab it from the [GitHub Releases page](https://github.com/shchadyloTaras/gitwarden/releases/latest):

| Platform                  | File                        | Install                                                   |
| ------------------------- | --------------------------- | --------------------------------------------------------- |
| **macOS (Apple Silicon)** | `GitWarden-<ver>-arm64.dmg` | Open the `.dmg`, drag GitWarden to Applications           |
| **macOS (Intel)**         | `GitWarden-<ver>-x64.dmg`   | Open the `.dmg`, drag GitWarden to Applications           |
| **Windows**               | `GitWarden-Setup-<ver>.exe` | Run the installer; choose install dir, creates shortcuts  |
| **Linux (AppImage)**      | `GitWarden-<ver>.AppImage`  | `chmod +x GitWarden-*.AppImage && ./GitWarden-*.AppImage` |
| **Linux (deb)**           | `gitwarden_<ver>_amd64.deb` | `sudo apt install ./gitwarden_*.deb`                      |

### One-time OS warning (unsigned builds)

The current release is **unsigned** (no paid code-signing certificate yet). Your OS will show a one-time warning:

- **macOS Gatekeeper:** "GitWarden can't be opened because Apple cannot check it for malicious software." → Right-click the app → **Open** → **Open**.
- **Windows SmartScreen:** "Windows protected your PC — Unknown publisher." → **More info** → **Run anyway**.
- **Linux:** no warning.

This warning disappears once Phase 43 (Code Signing & Notarization) ships.

## Why

Juggling multiple GitHub identities locally is error-prone: the right email but the wrong SSH key, a repo committed under your personal name at work, a push to the wrong account. GitWarden makes the active identity always visible and **blocks** unsafe actions.

## Status

Built in phases. MVP (0–20), GitHub OAuth (21–27), AI advisory + chat (28–39, 52–55a), Client Branch Access (56–59), Distribution & Release (40–42, 45), and Landing Page (46–51) are complete. See the [progress log](docs/progress-log.md) for the per-phase checklist and history.

- **Core plan:** [`docs/plans/gitwarden-plan.md`](docs/plans/gitwarden-plan.md) · prompts: [`docs/prompts/phase-prompts.md`](docs/prompts/phase-prompts.md)
- **GitHub OAuth:** [`docs/plans/github-oauth-plan.md`](docs/plans/github-oauth-plan.md) · prompts: [`docs/prompts/github-oauth-prompts.md`](docs/prompts/github-oauth-prompts.md)
- **AI Connections:** [`docs/plans/ai-integration-plan.md`](docs/plans/ai-integration-plan.md) · prompts: [`docs/prompts/ai-integration-prompts.md`](docs/prompts/ai-integration-prompts.md)
- **AI Chat Redesign:** [`docs/plans/ai-chat-redesign-plan.md`](docs/plans/ai-chat-redesign-plan.md)
- **Distribution & Release:** [`docs/plans/distribution-release-plan.md`](docs/plans/distribution-release-plan.md) · **Landing Page:** [`docs/plans/landing-page-plan.md`](docs/plans/landing-page-plan.md)
- **Decisions & security:** [`DECISIONS.md`](DECISIONS.md), [`SECURITY.md`](SECURITY.md)
- **Contributor/agent guides:** [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)
- **Status & progress log:** [`docs/progress-log.md`](docs/progress-log.md)

## Stack

Electron + TypeScript (strict) + React (Vite) · Vitest (logic) + Playwright (e2e). Git is invoked via Node `child_process.execFile` (never a shell). Runs on macOS, Linux, and Windows.

## Repository

```
git@github.com:shchadyloTaras/gitwarden.git
```

## Cutting a release

See the full **[Release Checklist](docs/release-checklist.md)**.

Quick summary:

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. Commit, then tag and push the tag: `git tag v<version> && git push origin v<version>`.
3. The [Release workflow](.github/workflows/release.yml) builds macOS + Windows + Linux installers and attaches them to a **draft** GitHub Release.
4. Review the artifacts + release notes, then publish.

Signing (Phase 43) is optional; absent `CSC_LINK` / `APPLE_ID` secrets the workflow still produces working unsigned installers.

## License

[MIT](LICENSE).
