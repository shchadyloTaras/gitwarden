---
description: 'Scaffold a new phase: read its plan section and prompt, check previous phase gate, show Goal/Tasks/Exit'
argument-hint: '<phase-number-or-DX-N>'
allowed-tools: Read, Bash(grep*), Bash(git log*)
---

`$ARGUMENTS` is the phase number or DX step to start (e.g. `56`, `DX-3`).

## Step 1 — Confirm the previous phase gate

Read `docs/progress-log.md`. Find the Phase Checklist entry for the phase immediately before `$ARGUMENTS`.

For product phases: the previous phase is `N-1`. For DX steps: the previous step is `DX-(N-1)`.

Check that its checklist box is `[x]` and that a Progress Log entry exists for it.

If the previous phase is NOT ✅, STOP and report:

```
Previous phase gate not met. Check docs/progress-log.md and complete the previous phase first.
```

Do not proceed.

## Step 2 — Identify the owning plan file

Use `AGENTS.md` "Reference docs" section to map the phase number to its plan + prompts file:

| Phase range | Plan file                                 | Prompts file                                   |
| ----------- | ----------------------------------------- | ---------------------------------------------- |
| 0–20        | `docs/plans/gitwarden-plan.md`            | `docs/prompts/phase-prompts.md`                |
| 21–27       | `docs/plans/github-oauth-plan.md`         | `docs/prompts/github-oauth-prompts.md`         |
| 28–39       | `docs/plans/ai-integration-plan.md`       | `docs/prompts/ai-integration-prompts.md`       |
| 40–45       | `docs/plans/distribution-release-plan.md` | `docs/prompts/distribution-release-prompts.md` |
| 46–51       | `docs/plans/landing-page-plan.md`         | `docs/prompts/landing-page-prompts.md`         |
| 52–55a      | `docs/plans/ai-chat-redesign-plan.md`     | (inline)                                       |
| 56–59       | `docs/plans/client-branch-access-plan.md` | `docs/prompts/client-branch-access-prompts.md` |
| 60–62       | `docs/plans/genui-blocks-plan.md`         | `docs/prompts/genui-blocks-prompts.md`         |
| DX-0–DX-6   | `docs/plans/agentic-dx-plan.md`           | `docs/prompts/dx-execution-prompts.md`         |

## Step 3 — Read the plan section and prompts

Read the matching section from the plan file for phase `$ARGUMENTS`.
Read the matching prompt from the prompts file for phase `$ARGUMENTS`.

## Step 4 — Output the phase brief

```
### Phase <N> — <name>

**Gate:** previous phase ✅ (confirmed from docs/progress-log.md)
**Plan section:** <plan file> §<section heading>
**Prompt file:** <prompts file>

**Goal:** <from plan>

**Tasks:**
<from plan, as a list>

**Exit criteria:**
<from plan, as a list>

**Architecture rules to watch:**
<list the relevant AGENTS.md rules for this phase's scope — cite by rule number and name only:>
- Rule #1 (pure core) — if touching src/core/
- Rule #2 (GitRunner only) — if touching git process invocation
- Rule #3 (array args) — if adding git commands
- Rule #4 (--local only) — if touching git config
- Rule #5 (no secrets logged) — if touching storage or IPC
- Rule #6 (destructive behind confirmation) — if adding destructive ops
- Rule #7 (AI advisory only) — if touching AI features
```

Omit rules that are clearly irrelevant to the phase's scope.
