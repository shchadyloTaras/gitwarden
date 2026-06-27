# AGENTS.md — GitWarden

Shared instructions for AI coding agents working on this repo. Claude Code loads this via `@AGENTS.md` in `CLAUDE.md`; other agents (e.g. Codex) read it directly. Read this and `docs/plans/gitwarden-plan.md` before working.

## Agent instruction files

`AGENTS.md` is the shared source of truth for coding-agent instructions in this repo. Keep tool-specific instruction files thin and point them here instead of duplicating project rules.

- **Claude Code:** `CLAUDE.md` should contain only `@AGENTS.md`.
- **Before working:** read the full plan in `docs/plans/gitwarden-plan.md`.
- **Status & history:** the Phase Checklist and per-phase Progress Log live in `docs/progress-log.md`. Keep them out of tool-specific instruction files; update the progress log at the end of each phase.
- **Single source of truth for completion:** the **Phase Checklist** in `docs/progress-log.md` is authoritative for "what is done." Every other place that restates completion — the Feature Track Status table, the Build order below, WORKFLOW.md's "Current level", and any `Status:` header in `docs/plans/` — is a **derived view**. When you tick a checklist box you MUST re-derive the affected views in the same change; if a view ever disagrees with the checklist, the checklist wins.
- **Commit trailers:** use the current agent's identity in the `Co-Authored-By` trailer. Claude Code uses `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Planning:** for large or cross-cutting changes, propose the approach before editing when the agent/tool supports a planning mode.
- **Never push** unless explicitly asked; commits stay local by default.

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

## What not to do

- Don't put business logic in React components or in the git wrapper — it belongs in `src/core/`.
- Don't add features outside the current phase's scope (see plan §9 Non-goals).
- Don't change global git config — only `--local`.
- Tests must run **offline**: create real git repos in a temp dir as fixtures; use a local bare repo as the "remote" for push e2e.
- Don't skip the `docs/progress-log.md` update; the log is how state survives across sessions.

## Operating workflow (per phase)

1. **Read** the matching prompt in `docs/prompts/phase-prompts.md` (or `docs/prompts/github-oauth-prompts.md` for the OAuth feature, or `docs/prompts/ai-integration-prompts.md` for the AI Connections feature), the plan's phase section, and the relevant Appendix in the plan.
2. **Check the gate** — confirm the previous phase's Exit criteria are ✅ in `docs/progress-log.md`. Don't start a phase before its dependencies are done.
3. **Implement** following the Architecture rules above.
4. **Verify** by running the phase's tests (`npm test` / `npm run e2e`). A phase is not done until its Exit-criteria tests are green.
5. **Log progress** — append an entry to the Progress Log in `docs/progress-log.md` and tick the phase in its Phase Checklist.
6. **Commit** — only after step 5. **Hard gate:** before staging, confirm a Progress Log entry for _this_ phase exists in `docs/progress-log.md` and its checklist box is ticked. If either is missing, STOP and do step 5 first — **do not commit without the log entry.** Then `git add -A && git commit -m "Phase N: <name>"` with a one-line body and your agent's `Co-Authored-By: … <noreply@anthropic.com>` trailer. Commit only on green; **do not push** unless the user explicitly asks.
7. **Stop and report** the test output honestly. If tests fail or a step was skipped, say so.

## Build order (dependency-driven)

`0→…→20` (MVP) → `21→27` (GitHub OAuth) → `28→39` (AI Connections) → `52→55a` (AI Chat) → `56→59` (Client Branch Access) → `60→62` (GenUI Blocks) → `46→51` (Landing; live at gitwarden.vercel.app) | partial: `40→45` (Distribution; 43–44 open, gated on signing certs) | DX track: `DX-0→DX-6` (complete, agentic-dx-plan.md)

Logic and infra are built and fully tested before any UI, so the engine is verified headlessly first. The built/partial/unbuilt split above is a **derived view** of the Phase Checklist in `docs/progress-log.md` (authoritative) — re-derive it whenever a phase flips to `[x]`; do not hand-pin completion here. Full status: `docs/progress-log.md`.

## Definition of Done (per phase)

Compiles with no TS/ESLint errors in touched files · phase Exit criteria met · logic phases have passing Vitest · UI phases have passing Playwright · new user-facing strings externalized · destructive/remote actions confirmed · **Progress Log entry for this phase written and its checklist box ticked _before_ committing** · all changes _then_ committed as `Phase N: <name>` (commit only on green; push stays manual).

## Git workflow

- **One commit per phase.** Do **not** run `git commit` until the phase's exit criteria are green **and** the `docs/progress-log.md` entry is written and its checklist box ticked — verify both first, so the doc update is part of the commit.
- Message convention: subject `Phase N: <name>`, a one-line body, and the `Co-Authored-By: <Agent> <noreply@anthropic.com>` trailer.
- `git add -A` (the `.gitignore` already excludes `node_modules/`, build output, coverage, secrets).
- **Do not push automatically** — pushing to `origin/main` happens only when the user asks. Intermediate WIP commits within a phase are fine; squash is optional.

## SDD documentation track

After completing any `sdd:*` command, append an entry to `docs/progress-log.md` under a `## Documentation` section (create it if absent) with this format:

```
### <command> — <date>
- Output: <file(s) created or updated>
- Summary: <one line describing what was captured>
```

Example:

```
### sdd:survey gitwarden — 2026-06-27
- Output: docs/architecture-map.md
- Summary: Brownfield scan — mapped Electron+React architecture, module layout, and conventions.
```

This keeps SDD documentation work visible alongside phase progress in the same log.

## Reference docs

- **Full plan:** `docs/plans/gitwarden-plan.md` · **Phase prompts:** `docs/prompts/phase-prompts.md`
- **GitHub OAuth feature:** `docs/plans/github-oauth-plan.md` + `docs/prompts/github-oauth-prompts.md`
- **AI Connections feature:** `docs/plans/ai-integration-plan.md` + `docs/prompts/ai-integration-prompts.md`
- **Distribution & Release:** `docs/plans/distribution-release-plan.md` + `docs/prompts/distribution-release-prompts.md`
- **Landing Page:** `docs/plans/landing-page-plan.md` + `docs/prompts/landing-page-prompts.md`
- **AI Chat Redesign:** `docs/plans/ai-chat-redesign-plan.md`
- **Client Branch Access:** `docs/plans/client-branch-access-plan.md` + `docs/prompts/client-branch-access-prompts.md`
- **Generative UI Blocks:** `docs/plans/genui-blocks-plan.md` + `docs/prompts/genui-blocks-prompts.md`
- **Header Guard Badge:** `docs/plans/header-guard-badge-plan.md` + `docs/prompts/header-guard-badge-prompts.md`
- **Agentic DX:** `docs/plans/agentic-dx-plan.md` + `docs/prompts/dx-execution-prompts.md`
- **SDD migration (transient chore):** `docs/plans/sdd-migration-plan.md` + `docs/prompts/sdd-migration-prompts.md` — a one-off, self-deleting track (steps M0–M6) that converts these `docs/plans/` + `docs/prompts/` files into `docs/features/<slug>/` specs and then removes both folders (including itself). Driven from its prompts file, **not** `/new-phase`; absent from the phase tables; M4 removes this very line before M6 deletes the files.
- **Architecture diagram:** [`docs/architecture/`](docs/architecture/README.md) — core ↔ main ↔ preload ↔ renderer boundaries (PNG + editable `docs/architecture/diagram.excalidraw`)
- **Decisions (ADR):** [`docs/adr/`](docs/adr/README.md) — one MADR file per decision (`DECISIONS.md` is now the `§N`→ADR index) · **Security threat model:** `SECURITY.md`
- **Status, checklist & progress log:** `docs/progress-log.md`
- **Subagent reviewers:** `.claude/agents/core-purity-reviewer.md` (AGENTS.md #1/#4), `.claude/agents/safety-reviewer.md` (SECURITY.md + AI advisory boundary)
