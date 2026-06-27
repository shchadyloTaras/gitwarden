#!/usr/bin/env bash
# Guardrail hook tests for DX-1.
# Usage: bash tests/tooling/guardrails.test.sh
#        npm run test:tooling

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PASS=0
FAIL=0

check() {
    local label="$1" expected="$2" actual="$3"
    if [ "$actual" -eq "$expected" ]; then
        printf 'PASS  %s\n' "$label"
        PASS=$((PASS + 1))
    else
        printf 'FAIL  %s  (expected exit %d, got %d)\n' "$label" "$expected" "$actual"
        FAIL=$((FAIL + 1))
    fi
}

run_hook() {
    local hook="$1" payload="$2"
    printf '%s' "$payload" | bash "$REPO_ROOT/.claude/hooks/$hook" >/dev/null 2>&1
    printf '%d' $?
}

# ────────────────────────────────────────────────────────────────────────────
# no-global-git-config.sh
# ────────────────────────────────────────────────────────────────────────────
echo "── no-global-git-config.sh ──"
HOOK=no-global-git-config.sh

rc=$(run_hook $HOOK '{"tool_name":"Bash","tool_input":{"command":"git config --global user.name Foo"}}')
check "--global user.name blocked" 2 "$rc"

rc=$(run_hook $HOOK '{"tool_name":"Bash","tool_input":{"command":"git config --system core.autocrlf false"}}')
check "--system core.autocrlf blocked" 2 "$rc"

rc=$(run_hook $HOOK '{"tool_name":"Bash","tool_input":{"command":"git config --local user.email me@example.com"}}')
check "--local allowed" 0 "$rc"

rc=$(run_hook $HOOK '{"tool_name":"Bash","tool_input":{"command":"git status"}}')
check "git status allowed" 0 "$rc"

rc=$(run_hook $HOOK '')
check "empty stdin (fail-open)" 0 "$rc"

rc=$(run_hook $HOOK 'not valid json')
check "malformed JSON (fail-open)" 0 "$rc"

# ────────────────────────────────────────────────────────────────────────────
# core-purity.sh
# ────────────────────────────────────────────────────────────────────────────
echo "── core-purity.sh ──"
HOOK=core-purity.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/src/core" "$TMP/src/main/git"

# bad: child_process import in src/core/
printf "import { execFile } from 'child_process';\n" > "$TMP/src/core/bad.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/core/bad.ts\"}}")
check "child_process in src/core/ blocked" 2 "$rc"

# bad: fs import in src/core/
printf "import * as fs from 'fs';\n" > "$TMP/src/core/badfs.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/core/badfs.ts\"}}")
check "'fs' in src/core/ blocked" 2 "$rc"

# bad: electron import in src/core/
printf "import { app } from 'electron';\n" > "$TMP/src/core/badel.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/core/badel.ts\"}}")
check "electron import in src/core/ blocked" 2 "$rc"

# bad: DOM global in src/core/
printf "const el = window.document.getElementById('x');\n" > "$TMP/src/core/baddom.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/core/baddom.ts\"}}")
check "window. in src/core/ blocked" 2 "$rc"

# good: clean src/core/ file
printf "export const safetyCheck = (x: string): boolean => x.length > 0;\n" > "$TMP/src/core/clean.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/core/clean.ts\"}}")
check "clean src/core/ file allowed" 0 "$rc"

# good: execFile in src/main/git/ is allowed (not in src/core/)
printf "import { execFile } from 'child_process';\n" > "$TMP/src/main/git/runner.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/main/git/runner.ts\"}}")
check "child_process in src/main/git/ allowed" 0 "$rc"

# fail-open: malformed JSON
rc=$(run_hook $HOOK 'not json')
check "malformed JSON (fail-open)" 0 "$rc"

# fail-open: empty stdin
rc=$(run_hook $HOOK '')
check "empty stdin (fail-open)" 0 "$rc"

# ────────────────────────────────────────────────────────────────────────────
# execfile-guard.sh
# ────────────────────────────────────────────────────────────────────────────
echo "── execfile-guard.sh ──"
HOOK=execfile-guard.sh
mkdir -p "$TMP/src/main/services" "$TMP/tests/unit"

# bad: execFile in src/main/services/
printf "import { execFile } from 'child_process';\n" > "$TMP/src/main/services/bad.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/main/services/bad.ts\"}}")
check "execFile in src/main/services/ blocked" 2 "$rc"

# bad: spawn in renderer (non-git path)
printf "const p = child_process.spawn('ls');\n" > "$TMP/src/main/services/spawn.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/main/services/spawn.ts\"}}")
check "spawn in src/main/services/ blocked" 2 "$rc"

# good: execFile in src/main/git/ is allowed
printf "import { execFile } from 'child_process';\n" > "$TMP/src/main/git/runner.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/main/git/runner.ts\"}}")
check "execFile in src/main/git/ allowed" 0 "$rc"

# good: test file with execFile allowed
printf "import { execFile } from 'child_process';\n" > "$TMP/tests/unit/runner.test.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/tests/unit/runner.test.ts\"}}")
check "execFile in test file allowed (.test.ts)" 0 "$rc"

# good: clean non-git file
printf "export const foo = () => 'bar';\n" > "$TMP/src/main/services/clean.ts"
rc=$(run_hook $HOOK "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$TMP/src/main/services/clean.ts\"}}")
check "clean non-git file allowed" 0 "$rc"

# fail-open: malformed JSON
rc=$(run_hook $HOOK 'not json')
check "malformed JSON (fail-open)" 0 "$rc"

# fail-open: empty stdin
rc=$(run_hook $HOOK '')
check "empty stdin (fail-open)" 0 "$rc"

# ────────────────────────────────────────────────────────────────────────────
# commit-needs-log.sh
# ────────────────────────────────────────────────────────────────────────────
echo "── commit-needs-log.sh ──"
HOOK=commit-needs-log.sh

# bypass: GITWARDEN_SKIP_LOG_GATE=1 always allows
rc=$(GITWARDEN_SKIP_LOG_GATE=1 run_hook $HOOK '{"tool_name":"Bash","tool_input":{"command":"git commit -m test"}}')
check "bypass env var allows commit" 0 "$rc"

# good: non-commit bash command passes through
rc=$(run_hook $HOOK '{"tool_name":"Bash","tool_input":{"command":"git status"}}')
check "git status passes through" 0 "$rc"

# good: git add passes through
rc=$(run_hook $HOOK '{"tool_name":"Bash","tool_input":{"command":"git add -A"}}')
check "git add passes through" 0 "$rc"

# fail-open: malformed JSON
rc=$(run_hook $HOOK 'not json')
check "malformed JSON (fail-open)" 0 "$rc"

# fail-open: empty stdin
rc=$(run_hook $HOOK '')
check "empty stdin (fail-open)" 0 "$rc"

# Note: the git-commit-without-log-staged test requires live git staging state
# and is validated manually / in the integration context of a real commit attempt.

# ────────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────────
echo ""
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
