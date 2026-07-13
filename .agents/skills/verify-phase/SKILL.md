---
name: verify-phase
description: 'Run the canonical GitWarden phase validation gate, including optional UI checks. Use when a user asks to verify a phase, run its gate, or validate phase work in this repository.'
---

# GitWarden: Verify Phase

Use this project-local Codex skill only in this GitWarden repository.

1. Read `AGENTS.md`, `docs/plans/gitwarden-plan.md`, and
   `.claude/skills/verify-phase/SKILL.md` completely before running checks.
2. Treat any flag, including `--ui`, as the source skill's `$ARGUMENTS`. Run its checks in the
   required order, stop on the first failure, and report exactly the evidence it requires.
3. Preserve the source workflow's difference between the standard gate and the UI/e2e gate. Do not
   claim a green gate if a command was skipped.
4. Never edit `.claude/skills/**` or push as part of verification.

Use available Codex command tools for the checks; Claude-specific `allowed-tools` metadata does not
remove any validation requirement.
