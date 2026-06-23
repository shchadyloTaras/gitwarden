# AGENT.md — Operating Guide for GitWarden

How an AI agent should work on this repository. Pairs with `CLAUDE.md` (project facts) and `docs/gitwarden-plan.md` (the full plan).

## Mission

Build GitWarden phase by phase, in dependency order, keeping every step **locally verifiable**. The agent must be able to prove each phase works by running tests itself — not by asking a human to click.

## Workflow per phase

1. **Read** the matching prompt in `docs/phase-prompts.md`, the plan's phase section, and the relevant Appendix (A–F) in the plan.
2. **Check the gate** — confirm the previous phase's Exit criteria are ✅ in `CLAUDE.md`. Do not start a phase before its dependencies are done.
3. **Implement** following the Architecture rules in `CLAUDE.md`.
4. **Verify** by running the phase's tests (`npm test` / `npm run e2e`). A phase is not done until its Exit criteria tests are green.
5. **Log progress** — append an entry to the `## Progress Log` in `CLAUDE.md` and tick the phase in the `## Phase Checklist`.
6. **Commit** all changes once exit criteria are met: `git add -A && git commit -m "Phase N: <name>"` (with a one-line body and the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer). Commit only on green; **do not push** unless the user explicitly asks.
7. **Stop and report** the test output honestly. If tests fail or a step was skipped, say so.

## Build order (dependency-driven)

`0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18`

Logic (2–5) and infra (6–7) are built and fully tested before any UI (8+), so the engine is verified headlessly first.

## Hard rules (repeat of the critical ones)

- `src/core/` stays pure (no node/electron/DOM) — it must run under plain Vitest.
- Git only via `GitRunner` using `execFile` + args array. Never a shell, never string interpolation.
- Renderer is sandboxed; renderer ↔ main only through the typed, Zod-validated preload bridge.
- Never log secrets. Confirm destructive/remote actions; warn distinctly on irreversible ones.
- Tests must run **offline**: create real git repos in a temp dir as fixtures; use a local bare repo as the "remote" for push e2e.

## Verification expectations

- **Logic phases (2–7):** Vitest unit + integration green; the Safety Engine has full-matrix coverage.
- **UI phases (8–18):** Playwright drives the real Electron app headlessly against fixture repos and asserts behavior (e.g. after commit, `git log` in the fixture shows the right author).
- Report actual command output. Do not claim a phase passes without showing the test result.

## What not to do

- Don't put business logic in React components or in the git wrapper — it belongs in `src/core/`.
- Don't add features outside the current phase's scope (see plan §9 Non-goals).
- Don't introduce token auth in MVP (deferred — model-only).
- Don't change global git config — only `--local`.
- Don't skip the Progress Log update; the log is how state survives across sessions.
