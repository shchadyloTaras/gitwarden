# GitWarden — Agentic Developer-Experience & Docs Plan

> Bring the **agent-facing layer** of this repo up to current best practice. The prose docs
> (`AGENTS.md`, `DECISIONS.md`, `SECURITY.md`, per-feature `plans/` + `prompts/`, `progress-log.md`)
> are already strong and already apply context-engineering discipline. The gap is that **every
> architecture invariant lives only as prose** and the `.claude/` directory is **empty** — nothing
> mechanically prevents a violation, and none of the repeated per-phase work is codified.
>
> This plan turns the written invariants into **executable guardrails** (hooks, commands, subagents),
> adds **evals** for the AI features, and makes the repo **agent-agnostic shareable** — without
> bloating the instruction files. It is a **developer-experience / tooling** track. It ships **no new
> GitWarden product behaviour** and changes **no runtime code paths**; it only adds repo tooling and
> docs.

## 0. How to Read This Plan

This is a **separate DX track**, not a product feature. It does **not** consume the global product
phase counter (`0 → … → 62`); its steps are numbered **DX-1 … DX-6** so they never collide with a
product phase. It follows the same house discipline as every other plan here:

- each step has a **Goal**, **Tasks**, and an explicit **Exit criteria** gate;
- build **logic-first** where it applies (a guardrail ships with a test that proves it blocks);
- a step is done only when its exit criteria pass and `docs/progress-log.md` is updated;
- **one commit per step**, with the agent's `Co-Authored-By` trailer; **never push automatically**.

Steps DX-1…DX-3 are the high-value core (executable guardrails). DX-4 closes the biggest *modern*
gap (AI evals). DX-5 is shareability. DX-6 is optional / heavier. Do them in order; each is
independently shippable, so you can stop after any step.

**Self-improvement principle:** the same rules that make GitWarden verifiable — pure core, injected
services, logic-first, offline tests — apply to the tooling itself. Every hook must run **offline**,
**fast** (< ~1s), and be **fail-open on tooling error** (a broken hook must never block legitimate
work), and every guardrail ships with a test proving it fires.

---

## 1. Current State & The Gap

What this repo already does well (keep it):

| Asset | State | Best-practice it already satisfies |
| --- | --- | --- |
| `CLAUDE.md` = `@AGENTS.md` | ✅ | single thin entry; cross-tool standard |
| `AGENTS.md` (95 lines) | ✅ | lean, right-altitude, under the ~200-line memory target |
| `progress-log.md` split out | ✅ | context kept out of the always-loaded files (cited in `progress-log.md:3`) |
| `DECISIONS.md` / `SECURITY.md` | ✅ | ADR + threat model exist |
| per-feature `plans/` + `prompts/` | ✅ | spec-before-code, phase gates, exit criteria |

The gap — the whole opportunity of this plan:

| Missing | Consequence | Closed by |
| --- | --- | --- |
| `.claude/` is **empty** | invariants are prose only; nothing enforces them | DX-1, DX-2, DX-3 |
| no hooks | core-purity / no-`--global` / `GitRunner`-only rules rely on memory | DX-1 |
| no slash commands | per-phase workflow + commit convention retyped each time | DX-2 |
| no project subagents | review is ad-hoc; no `maker ≠ checker` for the invariants | DX-3 |
| **zero evals** on AI features | Smart Commit / Safety Copilot quality is unmeasured | DX-4 |
| no `repomix` / `CONTRIBUTING` | hard to hand the repo to another tool or a human | DX-5 |
| `project-factory` + `sdd` plugins installed but **not wired into this repo** (no `.claude/`, no `openspec/`) | governance tooling sits unused | DX-6 |

> The thesis: your strongest *documentation* improvement is not more prose — it is making the
> unbreakable rules **executable**, so an agent (or a tired you at midnight) literally cannot ship a
> violation.

---

## 2. Source → Principle → Action

Distilled from the reference set (full links in §7). Frameworks for building agent *backends*
(LangChain/LangGraph, CrewAI, AutoGen/AG2, hermes-agent, nanoclaw, `openai-agents-python`) are
**deliberately excluded** — they are irrelevant to an Electron Git GUI; see §6.

| Source(s) | Portable principle | Action in this repo |
| --- | --- | --- |
| Anthropic *Effective context engineering* | finite context; right altitude; just-in-time retrieval; sub-agents for long horizons | keep `AGENTS.md` lean; push detail into commands/agents loaded on demand (DX-2, DX-3) |
| Claude Code *best practices* & docs | `CLAUDE.md` + **hooks + slash commands + subagents + permissions + MCP** | DX-1, DX-2, DX-3, DX-6 |
| koldovsky *agentic greenfield* + `project-factory` | gated agentic SDLC; **maker ≠ checker**; spec-driven gates | reviewer subagents (DX-3); optional onboarding (DX-6) |
| OpenAI *prompt/agents guidance* (GPT-5.5) | control eagerness; tool preambles; **evals as a first-class artifact** | eval harness (DX-4); tighten command prompts (DX-2) |
| Karpathy *software 3.0* gist | the spec is the source of truth; small reversible diffs; human in the loop | keep specs/plans canonical; commands enforce phase-sized commits (DX-2) |
| steipete *shipping at inference speed* | tight verify loops; auto-verification; parallel agents | `/verify-phase` (DX-2); fast offline hooks (DX-1) |
| arena.ai, kaggle *new SDLC*, uncertainty-architecture | benchmark AI output; treat quality as measured, not assumed | AI evals + golden set (DX-4) |
| `repomix`, AGENTS.md standard | agent-agnostic packing of the repo as context | `repomix.config.json` (DX-5) |
| MCP / `modelcontextprotocol`, CodeGraphContext | standard tool protocol; code-graph navigation | optional `.mcp.json` (DX-6) |
| Vercel *react-best-practices* skill, OpenAI skills | reusable **Skills** as portable capability docs | optionally vendor a project skill (DX-6) |
| Vercel **AI SDK**, **A2UI**, genui.com | controlled / declarative Generative UI patterns | already captured in `genui-blocks-plan.md`; add explicit north-star refs (DX-6) |
| excalidraw | a single architecture diagram beats paragraphs | optional `docs/architecture.excalidraw` / PNG (DX-6) |

Commentary-only links (willrobotstakemyjob, dou/habr threads, model/provider catalogs, OCR papers)
are background reading, not actionable here.

---

## 3. Rules (non-negotiable for this track)

These extend `AGENTS.md`; they do not replace it.

1. **Do not bloat the always-loaded files.** `AGENTS.md` stays lean; detail goes into
   on-demand commands/agents. If `AGENTS.md` grows, move content out, don't pad it.
2. **Hooks are fast, offline, and fail-open.** A hook must never reach the network, must finish in
   ~1s, and on its *own* error must exit 0 (never block real work because the guard crashed).
3. **Every guardrail ships with a test that proves it blocks** a known-bad input and **allows** a
   known-good one. A guardrail without a red→green proof is not done.
4. **Guardrails mirror existing rules; they invent none.** Each hook/agent cites the `AGENTS.md`
   rule number it enforces. No new policy is created here.
5. **No secrets in tooling.** Hooks/commands never echo tokens, env, or file contents that could
   contain secrets (mirrors `AGENTS.md` "never log secrets").
6. **Tooling is advisory to the human, not autonomous.** Nothing here pushes, commits without ask,
   or performs destructive/remote actions; commands prepare actions, the human confirms.

---

## 4. The Plan

### Step DX-1 — Executable guardrails (`.claude/settings.json` + hooks)

**Goal.** Make the mechanical invariants impossible to violate silently, and cut permission-prompt
noise for the safe commands.

**Tasks.**

- Add `.claude/settings.json` with:
  - **Core purity hook** — `PostToolUse` on `Edit|Write` whose path matches `src/core/**`: grep the
    new content for forbidden imports (`child_process`, `node:fs`/`'fs'`, `electron`, DOM globals);
    block with a message naming `AGENTS.md` rule #1 if found. (Verified clean today — this keeps it
    that way.)
  - **No global git config hook** — `PreToolUse` on `Bash` matching `git config --global` (and
    `--system`): block, citing rule #8 ("only `--local`").
  - **`GitRunner`-only `execFile` hook** — `PostToolUse` on edits adding `execFile`/`exec`/`spawn`
    outside `src/main/git/**`: warn (or block), citing rule #2.
  - **`permissions.allow`** — allowlist the safe, frequent commands so they stop prompting:
    `npm run test:*`, `npm run lint`, `npm run e2e`, `npm run build`, read-only `git` (`status`,
    `diff`, `log`, `show`). Keep destructive/remote git out of `allow`.
- Add `tests/tooling/` (or a shell test) that feeds each hook a bad and a good payload and asserts
  block / pass.

**Exit criteria.** Editing `src/core/**` to add `import { execFile } from 'node:child_process'` is
blocked with a rule-#1 message; a `git config --global` command is blocked; `npm run test:*` runs
without a permission prompt; the guardrail tests are green; `npm run lint` clean.

> Confirm the exact hook JSON shape against the current Claude Code hooks docs before writing
> (the event names `PreToolUse`/`PostToolUse`, matcher, and `type: "command"` are stable; exit-code
> vs JSON blocking is the detail to check). Appendix A has a sketch.

---

### Step DX-2 — Slash commands (`.claude/commands/`)

**Goal.** Codify the repeated per-phase workflow and the commit convention so they are one command,
not retyped prose — and so they execute identically every time.

**Tasks.** Create:

- `/verify-phase` — runs the phase's gate: `npm test`, then `npm run lint`, then (if a UI phase)
  `npm run e2e`; summarizes pass/fail. Encodes "Operating workflow" step 4.
- `/commit-phase` — takes `N` and a name; stages with `git add -A`; commits exactly
  `Phase N: <name>` with the one-line body and the `Co-Authored-By: Claude <noreply@anthropic.com>`
  trailer; refuses if tests are red; **never pushes** (rules #9, "commit only on green", "never
  push").
- `/new-phase` — scaffolds a phase: reads the matching `docs/prompts/*.md` footer + the plan section,
  checks the previous phase's exit criteria in `progress-log.md`, and lays out Goal/Tasks/Exit
  criteria. Encodes "Operating workflow" steps 1–2.
- `/log-phase` — appends the Progress-Log entry and ticks the Phase Checklist (step 5).

**Exit criteria.** Each command exists with frontmatter (`description`, `argument-hint`,
`allowed-tools`); `/commit-phase` produces the exact subject/trailer format and refuses on red
tests; running `/verify-phase` reproduces the manual gate.

---

### Step DX-3 — Subagent reviewers (`.claude/agents/`)

**Goal.** Add `maker ≠ checker` review for the two invariants that a grep can't fully judge — a
clean-context agent reviews the diff against the rule.

**Tasks.** Create:

- `core-purity-reviewer` — read-only; given a diff, confirms `src/core/**` stays free of
  `child_process`/`fs`/Electron/DOM **and** that new core code is pure & injected (rule #1, #4).
- `safety-reviewer` — read-only; checks "secrets never logged", destructive/remote actions behind
  confirmation, git args passed as arrays not strings, paths after `--` (rules #5, #6).
- In `AGENTS.md`, add a one-line pointer to these **and** to the already-installed
  `project-factory:security-reviewer` / `project-factory:code-reviewer` so they're discoverable.

**Exit criteria.** Both agents exist with `name`/`description`/`tools` frontmatter and a focused
system prompt; invoking `core-purity-reviewer` on a deliberately impure diff returns a finding with
`file:line`; `AGENTS.md` references them and stays lean.

---

### Step DX-4 — Evals for the AI features

**Goal.** Stop assuming AI quality; measure it. This is the biggest *modern* gap — full AI features
(Smart Commit, Change Review, Safety Copilot) ship with **no evals**.

**Tasks.**

- Add `tests/evals/` with a small **golden set** of fixtures: a handful of `(diff, repo-context)`
  cases with expected properties (not exact strings) — e.g. commit subject ≤ 50 chars, imperative
  mood, no secrets leaked; Safety Copilot **must** flag the wrong-profile / wrong-email case.
- Run evals against the **injected fake adapter** (`GITWARDEN_E2E_FAKE_AI=1`) so they're offline and
  deterministic in CI, plus an **opt-in live mode** (skipped by default) for spot checks.
- Express checks as assertions where possible; for subjective quality (tone, clarity) use an
  LLM-judge fixture kept separate, scored 0–100, never the model that produced the output
  (`maker ≠ checker`).
- Add `npm run eval` and document the golden-set format.

**Exit criteria.** `npm run eval` runs offline against the fake adapter and reports per-case
pass/fail; the wrong-profile Safety-Copilot case is covered; adding a new case is a one-file change.

---

### Step DX-5 — Agent-agnostic shareability

**Goal.** Make the repo trivially loadable by other tools and onboardable by humans.

**Tasks.**

- `repomix.config.json` — pack the repo to one file for pasting into other models, excluding
  `node_modules`, `out`, `dist`, `*.tsbuildinfo`, lockfiles, and secrets; respect `.gitignore`.
  Add `npm run pack` (`npx repomix`).
- `CONTRIBUTING.md` — short, human-facing: the commands, the phase workflow, the non-negotiables,
  and a pointer to `AGENTS.md` as the agent source of truth.

**Exit criteria.** `npm run pack` produces a single bundle without secrets or `node_modules`;
`CONTRIBUTING.md` exists and links to `AGENTS.md` rather than duplicating it.

---

### Step DX-6 — Optional / heavier

Pick à la carte; none are required.

- **Wire `project-factory` or `sdd` into this repo.** Both plugins are installed globally but unused
  here. `/project-factory:onboard` reverse-engineers requirements + baseline OpenSpec specs from the
  current code and governs new phases through gates. High value, but it's a workflow shift — adopt
  deliberately, on a new feature, not retroactively across 62 phases.
- **Split `DECISIONS.md` → `docs/adr/NNNN-*.md` (MADR).** Standard one-decision-per-file ADRs. Only
  worth it once the monolith starts hurting; it's churn otherwise.
- **GenUI north-star in `genui-blocks-plan.md`.** That plan already benchmarks the market; add
  explicit reference links to the **Vercel AI SDK generative-UI** pattern and **Google A2UI** as the
  declarative-block schema reference, so the closed-union approach has a named industry anchor.
- **`.mcp.json` / CodeGraphContext.** A project-scoped code-graph MCP only if navigating the codebase
  starts costing real time. Don't add MCP servers speculatively.
- **`docs/architecture.excalidraw` (+ exported PNG).** One diagram of core ↔ main ↔ preload ↔
  renderer boundaries; cheap, high-orientation-value for new agents/humans.

---

## 5. Sequencing & Effort

| Step | Value | Effort | Note |
| --- | --- | --- | --- |
| DX-1 hooks + settings | ★★★ | S–M | the core gap; do first |
| DX-2 slash commands | ★★★ | S | immediate daily payoff |
| DX-3 subagent reviewers | ★★☆ | S | `maker ≠ checker` for the invariants |
| DX-4 AI evals | ★★★ | M | biggest *modern* gap; do before more AI features |
| DX-5 repomix + CONTRIBUTING | ★★☆ | S | shareability |
| DX-6 optional | ★☆☆ | varies | à la carte |

Recommended order: **DX-1 → DX-2 → DX-3 → DX-4 → DX-5**, then DX-6 as needed. Each is a single
commit; update `progress-log.md` (a short "DX track" subsection) per step.

---

## 6. Explicitly Out of Scope (do **not** add)

- **Agent-backend frameworks** — LangChain, LangGraph, CrewAI, AutoGen/AG2, hermes-agent, nanoclaw,
  `openai-agents-python`. They build autonomous agent *services*; GitWarden is an Electron GUI whose
  AI layer is **advisory and subordinate to the deterministic Safety Engine**. Adding them is cargo
  cult and would violate the AI plan's authority boundary.
- **Model/provider catalogs** (OpenRouter app lists, qwen-agentworld, antigravity, model zoos) — your
  adapter registry already abstracts providers; chasing catalogs adds nothing.
- **OCR / unrelated research repos** (Unlimited-OCR, the arxiv OCR paper) — off-topic.
- **More prose in `AGENTS.md`** — the fix for "agents miss a rule" is a hook/agent, not a longer file.

---

## 7. References

Stable sources behind this plan (from the provided set):

- Anthropic — *Effective context engineering for AI agents*:
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- Claude Code — *Best practices* & docs: <https://code.claude.com/docs/en/best-practices> ·
  hooks / slash commands / subagents / settings under <https://code.claude.com/docs>
- OpenAI — *Prompt guidance (GPT-5.5)* & *Agents guide*:
  <https://developers.openai.com/api/docs/guides/prompt-guidance> ·
  <https://developers.openai.com/api/docs/guides/agents>
- koldovsky — *Agentic Greenfield* course & **project-factory**:
  <https://koldovsky.github.io/2026-fwdays-agentic-greenfield-slidev/> ·
  <https://github.com/koldovsky/project-factory>
- Karpathy — software-3.0 gist:
  <https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>
- steipete — *Shipping at inference speed*:
  <https://steipete.me/posts/2025/shipping-at-inference-speed>
- arena.ai <https://arena.ai/> · Kaggle *new SDLC with vibe coding* writeup ·
  uncertainty-architecture <https://github.com/UncertaintyArchitectureGroup/uncertainty-architecture>
- repomix <https://repomix.com/> · MCP <https://modelcontextprotocol.io/> ·
  CodeGraphContext <https://github.com/CodeGraphContext/CodeGraphContext>
- Vercel AI SDK <https://ai-sdk.dev/> · Google A2UI
  <https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/> ·
  react-best-practices skill
  <https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices>
- MADR (ADR format) <https://adr.github.io/madr/>

---

## Appendix A — Build-ready sketches

> Illustrative shapes to make the steps concrete. Confirm exact schemas against the current Claude
> Code docs before writing — the primitives are stable; field-level details may have drifted.

**`.claude/settings.json` (DX-1) — shape:**

```jsonc
{
  "permissions": {
    "allow": [
      "Bash(npm run test:*)", "Bash(npm run lint)", "Bash(npm run e2e)",
      "Bash(npm run build)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": ".claude/hooks/no-global-git-config.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": ".claude/hooks/core-purity.sh" }] }
    ]
  }
}
```

A hook script reads the tool payload as JSON on **stdin**, inspects the path/content, and **exits 2
to block** (its stderr is shown to the agent) or **exits 0 to allow**. On its own internal error it
must exit 0 (fail-open, rule §3.2).

**`.claude/commands/commit-phase.md` (DX-2) — shape:**

```markdown
---
description: Commit the current phase as "Phase N: <name>" with the project trailer (never pushes)
argument-hint: <N> <name...>
allowed-tools: Bash(git add:*), Bash(git commit:*), Bash(npm run test:*)
---
Verify tests are green, then `git add -A` and commit exactly `Phase $1: <name from $ARGUMENTS>`
with a one-line body and the trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
Refuse if tests are red. Do NOT push.
```

**`.claude/agents/core-purity-reviewer.md` (DX-3) — shape:**

```markdown
---
name: core-purity-reviewer
description: Reviews a diff to confirm src/core/** stays pure (no child_process/fs/electron/DOM) and injected. Read-only.
tools: Read, Grep, Glob, Bash
---
You enforce AGENTS.md rule #1 (pure core) and #4 (injected services). Given a diff, report any
forbidden import or impurity in src/core/** as `file:line` findings. You do not edit code.
```
