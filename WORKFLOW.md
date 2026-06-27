# GitWarden — How We Work

Living reference. Starts at Baseline, grows one section per completed DX step.

**How to update:** when a DX step completes, change its `🔒` to `✅` and uncomment the
locked content below it. The DX prompt for that step includes this as an explicit task.

**Current level:** `DX-6 — Optional / à la carte (DX track complete)`

> Derived view. This line and the `🔒`/`✅` section markers below mirror the **Agentic DX** row in
> `docs/progress-log.md`'s Feature Track Status table — itself derived from the Phase Checklist.
> Keep them in sync; if they disagree, `docs/progress-log.md` wins.

---

## ✅ Baseline — available right now

### Start the app

```bash
npm run dev        # Electron + Vite renderer hot-reload
```

### The test gate (run before every commit)

```bash
npx tsc -p tsconfig.node.json --noEmit   # ALWAYS — the one most often forgotten
npx tsc -p tsconfig.web.json --noEmit
npm test                                  # Vitest — unit + integration (live count is in the latest progress-log entry)
npm run lint                              # ESLint + Prettier
npm run e2e                               # Playwright Electron (builds first)
```

All five must be green. Commit only on green. Never push automatically.

### Start a phase

1. Check `docs/progress-log.md` — previous phase Exit criteria must be ✅.
2. Read the matching plan section in `docs/plans/`.
3. Read the matching prompt in `docs/prompts/`.

### Close a phase

1. Run the five-command gate above.
2. Append entry to `docs/progress-log.md` Progress Log (newest last).
3. Tick the phase in the Phase Checklist, then re-derive the Feature Track Status table row.
4. Commit — **only after steps 2–3.** Verify the Progress Log entry for this phase exists and its
   box is ticked; if not, go back to step 2 — **a commit without the log entry is not allowed.**
   Then: `git add -A && git commit -m "Phase N: <name>" -m "<summary>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"`
5. Do **not** push — push is always manual and explicit.

### Know the project state

```bash
cat docs/progress-log.md   # Phase Checklist + Progress Log
```

### Architecture invariants (non-negotiable, enforced by honour until DX-1)

- `src/core/` is pure — no `child_process`, `fs`, `electron`, or DOM imports.
- All git execution goes through `GitRunner` only (`src/main/git/`).
- Git args are always an array — never string-interpolated.
- Only `--local` git config changes — never `--global` or `--system`.
- Never log secrets.

---

## ✅ DX-0 — Clean orientation

> Unlocks after: `DX-0: Docs reconciliation` commit lands.
> Update: change `🔒` → `✅`, uncomment the block below, update "Current level" at the top.

### Project status — one glance

Open `docs/progress-log.md` → look at the **Feature Track Status** table at the top.
No spelunking through 62 checkboxes.

| What you need       | Where to look                             |
| ------------------- | ----------------------------------------- |
| Current HEAD phase  | Status table → last ✅ row                |
| What's next         | Status table → first ⬜ row               |
| All plans + prompts | AGENTS.md "Reference docs" §              |
| Architecture map    | docs/architecture/ (+ diagram.excalidraw) |
| Decision history    | docs/adr/ (index: DECISIONS.md)           |
| Security rules      | SECURITY.md                               |
| DX step prompts     | docs/prompts/dx-execution-prompts.md      |

### Hand off to another agent (Codex, new session)

`AGENTS.md` now has the complete map — the full build order across all tracks + the DX track.
Paste it (or the whole file) as context. No verbal briefing needed.

---

## ✅ DX-1 — Guardrails active

> Unlocks after: `DX-1: Executable guardrails` commit lands.
> Update: change `🔒` → `✅`, uncomment the block below, update "Current level" at the top.

### What changed

- **No permission prompts** for `npm run test`, `npm run lint`, `npm run e2e`, `npm run build`,
  `npm run dev`, `git status`, `git diff`, `git log`, `git show`, `npx tsc`, `npx prettier`.
- **Core purity** — editing any file under `src/core/` with a forbidden import is **blocked**
  at edit time with a message citing AGENTS.md rule #1. The hook never crashes your work;
  on its own error it exits 0 (fail-open).
- **No global git config** — `git config --global` and `--system` are blocked automatically.
- **execFile guard** — adding `execFile`/`exec`/`spawn` outside `src/main/git/` triggers a warning.
- **Commit log gate** — `git commit` is blocked if `docs/progress-log.md` is not staged.
  Bypass for WIP commits: `GITWARDEN_SKIP_LOG_GATE=1 git commit ...`

### Guardrail tests

```bash
npm run test:tooling    # proves each hook blocks bad input and allows good input
```

Run this anytime to confirm the guards are working. A broken hook never blocks legitimate work
(fail-open rule), so if you suspect a false block, check the hook output on stdin.

### Architecture invariants — now enforced, not just written

The invariants in the Baseline section above are now **mechanically enforced**. If you see a
hook fire, it caught a real violation — fix the code, not the hook.

---

## ✅ DX-2 — Phase workflow in four commands

> Unlocks after: `DX-2: Slash commands` commit lands.
> Update: change `🔒` → `✅`, uncomment the block below, update "Current level" at the top.

### The new phase ritual (replaces the Baseline manual steps)

#### Start a phase

```
/new-phase <N>
```

Checks the previous phase gate from `progress-log.md`, reads the plan section and prompt,
outputs Goal / Tasks / Exit criteria. If the previous phase isn't ✅, it refuses.

#### Run the gate

```
/verify-phase          # tsc node + tsc web + vitest + lint
/verify-phase --ui     # + npm run e2e
```

Runs all checks in order, stops on first failure, reports ✅/❌ per step.
**Both tsc projects** are always checked — the node project has historically hidden a batch of errors the web project alone did not surface.

#### Write the progress log entry

```
/log-phase <N> <name> — <summary bullets>
```

Appends the standard entry to `docs/progress-log.md` and ticks the checklist.
Does **not** commit — that's the next step.

#### Commit

```
/commit-phase <N> <phase name>
```

Runs `npm test` first — refuses if red. Then `git add -A` and commits with the exact
`Phase N: <name>` subject + `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
**Never pushes.**

### Full phase close — one sequence

```
/new-phase 56                          ← check gate, read plan, get brief
<implement>
/verify-phase --ui                     ← GATE PASS or GATE FAIL
/log-phase 56 Push Policy Foundations ← write the log entry
/commit-phase 56 Push Policy Foundations
```

### Manual gate (Baseline) is still valid

The five-command Baseline gate still works if you prefer it. `/verify-phase` runs the same
commands — it's a convenience wrapper, not a replacement of the underlying checks.

---

## ✅ DX-3 — Maker ≠ checker

> Unlocks after: `DX-3: Subagent reviewers` commit lands.
> Update: change `🔒` → `✅`, uncomment the block below, update "Current level" at the top.

### Available reviewers

Both are **read-only, clean-context** — they start without your session history.

**`core-purity-reviewer`** — invoke on any diff touching `src/core/`:

```
Task: review the changes in src/core/ for purity violations.
Use the core-purity-reviewer subagent.
```

Returns `FINDING: file:line — <what> violates AGENTS.md rule #N` or `CLEAN`.
Checks: forbidden imports, non-injected services.

**`safety-reviewer`** — invoke on any diff touching `src/main/git`, `src/main/security`,
`src/main/ai`, or IPC:

```
Task: review this diff for security rule violations.
Use the safety-reviewer subagent.
```

Returns findings or `CLEAN`.
Checks: secrets logged, git args as strings (not arrays), destructive actions without confirmation,
advisory-only AI boundary crossed.

### When to invoke

| Phase touches                        | Reviewer to invoke     |
| ------------------------------------ | ---------------------- |
| `src/core/`                          | `core-purity-reviewer` |
| `src/main/git/`, IPC, `src/main/ai/` | `safety-reviewer`      |
| Both                                 | Both, in parallel      |
| UI-only changes                      | Neither required       |

Add reviewer invocation between `/verify-phase` and `/log-phase` for any phase that touches the above paths.

---

## ✅ DX-4 — Measured AI quality

> Unlocks after: `DX-4: AI evals` commit lands.
> Update: change `🔒` → `✅`, uncomment the block below, update "Current level" at the top.

### Run AI quality checks

```bash
npm run eval          # offline, deterministic, against the fake adapter
```

Runs the golden-set fixtures in `tests/evals/fixtures/` and reports per-case pass/fail.
No network access. Fast.

### Add this to the gate for AI-touching phases

```
/verify-phase         ← tsc + vitest + lint
npm run eval          ← AI quality (add for phases 28–62 and any new AI work)
```

### Add a new eval case

One file in `tests/evals/fixtures/` — see `tests/evals/README.md` for the format.
The case must include both a pass condition and a false-positive check if applicable.

### Live spot-check (opt-in, not in CI)

```bash
GITWARDEN_EVAL_LIVE=1 npm run eval
```

Uses the real configured AI provider. Skipped by default.

### Gate for Phase 62 and any new AI surface

`npm run eval` must pass before `/commit-phase` on any phase that adds a new AI capability.
Phase 62 (free-text GenUI) requires a golden fixture for the new capability added first,
then implement, then eval passes — in that order.

---

## ✅ DX-5 — Agent-agnostic

> Unlocks after: `DX-5: Shareability` commit lands.
> Update: change `🔒` → `✅`, uncomment the block below, update "Current level" at the top.

### Pack the repo for any AI tool

```bash
npm run pack          # produces gitwarden-context.txt (gitignored)
```

Excludes `node_modules/`, `out/`, `*.tsbuildinfo`, lockfiles, secrets.
Paste `gitwarden-context.txt` into any AI tool for full project context without a verbal briefing.

### When to use

- Starting a long cross-cutting session in a fresh Claude context.
- Handing the repo to Codex, Gemini, or another tool.
- Onboarding a human developer → point them to `CONTRIBUTING.md` first.

### Human onboarding

`CONTRIBUTING.md` — prerequisites, five commands, phase workflow, three non-negotiables,
how to pack the repo. Under 100 lines. Read time: 5 minutes.

---

## ✅ DX-6 — Optional / à la carte

> Unlocks after: `DX-6: Optional / à la carte` commit lands.
> The à-la-carte menu — pick any, none required. Four of five options shipped (2026-06-28).

### What's available now

- **Architecture diagram** — [`docs/architecture/`](docs/architecture/README.md) (PNG) + editable
  `docs/architecture/diagram.excalidraw` / `docs/architecture/diagram.svg`. One picture of core ↔ main
  ↔ preload ↔ renderer and the only allowed crossings. Regenerate the PNG with the snippet in
  `docs/architecture/README.md` after editing the SVG.
- **ADRs split out** — decisions now live one-per-file under [`docs/adr/`](docs/adr/) (MADR).
  `DECISIONS.md` is the `§N`→ADR index, so old "DECISIONS.md §6" references still resolve.
- **GenUI north-star refs** — `docs/plans/genui-blocks-plan.md` now names the Vercel AI SDK
  generative-UI pattern and Google A2UI as the industry anchors for the closed-union/declarative-block
  schema.
- **Code-graph MCP (opt-in)** — `.mcp.json` configures CodeGraphContext but leaves it **disabled**;
  Claude Code asks before running any project MCP server, and `.claude/settings.json` does not
  auto-enable it. Setup + rationale: `docs/code-graph-mcp.md`. Approve only if navigation pain is real
  (DX-6 rule: don't add MCP speculatively).

### Deferred (do on a genuinely new feature, not retroactively)

- **project-factory / sdd onboarding** — wire the governance plugins into the repo deliberately on a
  new feature; do not run across the existing phases. Left as a separate, conscious step.

---

## Always-valid: push is always manual

At every level, `git push` happens only when you explicitly ask for it.
No command, hook, or agent in this repo pushes automatically.

---

## Always-valid: the non-negotiable invariants

These never change regardless of DX level:

1. `src/core/` — no `child_process`, `fs`, `electron`, DOM imports. Pure Vitest-testable.
2. All git execution — through `GitRunner` only (`src/main/git/`).
3. Git args — always an array. Never string-interpolated.
4. Git config — only `--local`. Never `--global` or `--system`.
5. Secrets — never logged.
6. Destructive/remote actions — always behind explicit confirmation.
7. AI assistants — advisory only. Never trigger git actions autonomously.
