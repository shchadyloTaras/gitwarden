#!/usr/bin/env bash
# Codex PreToolUse hook. It is the native counterpart of the Claude hook and
# fails open if it cannot inspect the request.

INPUT=$(cat 2>/dev/null) || exit 0

CMD=$(python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    tool_input = data.get('tool_input') or {}
    command = tool_input.get('command') or (tool_input.get('args') or {}).get('command')
    command = command or data.get('command') or (data.get('args') or {}).get('command') or ''
    print(command)
except Exception:
    pass
" <<< "$INPUT" 2>/dev/null) || exit 0

if printf '%s' "$CMD" | grep -qE 'git[[:space:]].*config.*--(global|system)'; then
    printf 'BLOCKED — AGENTS.md permits only repo-local Git configuration.\n' >&2
    printf 'Use: git config --local <key> <value>\n' >&2
    exit 2
fi

exit 0
