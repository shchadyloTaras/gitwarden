---
name: new-feature
description: Use when planning a brand-new GitWarden feature from a short idea, before any phase work begins — the feature is not yet in docs/progress-log.md's Phase Checklist and needs its docs/plans + docs/prompts pair. Triggers on "plan a feature", "scaffold a feature", "new feature plan", or /new-feature. GitWarden-specific.
---

# new-feature

## Overview

Turns a one-line feature idea into GitWarden's house-style **plan + prompts** pair, grounded in the
real codebase, and **registers it everywhere `/run-track` looks** so the feature is immediately
drivable phase-by-phase. This is the GitWarden analogue of `sdd:specify` — it writes the artifacts
**and** runs the registration "sync-hooks."

**Core principle:** a feature plan is only useful if (a) its code grounding is *real* and (b) it's
registered in *every* place the workflow reads. Both are easy to fake and easy to under-count —
this skill makes both verifiable.

## When to use

- The user wants to plan a new feature (not implement it) — "plan/scaffold a feature", `/new-feature`.
- The feature is **not yet** in `docs/progress-log.md`'s Phase Checklist.

**When NOT to use:** the feature already exists (extend its plan by hand) · you're starting an
already-planned phase (use `/new-phase <N>`) · driving an existing track (use `/run-track <slug>`).

## Protocol

Follow in order. **Stop at step 7 for review before touching any shared doc.**

1. **Derive the slug** (kebab-case) from the idea → confirm with the user before any write.
2. **Pre-flight collision check.** STOP if the slug already appears in `docs/plans/`, `AGENTS.md`
   Reference docs, or a Phase-Checklist feature heading. → `references/registration-checklist.md`.
3. **Orientation pack.** Read `AGENTS.md`, the `## Phase Checklist` section of
   `docs/progress-log.md` (→ HEAD phase number), and the **latest existing plan + prompts pair**
   (the one owning the highest phase) as the live style exemplar (hybrid: skeleton + exemplar).
4. **Ground in the code (inline).** grep/glob for the feature's surface area, **Read** the
   candidate files, and collect real `file:line` references. **Anti-hallucination rule below.**
   Escalate to the `Explore` subagent only for large cross-module features.
5. **Interview (adaptive, ≤4 questions, batched `AskUserQuestion`).** Ask only what you can't infer
   from idea + code. **Floor — always resolve:** the product boundary (what it deliberately does
   NOT do) and the non-goals / scope edges.
6. **Propose the phase decomposition** (logic-first → UI; numbered from HEAD+1) → user confirms.
   → `references/decomposition-heuristics.md`.
7. **Write the plan** (`docs/plans/<slug>-plan.md`, English, per `references/plan-skeleton.md`) →
   **STOP. Present it for review.** Do not proceed until the user approves.
8. **On approval:** write the prompts (`references/prompts-skeleton.md`) **and do the full 8-item
   registration** (`references/registration-checklist.md`).
9. **Report** which of the 8 items you wrote/edited. **Do not commit. Never push.**

## The 8-item registration (the part that's easy to under-count)

`/run-track` and `/new-phase` resolve a feature through all of these. The full contract with exact
anchors + templates lives in **`references/registration-checklist.md`** — follow it literally.

| # | Target |
|---|--------|
| 1–2 | NEW `docs/plans/<slug>-plan.md` + `docs/prompts/<slug>-prompts.md` |
| 3 | `docs/progress-log.md` → Phase Checklist (feature heading + `[ ]` rows) |
| 4 | `docs/progress-log.md` → Feature Track Status (row, `⬜`) |
| 5 | `AGENTS.md` → Reference docs (bullet) |
| 6 | `AGENTS.md` → Build order (extend chain) |
| 7 | `.claude/commands/new-phase.md` → phase-range→plan table (row) |
| 8 | `.claude/commands/log-phase.md` → phase-range→Track table (row) |

## Anti-hallucination rule (load-bearing)

You may write a `file:line` into the plan **only if you Read that exact location in this run.**
Never cite from memory, from the exemplar plan, or from a filename you assume exists (the repo's
own plans cite `schemas.ts` where the real file is `ipc-schemas.ts` — verify, don't copy). An
unverifiable reference is worse than none: delete it or replace it with a verified one.

## Red flags — STOP

- About to put a "Registration (docs): …" task in the **Phase-1 prompt** → don't. The skill already
  registered the feature; that would **double-register**. (Old hand-written prompts did this; yours
  must not.)
- Registered only ~4 places and moving on → you almost certainly missed **`log-phase.md`** (item 8)
  and/or the Feature Track Status row. Re-check all 8.
- Writing prompts or editing shared docs **before** the user approved the plan → go back to step 7.
- Citing a `file:line` you didn't Read this run → delete it.
- About to `git commit` → don't; planning is not a phase. Leave it uncommitted.

## Common mistakes

| Mistake | Fix |
|---|---|
| Registration deferred to "Phase 1 will do it" | Skill registers **up front** (step 8) so `/run-track` works immediately. |
| Missed `log-phase.md` table (item 8) | It's the most-forgotten one — even the repo drifted on it. Always do all 8. |
| Phase-1 prompt re-instructs registration | Omit it — already done. The one deliberate diff from older prompts. |
| Guessed/stale `file:line` | Read-verify every reference this run. |
| Wrong phase numbers | Number from `HEAD+1`, where HEAD = highest `Phase NN` in the Phase Checklist. |
| Generated docs in Ukrainian | Plan + prompts are **English** (house style); converse with the user in their language. |

## References

- **`references/registration-checklist.md`** — the 8-item contract, exact anchors + templates, pre-flight.
- **`references/plan-skeleton.md`** — plan section order + link convention + per-phase shape.
- **`references/prompts-skeleton.md`** — prompts structure + the verbatim standard progress footer.
- **`references/decomposition-heuristics.md`** — phased vs non-phased, logic-first→UI, numbering.
