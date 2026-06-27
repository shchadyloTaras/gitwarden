#!/usr/bin/env bash
# PreToolUse on Bash: blocks git config --global / --system.
# Enforces AGENTS.md: "only --local git config changes — never --global or --system."
# Fail-open on any internal error (exit 0) per agentic-dx-plan.md §3 rule 2.

INPUT=$(cat 2>/dev/null) || exit 0

CMD=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    pass
" <<< "$INPUT" 2>/dev/null) || exit 0

if printf '%s' "$CMD" | grep -qE 'git[[:space:]].*config.*--(global|system)'; then
    printf 'BLOCKED — AGENTS.md (only --local): git config --global / --system are forbidden.\n' >&2
    printf 'Use repo-scoped config only: git config --local <key> <value>\n' >&2
    exit 2
fi

exit 0
