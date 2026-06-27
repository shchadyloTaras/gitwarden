# Changelog

All notable changes to GitWarden are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-06-27

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

[0.1.0]: https://github.com/shchadyloTaras/gitwarden/releases/tag/v0.1.0
