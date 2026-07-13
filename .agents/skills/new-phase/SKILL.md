---
name: new-phase
description: 'Prepare the next GitWarden phase by checking its gate and producing its approved brief. Use when a user asks to start or inspect a numbered phase or DX step in this repository.'
---

# GitWarden: New Phase

Use this project-local Codex skill only in this GitWarden repository.

1. Read `AGENTS.md`, `docs/plans/gitwarden-plan.md`, and
   `.claude/skills/new-phase/SKILL.md` completely before acting.
2. Map the user-supplied phase number or DX step to the source skill's `$ARGUMENTS`. Follow its
   gate check, plan/prompt resolution, and exact phase-brief output contract.
3. Read every resolved plan and prompt. Do not implement, log, commit, or push merely because this
   skill was invoked; it prepares the phase unless the user separately asks for later workflow.
4. Never edit, move, or delete `.claude/skills/**`. If the source names another slash command,
   read its project skill file and apply its documented procedure instead of assuming a Codex slash
   interface.

Stop if the previous phase gate is not green or the source workflow directs a stop.
