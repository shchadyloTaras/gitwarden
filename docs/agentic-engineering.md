# How GitWarden was built (Agentic Engineering)

GitWarden was built by directing AI agents **engineeringly**, not by vibecoding.

## Context engineering

- `AGENTS.md` is the single source of truth for agents (loaded via `@AGENTS.md` in `CLAUDE.md`).
- Hard invariants: `src/core/` is pure (no `fs`/`electron`/`child_process`), all git runs through one `GitRunner`, IPC is validated with Zod.
- The Phase Checklist in `docs/progress-log.md` is authoritative; every other status is a derived view.

## Loops, not step-by-step prompting

- Each phase runs through custom skills: `new-phase → implement → verify-phase → review → log-phase → commit-phase`, orchestrated by `run-track`.
- A phase is not closed until its exit criteria are green.

## Maker ≠ checker

- Every diff is reviewed by a separate sub-agent: `.claude/agents/core-purity-reviewer.md` (core purity) and `.claude/agents/safety-reviewer.md` (security + AI advisory boundary).
- CodeRabbit provides an external AI review pass on pull requests.

## Verification

- 645 Vitest unit/integration tests (green), evals in `tests/evals/`, 29 Playwright e2e against real temp git repos — all offline.
- Logic-first: core + safety shipped green before any UI.

## Specs upfront (SDD)

- Plans in `docs/plans/`, per-phase prompts in `docs/prompts/`, decisions as MADR ADRs in `docs/adr/`, threat model in `SECURITY.md`.

Shipped to `v0.2.0`, with a live landing page.
