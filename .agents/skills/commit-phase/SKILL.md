---
name: commit-phase
description: 'Create the canonical local commit for a verified GitWarden phase. Use after tests are green and the current phase progress-log entry and checklist update already exist in this repository.'
---

# GitWarden: Commit Phase

Use this project-local Codex skill only in this GitWarden repository.

1. Read `AGENTS.md`, `docs/plans/gitwarden-plan.md`, `docs/progress-log.md`, and
   `.claude/skills/commit-phase/SKILL.md` completely before staging anything.
2. Treat the user-supplied phase and name as the source skill's `$ARGUMENTS`. Follow its test,
   progress-log, checklist, message, and trailer gates exactly.
3. Stage and commit in separate command calls whenever the project hook requires it. Never bypass a
   red test, a missing current-phase log entry, or an unchecked checklist box.
4. Commit locally only; never push. If the source shows Claude's trailer as an example, use the
   current Codex agent identity as required by `AGENTS.md`.
5. Never edit, move, or delete `.claude/skills/**`.

Stop at any failed gate and report the evidence instead of making a partial commit.
