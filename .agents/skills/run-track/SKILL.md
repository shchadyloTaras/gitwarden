---
name: run-track
description: 'Run a registered GitWarden feature track phase by phase with gates, reviews, logs, and local commits. Use when a user names a feature slug in this repository, optionally with --step.'
---

# GitWarden: Run Track

Use this project-local Codex skill only in this GitWarden repository.

1. Read `AGENTS.md`, `docs/plans/gitwarden-plan.md`, `docs/progress-log.md`, and
   `.claude/skills/run-track/SKILL.md` completely before any implementation or Git action. Read
   every nested source skill it requires before performing that step.
2. Treat the user-supplied feature slug and optional `--step` as the source skill's `$ARGUMENTS`.
   Follow its resolution, entry gate, phase loop, reviewer, validation, evaluation, log, commit,
   checkpoint, stop-point, and summary rules exactly.
3. When the source refers to `/new-phase`, `/verify-phase`, `/log-phase`, or `/commit-phase`, read
   the matching `.claude/skills/<name>/SKILL.md` and carry out its documented procedure with Codex
   tools; do not assume those are Codex slash commands.
4. Stop on red, ambiguity, an unresolved blocking review finding, eval failure, or a plan stop
   point. With `--step`, pause after each checkpoint and wait for the user's explicit `continue`.
5. Keep one local commit per phase. Use separate staging and commit calls when the project hook
   requires it, use the current Codex agent identity in commit trailers, and never push.
6. Never edit, move, or delete `.claude/skills/**`. Preserve unrelated worktree changes; ask the
   user when a safe staged set cannot be established.
