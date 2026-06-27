#!/usr/bin/env bash
# PreToolUse on Bash: enforces the phase commit gate.
# AGENTS.md: "do not commit until docs/progress-log.md is written and staged."
# Bypass: GITWARDEN_SKIP_LOG_GATE=1 (for WIP/fixup commits that are not phase commits).
# Fail-open on any internal error (exit 0) per agentic-dx-plan.md §3 rule 2.

INPUT=$(cat 2>/dev/null) || exit 0

# Honour bypass for WIP / non-phase commits
[ "${GITWARDEN_SKIP_LOG_GATE:-0}" = "1" ] && exit 0

# Extract the bash command
CMD=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    pass
" <<< "$INPUT" 2>/dev/null) || exit 0

# Only act on git commit commands (the 'if' field pre-filters, but defence in depth)
case "$CMD" in
    *"git commit"*) ;;
    *) exit 0 ;;
esac

# Check the staged tree — docs/progress-log.md must be present
STAGED=$(git diff --cached --name-only 2>/dev/null) || exit 0

if printf '%s' "$STAGED" | grep -q 'docs/progress-log.md'; then
    exit 0
fi

printf 'BLOCKED — AGENTS.md phase workflow: docs/progress-log.md is not staged.\n' >&2
printf 'Write the Progress Log entry, tick the checklist box, and stage the file before committing.\n' >&2
printf 'To bypass for WIP/fixup commits: GITWARDEN_SKIP_LOG_GATE=1 git commit ...\n' >&2
exit 2
