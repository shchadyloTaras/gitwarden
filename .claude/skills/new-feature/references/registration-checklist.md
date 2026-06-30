# Registration checklist — the 8 edits that make `/run-track <slug>` work

A feature is "registered" when **every** item below is done. `/run-track` and `/new-phase`
resolve a feature through these exact places; miss one and the track is silently undrivable or a
derived view drifts. This is a **contract** — fill every slot, in this order.

Placeholders: `<slug>` (kebab, e.g. `commit-templates`) · `<Feature>` (Title Case, e.g.
`Commit Templates`) · `<N>`..`<NN>` (the assigned phase range, e.g. `68`..`70`).

## Pre-flight (before writing ANYTHING)

1. **Collision check — STOP if any hit.** The feature is "new" only if its slug appears in NONE of:
   - `docs/plans/<slug>-plan.md` exists
   - `<slug>` in `AGENTS.md` "Reference docs"
   - a `### <Feature> feature (...)` heading in `docs/progress-log.md` "## Phase Checklist"
   If any match → STOP and report. Do not overwrite, do not merge. Let the user pick a new slug or
   say explicitly they are extending the existing feature.
2. **Compute phase numbers.** Read `## Phase Checklist` in `docs/progress-log.md`; the highest
   `Phase NN` line is HEAD. New phases start at `HEAD + 1`. (Non-phased fix → see
   `decomposition-heuristics.md`; it skips items 3,4,6,7,8 and is excluded from the counter.)

## The 2 new files

1. **`docs/plans/<slug>-plan.md`** — per `plan-skeleton.md`.
2. **`docs/prompts/<slug>-prompts.md`** — per `prompts-skeleton.md`.

## The 6 shared-doc edits

3. **`docs/progress-log.md` → `## Phase Checklist`.** Insert a new block **immediately before**
   the `### Agentic DX track` heading (product features sit in numeric order; the DX track stays
   last):
   ```
   ### <Feature> feature (plan: `docs/plans/<slug>-plan.md`, prompts: `docs/prompts/<slug>-prompts.md`)

   - [ ] Phase <N> — <name>
   - [ ] Phase <N+1> — <name>
   - [ ] Phase <NN> — <name>
   ```
   All boxes `[ ]` (unticked — nothing is built yet). `/run-track` collects these as the pending list.

4. **`docs/progress-log.md` → `## Feature Track Status`.** Add a row to the table:
   ```
   | <Feature>              | <N>–<NN>  | ⬜ not started                                                |
   ```
   `⬜` because no phase is done yet (derived-view rule: none `[x]` → ⬜).

5. **`AGENTS.md` → "## Reference docs".** Add one bullet alongside the other feature plans:
   ```
   - **<Feature>:** `docs/plans/<slug>-plan.md` + `docs/prompts/<slug>-prompts.md`
   ```

6. **`AGENTS.md` → "## Build order (dependency-driven)".** Extend the chain with the new range,
   placed after the current highest product range:
   ```
   … → `<N>→<NN>` (<Feature>)
   ```

7. **`.claude/commands/new-phase.md` → the phase-range → plan/prompts table** (the markdown table
   under "Step 2"). Add a row:
   ```
   | <N>–<NN>    | `docs/plans/<slug>-plan.md`         | `docs/prompts/<slug>-prompts.md`         |
   ```
   Without this row, `/new-phase <N>` cannot find the plan — and `/run-track` calls `/new-phase`.

8. **`.claude/commands/log-phase.md` → the phase-range → Track table** (under "Step 4"). Add a row:
   ```
   | <N>–<NN>    | <Feature>              |
   ```
   Without this row, `/log-phase` can't re-derive the Feature Track Status row on phase completion.
   NOTE: this table is the one most often forgotten when registering by hand (it was missing Guard
   Quick-Fix, 63–67, at the time this skill was written). Always do it.

## After registration

- **Write order:** new files first (items 1–2), then the 6 shared-doc edits. If interrupted, the
  half-done state is uncommitted (see below) and recoverable.
- **No commit.** Leave everything uncommitted for the user to review the diff. Planning is not a
  phase; the only commit convention is `Phase N: <name>` for *completed* phases. Never push.
- **Report** exactly which of the 8 items you wrote/edited, so the user can scan the diff.
- **Do NOT re-instruct registration in the Phase-1 prompt.** The skill already registered the
  feature; the generated Phase-1 prompt must NOT carry a "Registration (docs): …" task (that would
  double-register). This is the one way the generated prompts differ from older hand-written ones
  (e.g. guard-quick-fix's Phase 63 prompt, which did its own registration).
