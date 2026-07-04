---
title: Changelog
description: Full version history for GitWarden.
order: 9
---

# Changelog

## Unreleased

## 0.4.2 — 2026-07-04

### Fixed

- Clearer branch errors: trying to create a branch with an invalid name (for example one with a space, a leading dash, or `..`) or a name that already exists now explains exactly what's wrong instead of showing "An unexpected Git error occurred."

## 0.4.1 — 2026-07-04

### Fixed

- Update notifications work again: the app now checks the public releases page for new versions. Versions 0.3.0–0.4.0 were checking the old, now-private location and silently found nothing — so they never showed the sidebar Update button or a new version on the Updates screen. Install this version manually once; from here on new releases are picked up automatically.

## 0.4.0 — 2026-07-04

### Changed

- Profiles-first sidebar: the MANAGE section now lists Profiles above Repositories, matching the setup order — every repository is assigned to a profile.
- Repositories stays locked with a gentle "Add a profile first" hint until you create your first profile; it unlocks instantly when you do. On a fresh start the app opens on Profiles.
- Keyboard navigation (Cmd/Ctrl+1–9) follows the sidebar's visual order, and the header guard badge points you to Profiles when none exist yet.

## 0.3.0 — 2026-07-03

### Added

**Push-failure quick fix (Phases 63–67)**

- One-Click Fix: when a push fails, GitWarden now diagnoses the cause and offers executable fix actions right in the failure banner (switch to the correct profile and retry, set the upstream, and more).
- SSH transport binding: pushes over SSH use the key bound to the repo's profile.

**Recover from diverged branches (Phases 68–71)**

- When a pull fails because your branch and the remote have diverged, the recovery banner now offers a Merge action to reconcile them; genuine merge conflicts are detected and surfaced instead of a generic error.

**Undo a commit (Phases 76–79)**

- Uncommit: return your most recent unpushed commit back to working changes. The History screen marks unpushed commits and offers return actions.

**Re-check with GitHub on return (Phases 80–81)**

- When you switch back to GitWarden, it re-checks your GitHub status ("Checking with GitHub…") with rate-limit-conscious polling, so the safety picture stays current.

**Merge a branch (Phases 82–84)**

- Merge a local branch into the current one directly from the Branches screen, with a clean-working-tree pre-check and conflict detection.

**Initialize a repository (Phases 85–88)**

- Turn a plain folder into a Git repository from inside GitWarden: an inline Initialize panel writes your `--local` identity, optionally connects a remote, guards against initializing inside an existing repo, and lands you on the Commit screen. Empty repositories (no commits yet) are handled throughout.

- Collapsible sidebar with a toggle control.
- Update button in the sidebar footer.
- Universal tooltip system with explanatory coverage across the app.
- AI chat: a bare `/explain` now summarizes the active safety issues.

### Fixed

- Unstaging is now robust on a brand-new repository that has no commits yet (unborn HEAD).
- Your AI commit draft is now preserved across tab and repository switches.
- Screens no longer go stale after switching branches in place.
- GitHub token scope validation and git error handling improved.
- AI settings: "Save key" is now the primary action, and the Model section stays hidden until a credential exists.

## 0.2.0 — 2026-06-28

### Added

- Startup loader: a brief launch screen shown while GitWarden initializes.
- Update notifier: GitWarden now checks GitHub for a newer version on launch and shows an Update button in the header when one is available. A new Updates section in Settings lets you check on demand and open the download page; new versions are installed manually.

## 0.1.1 — 2026-06-28

### Fixed

- Branches now detect local branches checked out in another Git worktree, show the worktree path, and disable switch/delete actions that Git would reject.
- Branch switch/delete errors for worktree-checked-out branches now explain the actual worktree conflict instead of showing a generic or misleading branch error.
- Branch deletion now refreshes stale branch lists and treats already-missing local branches as a safe no-op.

## 0.1.0 — 2026-06-27

### Added

**MVP Core (Phases 0–20)**

- Project foundations: Electron 31 + TypeScript strict + React 18 + Vite; Vitest + Playwright e2e.
- Core types and domain models: `Profile`, `RepositoryRecord`, `AppSettings` with Zod validation.
- `GitRunner`: safe `child_process.execFile`-based git execution (never a shell), per-cwd mutation queue, `AbortSignal` cancellation, controlled env.
- `PorcelainParser`: pure NUL-delimited porcelain v2 parser for staged/unstaged/untracked/conflict entries.
- `SafetyCheckService`: pure synchronous commit and push safety checks covering 11 issue codes (profile mismatch, identity unset, email mismatch, no remote, remote host mismatch, etc.).
- Storage: atomic JSON store (`JsonStore`), encrypted token store (`SecretStore`/`TokenStore`), services for profiles, repositories, settings.
- Typed IPC bridge with Zod payload validation; renderer runs sandboxed (`contextIsolation: true`, no `nodeIntegration`).
- App shell: global header (repo/branch/profile/safety badge), sidebar navigation (9 screens), inspector panel.
- Full CRUD screens: Profile Management, Repository Management.
- Git operation screens: Status & Staging, Diff Viewer, Commit Flow (with identity fix action), Remote Operations (fetch/pull/push with confirmation sheet), Branches (create/switch/delete), History (paginated), Safety Center.
- Settings screen: appearance, custom git path, default projects folder.
- Onboarding walkthrough: first-run coach marks with persist/replay.
- Global repo context: header-level repo + branch pickers propagated to all git screens.

**GitHub OAuth (Phases 21–27)**

- GitHub Device Flow authorization: non-blocking connect flow, token encrypted at rest, access token never crosses to renderer.
- GitHub API client: resolves `GitHubAccount` (login, name, primary-verified email, avatar) from an access token.
- "Connect GitHub" UI with live `authorized` / `error` / `idle` states; disconnect and profile badge.
- Token-based HTTPS push via `GIT_ASKPASS`; identity verified against linked `GitHubAccount`.

**AI Connections (Phases 28–39)**

- AI connection manager: multi-provider (OpenAI, Anthropic, Ollama, custom HTTP), encrypted credential store, adapter registry.
- Context builder with redaction (strips secrets from diffs and messages before sending).
- Smart Commit Assistant, Change Review Assistant, Safety Copilot, Push Brief, History Intelligence, Repo Onboarding Assistant, Failure Explainer.
- Connection templates, import/export, team handoff.
- Allowlist-only agentic proposals (file writes only, preview-gated, never auto-apply).

**AI Chat Redesign (Phases 52–55a)**

- Tabbed right panel with general-purpose chat and slash-command router (`/commit`, `/review`, `/push-brief`, etc.).
- AI settings simplification: paste-key-and-go setup.

**Client Branch Access (Phases 56–59)**

- Push policy per repository: `unrestricted` or `branchScoped` modes, allowed/blocked glob patterns, expected remote owner/repo/GitHub actor, suggested branch prefix.
- Safety engine extended with five new push-policy issue codes.
- Push Policy editor in Repositories screen; Branch Access block in push sheet; Safety Center card; branch badge on Branches screen.

**Distribution & Release (Phases 40–42, 45)**

- `npm run dist` builds unsigned installers for the host OS; `npm run dist:dir` builds the unpacked smoke build.
- App icons: `icon.icns` (macOS), `icon.ico` (Windows, multi-resolution), `icon.png` (Linux 1024×1024).
- macOS: DMG with drag-to-Applications layout. Windows: NSIS per-user installer with desktop+start-menu shortcuts. Linux: AppImage + `.deb` with desktop entry (`Development` category).
- GitHub Actions release workflow: tag/version guard, three-OS matrix (macOS/Windows/Linux), `npm test` gate, publishes a draft GitHub Release; signing secrets optional (absent → unsigned build, never a failure).

**Generative UI Blocks (Phases 60–62)**

- GenUI block contracts and store; Review Findings, Commit Draft, and free-text model-chosen blocks rendered in the chat panel.

**Agentic DX (DX-0–DX-5)**

- Docs reconciliation, executable guardrails (hooks + `settings.json`), slash commands, subagent reviewers, AI evals, agent-agnostic shareability.
