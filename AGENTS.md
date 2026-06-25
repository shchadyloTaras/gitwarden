# AGENTS.md — GitWarden

Shared instructions for AI coding agents working on this repo. Claude Code loads this via `@AGENTS.md` in `CLAUDE.md`; other agents (e.g. Codex) read it directly. Read this and `docs/plans/gitwarden-plan.md` before working.

## Project

**GitWarden** — a cross-platform desktop Git GUI focused on **safe multi-account GitHub usage**: prevent committing/pushing with the wrong profile, author name, email, SSH key, or repository. Built around **profiles** (Personal/Work/Client); each repo is assigned to exactly one profile, and the app surfaces identity safety before every commit/push.

## Repository

- GitHub: https://github.com/shchadyloTaras/gitwarden
- Remote (SSH): `git@github.com:shchadyloTaras/gitwarden.git`
- Default branch: `main`
- Local working dir name may differ from the repo name (`git-visual`); the repo is `gitwarden`.

## Stack

- **Electron + TypeScript (strict) + React (Vite)**
- State: Zustand (or context). Validation: Zod. Tests: **Vitest** (logic) + **Playwright** (Electron e2e).
- Git access: Node `child_process.execFile` (args array — **never** a shell).
- Storage: JSON in `app.getPath('userData')` (non-secret) + Electron `safeStorage` (secrets).

## Commands

```bash
npm run dev      # launch the app (Vite renderer + Electron)
npm test         # Vitest — unit + integration
npm run e2e      # Playwright — Electron e2e against fixture repos
npm run lint     # ESLint + Prettier
npm run build    # electron-builder package
```

## Architecture rules (non-negotiable)

- **`src/core/` is pure** — no `child_process`, `fs`, Electron, or DOM imports. Safety Engine, porcelain parser, and types live here so they run under plain Vitest. This is the verifiability backbone.
- All git execution goes through **`GitRunner`** (the only `execFile` caller); controlled env, cancellable, per-repo serialization.
- Renderer has **no Node access**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer ↔ main only via the typed preload bridge; validate IPC payloads with Zod.
- Every service has an interface and is injected so tests can mock it.
- Git args are always an **array**, never string-interpolated; path args after `--`.
- Never log secrets. Destructive/remote actions stay behind confirmation; irreversible ones (`git clean`) get a distinct stronger warning.
- Build **logic-first**: core + git + safety ship with green tests before any UI.

## Operating workflow (per phase)

1. **Read** the matching prompt in `docs/prompts/phase-prompts.md` (or `docs/prompts/github-oauth-prompts.md` for the OAuth feature, or `docs/prompts/ai-integration-prompts.md` for the AI Connections feature), the plan's phase section, and the relevant Appendix in the plan.
2. **Check the gate** — confirm the previous phase's Exit criteria are ✅ in `docs/progress-log.md`. Don't start a phase before its dependencies are done.
3. **Implement** following the Architecture rules above.
4. **Verify** by running the phase's tests (`npm test` / `npm run e2e`). A phase is not done until its Exit-criteria tests are green.
5. **Log progress** — append an entry to the Progress Log in `docs/progress-log.md` and tick the phase in its Phase Checklist.
6. **Commit** all changes once exit criteria are met: `git add -A && git commit -m "Phase N: <name>"` with a one-line body and your agent's `Co-Authored-By: … <noreply@anthropic.com>` trailer. Commit only on green; **do not push** unless the user explicitly asks.
7. **Stop and report** the test output honestly. If tests fail or a step was skipped, say so.

## Build order (dependency-driven)

`0 → 1 → … → 20` (MVP, complete), then GitHub OAuth `21 → 22 → 23 → 24 → 25 → 26 → 27`, then AI Connections `28 → … → 34` (advisory MVP stop) → `35 → 38` add-ons → `39` deferred (agentic, allowlist-only).

Logic and infra are built and fully tested before any UI, so the engine is verified headlessly first. Full status: `docs/progress-log.md`.

## Definition of Done (per phase)

Compiles with no TS/ESLint errors in touched files · phase Exit criteria met · logic phases have passing Vitest · UI phases have passing Playwright · new user-facing strings externalized · destructive/remote actions confirmed · **`docs/progress-log.md` updated and all changes committed** as `Phase N: <name>` (commit only on green; push stays manual).

## Git workflow

- **One commit per phase**, made only after the phase's exit criteria are green and the `docs/progress-log.md` entry is written (so the doc update is part of the commit).
- Message convention: subject `Phase N: <name>`, a one-line body, and the `Co-Authored-By: <Agent> <noreply@anthropic.com>` trailer.
- `git add -A` (the `.gitignore` already excludes `node_modules/`, build output, coverage, secrets).
- **Do not push automatically** — pushing to `origin/main` happens only when the user asks. Intermediate WIP commits within a phase are fine; squash is optional.

## What not to do

- Don't put business logic in React components or in the git wrapper — it belongs in `src/core/`.
- Don't add features outside the current phase's scope (see plan §9 Non-goals).
- Don't change global git config — only `--local`.
- Tests must run **offline**: create real git repos in a temp dir as fixtures; use a local bare repo as the "remote" for push e2e.
- Don't skip the `docs/progress-log.md` update; the log is how state survives across sessions.

## Reference docs

- **Full plan:** `docs/plans/gitwarden-plan.md` · **Phase prompts:** `docs/prompts/phase-prompts.md`
- **GitHub OAuth feature:** `docs/plans/github-oauth-plan.md` + `docs/prompts/github-oauth-prompts.md`
- **AI Connections feature:** `docs/plans/ai-integration-plan.md` + `docs/prompts/ai-integration-prompts.md`
- **Decisions (ADR):** `DECISIONS.md` · **Security threat model:** `SECURITY.md`
- **Status, checklist & progress log:** `docs/progress-log.md`
