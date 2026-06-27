---
description: 'Run a whole feature track phase-by-phase: new-phase → implement → review → verify → eval → log → commit. Stops on any failure, ambiguity, or plan stop-point. Never pushes.'
argument-hint: '<feature-slug> [--step]'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git*), Bash(npm*), Bash(npx*), Task
---

`$ARGUMENTS` is a feature slug (e.g. `client-branch-access`) optionally followed by `--step`.

This command drives an entire feature track to completion, one phase at a time, by
orchestrating the four phase commands you already have — `/new-phase`, `/verify-phase`,
`/log-phase`, `/commit-phase` — plus the subagent reviewers and AI evals. It is a wrapper:
the four command files in `.claude/commands/` are the **source of truth** for each step;
follow them exactly. This command only adds the loop, the gates between phases, and the
stop conditions.

## HARD RULES — read these first, they govern every step below

1. **One commit per phase.** Never batch two phases into a single commit. Each pending phase
   gets its own `/log-phase` entry and its own `Phase N: <name>` commit.
2. **Stop on red — never advance past a failing phase.** Do not start phase N+1 if phase N's
   `/verify-phase` gate is ❌, a reviewer returns a blocking FINDING you cannot confidently fix,
   or `npm run eval` fails. STOP and report which gate failed.
3. **Never guess on ambiguity; never make a destructive/irreversible choice silently.** If a
   genuine design decision, an ambiguity not resolved by the plan, or any destructive/irreversible
   action (data loss, force-push, history rewrite, deleting user files) arises → STOP and ask the
   user. Do not pick a default and proceed.
4. **Never `git push`** — under any circumstance, even if asked mid-run. Pushing is always a
   separate, explicit, manual step.
5. **Separate stage and commit calls.** The `commit-needs-log.sh` PreToolUse hook blocks any
   Bash call whose text contains `git commit` unless `docs/progress-log.md` is already staged —
   and it inspects the _whole_ command string, so a combined `git add … && git commit …` is
   blocked. Always stage (including `docs/progress-log.md`) in ONE Bash call that contains **no**
   `git commit`, then run `git commit` in a SEPARATE Bash call.
6. **Respect all 7 invariants** (the hooks enforce them anyway): pure `src/core/`; git only via
   `GitRunner`; git args as arrays never strings; git config `--local` only; never log secrets;
   destructive/remote actions behind confirmation; AI advisory-only (never triggers git actions).

If any hard rule and a plan instruction appear to conflict, STOP and ask — do not resolve it yourself.

---

## RESOLVE — figure out the track, its pending phases, and the gate

### 1. Map the slug to its plan + prompts files

The repo names feature files by slug: plan = `docs/plans/<slug>-plan.md`,
prompts = `docs/prompts/<slug>-prompts.md` (some tracks have inline prompts instead).
Confirm the pair against the **"Reference docs"** section of `AGENTS.md` — that section is the
authoritative list. If the slug does not match exactly one plan file there, STOP and report the
candidates you found; do not guess which track the user meant.

### 2. Collect the still-pending phases

Read `docs/progress-log.md` → **Phase Checklist**. Find the feature's section (its heading names
the plan file resolved in step 1) and read its phase range.

- Collect every phase in that range whose box is `[ ]` (pending), in **ascending order**.
- Skip any phase already `[x]` (done) — never re-run a completed phase.
- If **no** phase in the range is pending, report `Track already complete` and **STOP**.

### 3. Confirm the entry gate

Identify the phase immediately **before** the first pending phase (it may belong to a different
track — e.g. for `client-branch-access` the first pending phase is 56 and the phase before it is
55a in the AI Chat Redesign track). That preceding phase must show its box `[x]` **and** a
Progress Log entry with `Exit criteria: ✅` in `docs/progress-log.md`.

If the gate phase is not ✅, **STOP** and report:

```
Track gate not met: <gate-phase> must be ✅ in docs/progress-log.md before <slug> can start.
```

Then print the resolved plan, before entering the loop:

```
Track: <slug>
Plan:    docs/plans/<slug>-plan.md
Prompts: docs/prompts/<slug>-prompts.md  (or "inline")
Pending phases: <comma-separated list>
Entry gate:     <gate-phase> ✅
Stop points:    <any phases the plan flags as stop points, see LOOP step i>
```

---

## LOOP — for each pending phase N, in ascending order

### a. NEW-PHASE

Follow `.claude/commands/new-phase.md` for phase N: confirm the previous-phase gate, identify the
owning plan file, read the plan section and the matching prompt, and output the Goal / Tasks /
Exit-criteria brief. If `/new-phase` refuses (gate not met), **STOP** — do not improvise around it.

### b. IMPLEMENT

Write the code for phase N following the plan section, the phase prompt, and the AGENTS.md
architecture rules (build logic-first; keep `src/core/` pure; all git through `GitRunner`; git
args as arrays; `--local` config only). If — and only if — a genuine design decision, an ambiguity
the plan does not unambiguously settle, or any destructive/irreversible choice arises, **STOP and
ask the user** (HARD RULE 3). Do NOT guess.

### c. REVIEW (conditional — maker ≠ checker)

Inspect the diff for this phase (`git diff` + `git status`) and invoke reviewers based on what it
touched:

- Touched `src/core/**` → invoke the **core-purity-reviewer** subagent on the changed files.
- Touched `src/main/git/**`, `src/main/security/**`, `src/main/ai/**`, or IPC (preload/bridge) →
  invoke the **safety-reviewer** subagent on the diff.
- Touched both → invoke both (in parallel).
- UI-only changes → neither is required.

If a reviewer returns a blocking `FINDING`, fix it and re-review the affected files. If the finding
cannot be confidently fixed, **STOP** and report the finding verbatim. Do not proceed with an
open blocking finding.

### d. VERIFY

Follow `.claude/commands/verify-phase.md`. Use `/verify-phase --ui` (which adds `npm run e2e`) if
this is a UI phase; `/verify-phase` otherwise. If the gate prints **GATE FAIL**, **STOP**, report
the failing step with its output, and do **not** proceed to the next phase (HARD RULE 2).

### e. EVAL (conditional)

If this phase touched AI logic (`src/core/ai/**` or `src/main/ai/**`), run:

```bash
npm run eval
```

If it fails, **STOP** and report. (For a phase that adds a brand-new AI capability, the golden
fixture for that capability must exist before this passes — see WORKFLOW.md DX-4.)

### f. LOG

Follow `.claude/commands/log-phase.md` for phase N: append the Progress Log entry (newest last,
exact format, real Vitest counts), tick the phase's checklist box `[ ]`→`[x]`, and re-derive the
affected **Feature Track Status** row. `/log-phase` must NOT commit.

### g. COMMIT

Follow `.claude/commands/commit-phase.md` for phase N. Because of HARD RULE 5, do this in two
separate Bash calls:

1. One Bash call with **no** `git commit` in it — stage everything including the updated
   `docs/progress-log.md` (e.g. `git add -A`).
2. A **separate** Bash call that runs `git commit` with the exact subject `Phase N: <name>`
   (or `DX-N: <name>` for DX steps), a one-line body, and the
   `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.

Never `git push` (HARD RULE 4).

### h. CHECKPOINT

Print exactly one line:

```
✅ Phase N <name> committed <short-hash>. Next: <N+1 or done>.
```

### i. STOP-POINT

When reading phase N's plan section (step a), check whether the plan flags N as a stop point —
phrases like **"safe stop point"**, **"feature-complete stop point"**, or
**"recommended MVP stop point"** in the phase heading or its body. If phase N is a stop point,
**STOP after its commit** and report — even if later phases remain in the pending list. The user
decides whether to continue past a stop point.

### j. STEP MODE

If `$ARGUMENTS` contained `--step`, pause after each phase's checkpoint (step h) and wait for the
user to say `continue` before starting the next phase's step a. Without `--step`, proceed straight
to the next pending phase (subject to all stop conditions above).

---

## FINISH

When every pending phase has been committed (or a stop-point was hit), print a summary:

```
Track <slug> — run complete.

| Phase | Name | Commit | Tests |
| ----- | ---- | ------ | ----- |
| N     | …    | <hash> | Vitest x/x [+ e2e y/y] |
| …     | …    | …      | … |

Stopped at: <stop-point phase / all pending phases done>
Next: <next phase in this track, or next track per AGENTS.md build order>
```

Never push. The run ends here; pushing remains a separate, explicit manual step.
