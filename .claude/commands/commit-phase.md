---
description: "Commit exactly 'Phase N: <name>' with the project trailer. Refuses on red tests or a missing Progress Log entry. Never pushes."
argument-hint: '<N> <phase name...>'
allowed-tools: Bash(npm test), Bash(git add*), Bash(git commit*), Bash(git status), Read, Bash(grep*)
---

`$ARGUMENTS` must start with the phase number N followed by the phase name. Example: `56 Push Policy Foundations`.

## Step 1 — Verify tests are green

```bash
npm test 2>&1
```

If any test fails (exit code ≠ 0), STOP immediately and report:

```
REFUSED: tests are red. Fix tests first.
```

Do not proceed to staging or committing.

## Step 1b — Gate: Progress Log entry + checklist box

Extract the phase identifier from `$ARGUMENTS`:

- If it starts with a digit, the identifier is `Phase $N` (e.g. `Phase 56`).
- If it starts with `DX-`, the identifier is `DX-$N` (e.g. `DX-2`).

Run both checks:

```bash
grep "### .*$IDENTIFIER:" docs/progress-log.md
grep "\[x\].*$IDENTIFIER" docs/progress-log.md
```

If either grep returns no match, STOP and report:

```
REFUSED: no Progress Log entry for $N. Run /log-phase first.
```

Do NOT stage any files. Do not proceed.

## Step 2 — Stage all files

```bash
git add -A
```

## Step 3 — Commit

Build the commit message:

- Subject: `Phase $N: <rest of $ARGUMENTS after the number>` (for DX steps: `DX-$N: <rest>`)
- Body: one-line summary of what was built in this phase
- Trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`

```bash
git commit -m "$(cat <<'EOF'
Phase $N: <name>

<one-line body>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Step 4 — Report

Print the full commit hash and subject:

```bash
git log -1 --format="%H %s"
```

## Step 5 — Never push

Do NOT run `git push` under any circumstances, even if the user asks within this command.
Pushing is always a separate, explicit manual step.

---

> DX-1 backstop: the `commit-needs-log.sh` PreToolUse hook on `git commit` also enforces the
> Progress-Log gate across ALL commit paths regardless of which command or agent runs the commit.
> If the hook fires, it means the gate above was bypassed — fix the log entry first.
