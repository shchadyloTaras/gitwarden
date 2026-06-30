# Decomposition & numbering heuristics

How to turn a feature into phases and assign their numbers. Propose the result to the user
(step 6) before writing.

## Phased vs non-phased

**Default: phased** — the feature takes new global phase numbers and registers fully (all 8 items).

**Non-phased fix** — only for a *small, single-surface* change (a few files, one layer, no new
core contract). Example precedent: `header-guard-badge` shipped as a non-phased fix, **excluded
from the global phase counter** and absent from the `/new-phase` + `/log-phase` tables. If you
judge a feature is non-phased:
- It does NOT consume global phase numbers and is NOT added to the Phase Checklist as `Phase N`
  rows, the Feature Track Status table, or the two command tables (items 4, 7, 8 are skipped).
- It still gets a plan + prompts pair (items 1–2) and an `AGENTS.md` Reference-docs bullet (item 5),
  and is recorded as a dated entry in the Progress Log when done.
- **When unsure, propose phased** and let the user downgrade — phased is the safe default.

## Numbering (phased)

- The global phase counter is **shared across all features** (it's why the build order reads
  `0→…→67`). It is NOT per-feature.
- **HEAD = the highest `Phase NN` line in `docs/progress-log.md`'s `## Phase Checklist`** (regardless
  of whether lower phases like 43–44 are still `[ ]` — those are already-allocated, not free).
- New phases start at **HEAD + 1** and run contiguously (e.g. HEAD 67 → 68, 69, 70).
- DX-track steps (`DX-N`) are a separate counter — ignore them when finding HEAD.

## Logic-first split (AGENTS.md "build logic-first")

Decompose so every layer ships green before the layer above it. Typical 3–5 phase shape:

1. **Pure core + tests** — new `src/core/**` types/contract/Zod + Vitest. No IPC, no UI.
   Exit: `tsc` clean, `npm test` green, core-purity passes.
2. **Main / service / IPC** — persistence, service, Zod-validated IPC channel, typed preload bridge.
   Exit: `tsc` clean, integration tests green (offline fixtures), `npm run lint` clean.
3. **(if needed) more main logic** — e.g. a transport/binding phase.
4. **Renderer UI + e2e** — the screen/component wiring + Playwright spec. **Flag this last phase as
   the "feature-complete stop point"** (the plan's top matter + `/run-track` halts after it).

Rules of thumb:
- One new pure-core contract → its own phase 1.
- Anything touching git execution, secrets, or remote/destructive ops → cite the AGENTS.md rule it
  honors in that phase's Exit criteria (#1 pure core, #2 GitRunner only, #3 array args, #4 `--local`
  only, #5 no secrets logged, #6 destructive behind confirmation, #7 AI advisory-only).
- Keep phases independently shippable + verifiable; never bundle UI into a logic phase.
