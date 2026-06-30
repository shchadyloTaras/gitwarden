# Prompts skeleton — `docs/prompts/<slug>-prompts.md`

Copy-paste prompts that drive the feature one phase at a time. Each phase prompt is **self-contained**
and points back at the plan. Also open the latest existing prompts file (currently
`docs/prompts/guard-quick-fix-prompts.md`) as the live style exemplar.

## Section order

````markdown
# GitWarden — <Feature> Phase Prompts

Copy-paste prompts to drive the **<Feature>** feature one phase at a time. Each prompt is
self-contained, points at the plan in `docs/plans/<slug>-plan.md`, and **ends with the standard
progress footer** that records progress in `docs/progress-log.md`. Rules live in `CLAUDE.md` /
`AGENTS.md`.

**How to use:** run prompts in order (<N> → <NN>). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. <Note any logic-complete checkpoint vs the
UI phase.> One commit per phase; the progress-log entry written **before** the commit.

**Prerequisites / offline note:** <e.g. "No network. Tests use real git fixtures in a temp dir with
a local bare repo as the remote.">

Background facts (already verified against the tree — don't re-litigate):

- <key grounding bullets copied/condensed from the plan's Codebase-findings section>

---

## 🔁 Standard progress footer (included in every prompt)

Every prompt below ends with this block. It is the mechanism that records progress:

```
When the phase's Exit criteria are met:
1. Append an entry to the "## Progress Log" section of docs/progress-log.md (newest last, do not rewrite past entries):
   ### <today's date> — Phase N: <name>
   - Built: <what was implemented>
   - Files: <files added/changed>
   - Tests: <exact vitest/playwright result, e.g. "12 passed">
   - Exit criteria: ✅ met  (or ⚠️ partial — explain what's left)
   - Notes / follow-ups: <anything worth knowing for next phase>
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md and re-derive any affected derived views (Feature Track Status row, AGENTS.md build order).
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase <N> — <name>

```
Work on Phase <N> of GitWarden (docs/plans/<slug>-plan.md §"Phase <N>"). <scope note — e.g. "Pure core only — no IPC, no UI.">

Tasks:
- <concrete, file-level tasks mirroring the plan's Implementation bullets; name exact symbols + files>

Exit: <the exact gate — tsc clean / which tests / lint / purity / Playwright spec for UI phases>.

Then run the standard progress footer.
```

---

## Phase <N+1> — …   (repeat per phase)
````

## Rules

- The footer block above is **verbatim** — copy it exactly (it's the contract `/log-phase` and the
  per-phase flow rely on). Keep the literal `Co-Authored-By: Claude <noreply@anthropic.com>` trailer
  and the `N`/`<name>` placeholders (each phase resolves them itself).
- Each phase prompt body is a fenced code block (the user copy-pastes it whole) ending with
  **"Then run the standard progress footer."**
- The **Phase-1 prompt does NOT include a "Registration (docs): …" task** — the skill already
  registered the feature (see `registration-checklist.md`). This is the deliberate difference from
  older hand-written prompts.
- Match the plan's phase names and ranges exactly. `/run-track` reads the range from the plan.
