#!/usr/bin/env bash
# PostToolUse on Edit|Write|MultiEdit: warns when execFile/exec/spawn appears outside src/main/git/.
# Enforces AGENTS.md rule #2: "all git execution goes through GitRunner (the only execFile caller)."
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

[ -z "$FILE" ] && exit 0

# Allow: src/main/git/ is the designated execFile home
case "$FILE" in
    *src/main/git/*) exit 0 ;;
esac

# Allow: build/release tooling under scripts/ (e.g. the electron-builder afterPack codesign hook).
# AGENTS.md #2 governs the app's *git* execution via GitRunner; packaging hooks that shell out to
# codesign/notarytool are not app runtime code and fall outside that rule's scope.
case "$FILE" in
    */scripts/*) exit 0 ;;
esac

# Only scan TypeScript/JavaScript source files — docs/markdown/JSON are never source
case "$FILE" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;  # fall through to the check
    *) exit 0 ;;                            # all other file types are safe
esac

# Allow: test files (they may call execFile to set up real-repo fixtures)
case "$FILE" in
    *.test.ts|*.test.js|*.spec.ts|*.spec.js) exit 0 ;;
esac
case "$FILE" in
    */tests/*|*/test/*|*/__tests__/*) exit 0 ;;
esac

# Check for forbidden spawn patterns
if grep -qE 'execFile|child_process|[^A-Za-z]spawn\(' "$FILE" 2>/dev/null; then
    printf 'BLOCKED — AGENTS.md rule #2 (GitRunner only): execFile/exec/spawn found outside src/main/git/:\n  %s\n' "$FILE" >&2
    printf 'All process spawning must go through GitRunner in src/main/git/.\n' >&2
    exit 2
fi

exit 0
