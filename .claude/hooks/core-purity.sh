#!/usr/bin/env bash
# PostToolUse on Edit|Write|MultiEdit: enforces src/core/ purity.
# Enforces AGENTS.md rule #1: "src/core/ is pure — no child_process, fs, electron, or DOM imports."
# Fail-open on any internal error (exit 0) per agentic-dx-plan.md §3 rule 2.

INPUT=$(cat 2>/dev/null) || exit 0

FILE=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    pass
" <<< "$INPUT" 2>/dev/null) || exit 0

# Only enforce for files under src/core/
case "$FILE" in
    *src/core/*) ;;
    *) exit 0 ;;
esac

# grep the actual (already-written) file for forbidden imports
BANNED="child_process|node:child_process|node:fs|'fs'|\"fs\"|electron|window\\.|document\\."
if grep -qE "$BANNED" "$FILE" 2>/dev/null; then
    printf 'BLOCKED — AGENTS.md rule #1 (pure core): forbidden import detected in:\n  %s\n' "$FILE" >&2
    printf 'src/core/ must not import: child_process, fs, electron, or DOM globals (window./document.).\n' >&2
    printf 'Move impure logic to src/main/ and inject it via an interface.\n' >&2
    exit 2
fi

exit 0
