# Plan skeleton — `docs/plans/<slug>-plan.md`

This is the baked **skeleton**. Always also open the **latest existing plan** (the one owning the
highest phase in the checklist — currently `docs/plans/guard-quick-fix-plan.md`) and match its
tone, depth, and any newer conventions. Skeleton = floor; the live exemplar = current style.

## Link convention (subtle — get it right)

Plans live in `docs/plans/`, so links to source use **`../../`** to reach repo root:
`[ErrorMapper.ts:34-43](../../src/main/git/ErrorMapper.ts)`. Every `file:line` you cite MUST have
been **Read in this run** — see the anti-hallucination rule in `SKILL.md`.

## Section order

```markdown
# Plan — <Feature>: <one-line subtitle of the user-visible win>

**Status:** ⬜ not started — Phases <N>–<NN> — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** <N> → <NN>.
**Feature-complete stop point:** Phase <NN>.
**Prompts:** [`docs/prompts/<slug>-prompts.md`](../prompts/<slug>-prompts.md).

## Goal

What the user can't do today and the concrete win. Lead with the user outcome in plain language,
then the mechanism. 1–3 short paragraphs. If there's a product boundary, state it here as
**"Product boundary (decided — <Variant>): …"**.

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a numbered claim with
real `file:line` links and the **consequence** for this feature:

1. **<Seam that already exists>.** `<fn>` … ([file.ts:LL-LL](../../src/...)). **Consequence:** …
2. …

(This section is the spine of "based on my project." Every reference here is read-verified.)

## Scope

- **In:** the bullets this feature delivers.
- **Out / Non-goals:** what it deliberately does NOT do.

## <Optional: the new contract / model>   ← only for logic-heavy features

The new pure-core type/contract the phases consume (e.g. a new `src/core/...` module sketch).

## Phase <N> — <name> (<scope tag, e.g. "pure core" / "main + IPC" / "renderer + e2e">)

**Goal:** one sentence — what this phase delivers.

**Implementation:**

- Concrete bullets with [file links](../../src/...). Name exact symbols, exact files.
- Logic-first: pure `src/core/` and tests before any IPC; IPC before any UI.

**Exit criteria:** `npx tsc --noEmit` clean (both tsconfigs); `npm test` green for new tests;
`src/core/` stays pure (core-purity passes) if touched; `npm run lint` clean. UI phases add the
relevant Playwright spec. State the gate precisely — it's what `/verify-phase` checks.

**Files:** new `<...>`; edit `<...>`.

---

## Phase <N+1> — …    (repeat per phase)

## Acceptance criteria (feature)

The end-to-end, user-observable checks that prove the whole feature — beyond any single phase.

## Decisions (resolved)

The choices already made (from the kickoff interview), each a one-liner. Mirrors the "decided"
boundary lines so later phases don't re-litigate.

## Open questions (resolve at kickoff)

Anything genuinely unresolved. Empty is fine if the interview closed everything.
```

## Per-phase rules

- **Logic-first decomposition** (AGENTS.md): pure core + tests → main/IPC → renderer/UI + e2e. A
  typical feature is 3–5 phases; the last is the UI/e2e "feature-complete stop point."
- **Every phase has a green-test exit gate.** Logic phases → Vitest; UI phases → Playwright.
- Cite the AGENTS.md architecture rules a phase must honor (e.g. "#1 pure core", "#4 --local only",
  "#5 no secrets logged") when relevant to that phase's scope.
- The Phase-1 plan section does **not** mention registration (the skill did it). See
  `registration-checklist.md`.
