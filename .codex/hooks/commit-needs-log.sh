#!/usr/bin/env bash
# Codex PreToolUse hook. It enforces the GitWarden phase-commit log gate.
# Fail open on malformed hook input. The prefix bypass is parsed explicitly
# because a pending command's inline environment is not inherited by this hook.

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

[ "${GITWARDEN_SKIP_LOG_GATE:-0}" = "1" ] && exit 0

case "$CMD" in
    *"git commit"*) ;;
    *) exit 0 ;;
esac

if printf '%s' "$CMD" | grep -qE '(^|[[:space:];|&])GITWARDEN_SKIP_LOG_GATE=1([[:space:]]|$).*git[[:space:]]+commit'; then
    exit 0
fi

STAGED=$(git diff --cached --name-only 2>/dev/null) || exit 0

if printf '%s' "$STAGED" | grep -q 'docs/progress-log.md'; then
    exit 0
fi

printf 'BLOCKED — AGENTS.md phase workflow: docs/progress-log.md is not staged.\n' >&2
printf 'Write the Progress Log entry, tick the checklist box, and stage the file before committing.\n' >&2
printf 'For an allowed WIP/fixup bypass: GITWARDEN_SKIP_LOG_GATE=1 git commit ...\n' >&2
exit 2
