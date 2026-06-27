---
description: 'Run the full phase gate: both tsc projects, vitest, lint, and optionally e2e'
argument-hint: '[--ui]'
allowed-tools: Bash(npx tsc*), Bash(npm run lint), Bash(npm test), Bash(npm run e2e)
---

Run the phase gate in order, stopping on the first failure. Report each step as ✅ or ❌ with the exact last 5 lines of its output.

## Step 1 — tsc node (ALWAYS — the one most often forgotten)

```bash
npx tsc -p tsconfig.node.json --noEmit 2>&1
```

Capture output. If exit code ≠ 0, mark ❌ and STOP. Print last 5 lines.

## Step 2 — tsc web

```bash
npx tsc -p tsconfig.web.json --noEmit 2>&1
```

Capture output. If exit code ≠ 0, mark ❌ and STOP. Print last 5 lines.

## Step 3 — Vitest

```bash
npm test 2>&1
```

Capture output. If exit code ≠ 0, mark ❌ and STOP. Print last 5 lines.

## Step 4 — Lint

```bash
npm run lint 2>&1
```

Capture output. If exit code ≠ 0, mark ❌ and STOP. Print last 5 lines.

## Step 5 — E2E (only when `--ui` argument is present)

If `$ARGUMENTS` contains `--ui`:

```bash
npm run e2e 2>&1
```

Capture output. If exit code ≠ 0, mark ❌. Print last 5 lines.

## Final summary

After all steps complete (or on first failure), print:

```
GATE PASS — all checks green.
```

or

```
GATE FAIL — <list each failed step>.
```

Never run a later step after an earlier one fails.
