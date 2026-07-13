---
name: log-phase
description: 'Record a completed GitWarden phase in the progress log and update its derived status. Use after a phase has met its exit criteria and a user asks to log it in this repository.'
---

# GitWarden: Log Phase

Use this project-local Codex skill only in this GitWarden repository.

1. Read `AGENTS.md`, `docs/plans/gitwarden-plan.md`, `docs/progress-log.md`, and
   `.claude/skills/log-phase/SKILL.md` completely before editing.
2. Map the user's phase, name, and build summary to the source skill's `$ARGUMENTS`. Follow its
   append-only log format, checklist update, and derived Feature Track Status calculation exactly.
3. Use actual test results from the current work; never invent counts or mark a phase complete when
   exit criteria are missing.
4. Do not stage, commit, push, or edit `.claude/skills/**`. Committing remains a separate skill
   with its own gates.

Stop if required evidence is unavailable or the source workflow says to stop.
