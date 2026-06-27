---
description: 'Append the Progress-Log entry and tick the Phase Checklist for a completed phase'
argument-hint: '<N> <name> — then describe what was built'
allowed-tools: Read, Edit, Bash(date*)
---

`$ARGUMENTS` contains the phase number N, name, and a description of what was built, separated by `—`.
Example: `56 Push Policy Foundations — pure helpers + policy type + 12 unit tests`

## Step 1 — Read the current progress log

Read `docs/progress-log.md` in full. Note:

- The exact format of the most recent Progress Log entry (the template under `## Progress Log`).
- Today's date.
- The current state of the Phase Checklist for phase `$N`.
- The current state of the Feature Track Status table.

## Step 2 — Append the new Progress Log entry

Using the Edit tool, append a new entry at the bottom of `docs/progress-log.md` (after the last existing entry, before EOF). Follow the exact format from the most recent entries:

```
### YYYY-MM-DD — Phase N: <name>

- Built: <what was built, from $ARGUMENTS>
- Files: <added/changed — list key files>
- Tests: <vitest result — exact counts, e.g. "Vitest 525/525 passed">
- Exit criteria: ✅ met / ⚠️ partial (why)
- Notes / follow-ups: <anything worth capturing>
```

For DX steps use `DX-N:` instead of `Phase N:` in the heading.

Do NOT overwrite or reorder past entries.

## Step 3 — Tick the checklist box

Find the Phase Checklist entry for phase `$N` in `docs/progress-log.md`:

```
- [ ] Phase N — <name>
```

or for DX steps:

```
- [ ] DX-N — <name>
```

Change `[ ]` to `[x]` using the Edit tool.

## Step 4 — Re-derive the Feature Track Status table row

Look up which track owns phase `$N`:

| Phase range | Track                  |
| ----------- | ---------------------- |
| 0–20        | MVP Core               |
| 21–27       | GitHub OAuth           |
| 28–39       | AI Connections         |
| 40–45       | Distribution & Release |
| 46–51       | Landing Page           |
| 52–55a      | AI Chat Redesign       |
| 56–59       | Client Branch Access   |
| 60–62       | Generative UI Blocks   |
| DX-0–DX-6   | Agentic DX             |

Count that track's checklist entries:

- All `[x]` → ✅ complete
- None `[x]` → ⬜ not started
- Mix → 🟡 with a note of which are done vs open

Update the affected row in the Feature Track Status table accordingly.

## Step 5 — Do NOT commit

Do not run `git add` or `git commit`. The commit is a separate step — run `/commit-phase` after this.

## Step 6 — Report

Report:

- What was appended to the Progress Log (show the full new entry).
- Which checklist box was ticked.
- The Feature Track Status row that was re-derived (before → after).
