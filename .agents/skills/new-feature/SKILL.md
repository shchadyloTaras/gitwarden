---
name: new-feature
description: "Plan and register a brand-new GitWarden feature through this repository's canonical workflow. Use when a user asks to plan, scaffold, or register a feature that has no existing plan and prompts."
---

# GitWarden: New Feature

Use this project-local Codex skill only in this GitWarden repository.

1. Read `AGENTS.md`, `docs/plans/gitwarden-plan.md`, and
   `.claude/skills/new-feature/SKILL.md` completely before planning. Read every reference the
   source skill requires.
2. Treat the user request as the source skill's `$ARGUMENTS` and follow its protocol exactly:
   slug confirmation, collision preflight, codebase grounding, decisions, phase decomposition,
   plan review stop, prompts, and every registration item.
3. The `.claude/skills/new-feature/` workflow is the source of truth. Never edit, move, or delete
   any `.claude/skills/**` file; write only planning artifacts and registrations the source
   authorizes.
4. Do not assume Claude slash commands exist in Codex. When the source refers to another project
   skill, read its `.claude/skills/<name>/SKILL.md` and follow the documented procedure with Codex
   tools.
5. After the planning or registration stop point, do not stage, commit, or push unless a later,
   explicitly authorized phase workflow requires it.

Stop whenever the source workflow says to stop, when a collision exists, or when a user decision is
required.
