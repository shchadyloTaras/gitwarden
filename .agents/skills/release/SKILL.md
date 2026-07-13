---
name: release
description: "Prepare a local GitWarden app release with changelog, version, commit, and tag gates. Use when a user asks for a major, minor, or patch release in this repository."
---

# GitWarden: Release

Use this project-local Codex skill only in this GitWarden repository.

1. Read `AGENTS.md`, `docs/plans/gitwarden-plan.md`, and
   `.claude/skills/release/SKILL.md` completely before modifying version, changelog, Git history,
   or tags.
2. Treat an optional `major`, `minor`, or `patch` argument as the source skill's `$ARGUMENTS`.
   Follow its clean-tree gate, changelog, version, test, commit, and local-tag rules exactly.
3. Never edit, move, or delete `.claude/skills/**`. Keep the release local: never push its commit
   or tag. Use the current Codex agent identity in commit trailers when `AGENTS.md` requires it.

Stop on any failed gate or ambiguity and report evidence before making a release commit or tag.
