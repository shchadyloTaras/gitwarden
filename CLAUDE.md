# CLAUDE.md — GitWarden

@AGENTS.md

## Claude Code

The shared project context, architecture rules, and per-phase workflow are imported from `@AGENTS.md` above (loaded automatically every session). This file holds only Claude-specific notes.

- **Before working:** read the full plan in `docs/plans/gitwarden-plan.md`.
- **Status & history:** the Phase Checklist and per-phase Progress Log live in `docs/progress-log.md` — kept out of this file so it stays small ([Claude Code memory docs](https://code.claude.com/docs/en/memory) recommend instruction files under ~200 lines for better adherence). Update that file at the end of each phase.
- **Commit trailer:** `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Plan mode:** prefer it for large or cross-cutting changes — propose before editing.
- **Never push** unless explicitly asked (see the Git workflow in `@AGENTS.md`).

<!-- Maintainer note: keep this file thin. Shared rules go in AGENTS.md; the progress log goes in docs/progress-log.md. This comment is stripped before the file enters Claude's context. -->
