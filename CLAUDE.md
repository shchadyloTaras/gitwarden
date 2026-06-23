# CLAUDE.md — GitWarden

Project guidance for Claude Code. Read this and `docs/gitwarden-plan.md` before working.

## Project

**GitWarden** — a cross-platform desktop Git GUI focused on **safe multi-account GitHub usage**: prevent committing/pushing with the wrong profile, author name, email, SSH key, or repository. Built around **profiles** (Personal/Work/Client); each repo is assigned to exactly one profile, and the app surfaces identity safety before every commit/push.

Full plan: `docs/gitwarden-plan.md`. Per-phase prompts: `docs/phase-prompts.md`.

## Repository

- GitHub: https://github.com/shchadyloTaras/gitwarden
- Remote (SSH): `git@github.com:shchadyloTaras/gitwarden.git`
- Default branch: `main`
- Local working dir name may differ from the repo name (`git-visual`); the repo is `gitwarden`.

## Stack

- **Electron + TypeScript (strict) + React (Vite)**
- State: Zustand (or context). Validation: Zod. Tests: **Vitest** (logic) + **Playwright** (Electron e2e).
- Git access: Node `child_process.execFile` (args array — **never** a shell).
- Storage: JSON in `app.getPath('userData')` (non-secret) + Electron `safeStorage` (secrets, deferred).

## Commands

```bash
npm run dev      # launch the app (Vite renderer + Electron)
npm test         # Vitest — unit + integration
npm run e2e      # Playwright — Electron e2e against fixture repos
npm run lint     # ESLint + Prettier
npm run build    # electron-builder package
```

(Scripts are wired in Phase 1; until then they may not exist yet.)

## Architecture rules (non-negotiable)

- **`src/core/` is pure** — no `child_process`, `fs`, Electron, or DOM imports. Safety Engine, porcelain parser, and types live here so they run under plain Vitest. This is the verifiability backbone.
- All git execution goes through **`GitRunner`** (the only `execFile` caller); controlled env, cancellable, per-repo serialization.
- Renderer has **no Node access**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer ↔ main only via the typed preload bridge; validate IPC payloads with Zod.
- Every service has an interface and is injected so tests can mock it.
- Git args are always an **array**, never string-interpolated; path args after `--`.
- Never log secrets. Destructive/remote actions stay behind confirmation; irreversible ones (`git clean`) get a distinct stronger warning.
- Build **logic-first**: core + git + safety (phases 2–5) ship with green tests before any UI.

## Definition of Done (per phase)

Compiles with no TS/ESLint errors in touched files · phase Exit criteria met · logic phases have passing Vitest · UI phases have passing Playwright · new user-facing strings externalized · destructive/remote actions confirmed · **Progress Log updated and all changes committed** as `Phase N: <name>` (commit only on green; push stays manual).

## Git workflow

- **One commit per phase**, made only after the phase's exit criteria are green and the Progress Log entry is written (so the doc update is part of the commit).
- Message convention: subject `Phase N: <name>`, a one-line body, and the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- `git add -A` (the `.gitignore` already excludes `node_modules/`, build output, coverage, secrets).
- **Do not push automatically** — pushing to `origin/main` happens only when the user asks. Intermediate WIP commits within a phase are fine; squash is optional.

## Phase Checklist

- [x] Phase 0 — Foundations & Decisions
- [ ] Phase 1 — Repo & Toolchain Scaffold
- [ ] Phase 2 — Core Types & Domain Models
- [ ] Phase 3 — Git Execution Core (GitRunner)
- [ ] Phase 4 — Porcelain Parser & Status
- [ ] Phase 5 — Safety Engine
- [ ] Phase 6 — Storage Layer
- [ ] Phase 7 — IPC Bridge & Preload
- [ ] Phase 8 — App Shell & Navigation
- [ ] Phase 9 — Profile Management
- [ ] Phase 10 — Repository Management
- [ ] Phase 11 — Status & Staging UI
- [ ] Phase 12 — Diff Viewer
- [ ] Phase 13 — Commit Flow
- [ ] Phase 14 — Remote Operations
- [ ] Phase 15 — Branches
- [ ] Phase 16 — History
- [ ] Phase 17 — Safety Center
- [ ] Phase 18 — Settings, Polish & Hardening

## Progress Log

> Append a new entry at the bottom after each phase. Newest last. Do not rewrite past entries.
> Format:
> ```
> ### YYYY-MM-DD — Phase N: <name>
> - Built: <what>
> - Files: <added/changed>
> - Tests: <vitest/playwright result>
> - Exit criteria: ✅ met / ⚠️ partial (why)
> - Notes / follow-ups: <anything>
> ```

<!-- progress entries go below this line -->

### 2026-06-23 — Phase 0: Foundations & Decisions
- Built: Foundational decisions and threat-model docs (no app code).
- Files: added `DECISIONS.md`, `SECURITY.md`; updated `CLAUDE.md` (checklist + log).
- Tests: n/a (docs-only phase).
- Exit criteria: ✅ met — git location + missing-git UX (all 3 OSes), SSH model + env forwarding (incl. Windows agent), token-deferred decision, SECURITY.md, concurrency/cancellation rules.
- Notes / follow-ups: Min versions set (Node ≥20, Electron ≥30, git ≥2.30). Hook sandboxing deferred; risk documented in SECURITY.md §7.
