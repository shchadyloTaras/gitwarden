# GitWarden — Agentic DX Execution Prompts

Copy-paste prompts that execute the DX track from `docs/plans/agentic-dx-plan.md` one step at a time.
Each prompt is self-contained and ends with a DX-track progress footer.

**How to use:**

1. Complete each step in order — each unlocks a new way of working with the project.
2. Do not start a step until the previous one's exit criteria are ✅.
3. After each step, read the **"How you work after this"** section to understand your new workflow.
4. The product backlog (Phases 56–62, 40–51) resumes after Step DX-4 at minimum.

**Gate rule:** each step is done only when its exit criteria pass, `docs/progress-log.md` is updated,
and the single commit is made. Never push automatically.

---

## Standard DX-track progress footer

Every prompt below ends with this block:

```
When this step's exit criteria are met:
1. Append an entry to the "## Progress Log" section of docs/progress-log.md under a
   "### DX Track" subsection (create it if it doesn't exist; newest last):
   #### <today's date> — DX-N: <step name>
   - Built: <what was added>
   - Files: <files added/changed>
   - Tests: <guardrail test result if applicable>
   - Exit criteria: ✅ met  (or ⚠️ partial — explain what's left)
   - Notes / follow-ups: <anything worth knowing>
2. Commit ALL changes for this step (only if exit criteria are met):
   git add -A
   git commit -m "DX-N: <step name>" -m "<one-line summary>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless explicitly asked.
3. Report honestly: show exit-criteria checks, test output, what passed and what (if anything) did not.
```

---

## Step DX-0 — Docs reconciliation (Stage 1, prerequisite for everything)

**Problem it solves:** working tree has uncommitted changes, `AGENTS.md` build-order stops at Phase 39
while HEAD is Phase 61, 7 plans are unregistered, and `agentic-dx-plan.md` is untracked and
unformatted. Every subsequent step gates on a clean, honest tree.

**Touches:** only `docs/` and `AGENTS.md`. Zero runtime code changes.

---

### Prompt DX-0

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md
- docs/plans/agentic-dx-plan.md
- docs/progress-log.md (Phase Checklist section)

This is Step DX-0: docs reconciliation. No code changes — docs only.

Tasks (do all in one commit):

1. Run `prettier --write docs/plans/agentic-dx-plan.md` then `git add docs/plans/agentic-dx-plan.md`
   so the untracked file is tracked and formatted.

2. Update AGENTS.md "Build order" §:
   The current line stops at "→ 39 deferred (agentic, allowlist-only)" — extend it to show all
   feature tracks through Phase 62:
   `0→…→20 (MVP) → 21→27 (GitHub OAuth) → 28→39 (AI Connections) → 52→55a (AI Chat) →
   60→61 (GenUI Blocks) | unbuilt: 40→45 (Distribution) → 46→51 (Landing) → 56→59 (Client
   Branch Access) → 62 (GenUI Level 2) | DX track: DX-0→DX-6 (agentic-dx-plan.md)`

3. Update AGENTS.md "Reference docs" § — add the 7 missing plans:
   - docs/plans/distribution-release-plan.md + docs/prompts/distribution-release-prompts.md
   - docs/plans/landing-page-plan.md + docs/prompts/landing-page-prompts.md
   - docs/plans/ai-chat-redesign-plan.md (no separate prompts file)
   - docs/plans/client-branch-access-plan.md + docs/prompts/client-branch-access-prompts.md
   - docs/plans/genui-blocks-plan.md + docs/prompts/genui-blocks-prompts.md
   - docs/plans/header-guard-badge-plan.md + docs/prompts/header-guard-badge-prompts.md
   - docs/plans/agentic-dx-plan.md + docs/prompts/dx-execution-prompts.md

4. In docs/progress-log.md, add a feature-track status table after the Phase Checklist but before
   the Progress Log section. Format:
   | Track | Phases | Status |
   |---|---|---|
   | MVP Core | 0–20 | ✅ complete |
   | GitHub OAuth | 21–27 | ✅ complete |
   | AI Connections | 28–39 | ✅ complete |
   | AI Chat Redesign | 52–55a | ✅ complete |
   | Generative UI Blocks | 60–62 | 🟡 60–61 done, 62 open |
   | Client Branch Access | 56–59 | ⬜ not started |
   | Distribution & Release | 40–45 | ⬜ not started |
   | Landing Page | 46–51 | ⬜ not started |
   | Agentic DX | DX-0–DX-6 | ⬜ not started |

5. Fix docs/plans/header-guard-badge-plan.md status header:
   Change "Status: proposed" → "Status: ✅ implemented (commit 233a08e)"

6. Verify nothing else is out of place:
   - Run `git status` — after git add steps above, only AGENTS.md and tracked plan files should remain
   - Run `npm run lint` — confirm ESLint + Prettier clean (the prettier fix in task 1 should clear it)
   - Run `npx tsc -p tsconfig.web.json --noEmit && npx tsc -p tsconfig.node.json --noEmit` — confirm green

Exit criteria:
- `git status` shows no untracked files and no stray modifications
- All 10 plans + their prompts referenced in AGENTS.md
- AGENTS.md build-order shows Phase 61 at HEAD
- Status table present in progress-log.md
- header-guard-badge-plan.md status corrected
- npm run lint clean

Update WORKFLOW.md:
- Change "Current level: Baseline" → "Current level: DX-0 — Clean orientation"
- Change the DX-0 section header from "🔒 DX-0" → "✅ DX-0"
- Uncomment the block inside the DX-0 section (remove the <!-- and --> lines)

Then run the standard DX-track progress footer (commit as "DX-0: Docs reconciliation").
```

---

### How you work after DX-0

**Before:** docs lie — build-order stops at 39, 7 plans invisible to agents, tree dirty.
**After:** every agent (including Claude Code in a fresh session) picks up the full picture from
`AGENTS.md` alone. The status table in `progress-log.md` is a one-glance dashboard.

New working pattern:

- When you start a new session: Claude reads `AGENTS.md` → sees all tracks, all plans, correct HEAD.
- When you want to know project status: open `docs/progress-log.md` status table — no spelunking.
- When you hand the repo to Codex or another agent: `AGENTS.md` contains the correct map.

---

## Step DX-1 — Executable guardrails (hooks + `settings.json`)

**Problem it solves:** the three non-negotiable architecture invariants (pure `src/core/`, no global
git config, `execFile` only in `src/main/git/`) hold today because of discipline — nothing mechanical
enforces them. One distracted agent edit can silently break them. This step makes violations
impossible without a visible block.

**Touches:** adds `.claude/` directory with `settings.json` and `hooks/`. Adds `tests/tooling/`.
Zero changes to `src/`.

---

### Prompt DX-1

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md
- docs/plans/agentic-dx-plan.md §Step DX-1
- docs/plans/agentic-dx-plan.md Appendix A (hook JSON shape)

This is Step DX-1: executable guardrails. Adds .claude/ tooling only — zero changes to src/.

IMPORTANT before writing hooks: verify the current Claude Code hooks JSON format and exit-code
behaviour by checking the Claude Code docs or any in-repo reference. The plan's Appendix A has an
illustrative sketch but flags that field-level details may have drifted. Use the correct current
schema.

Tasks:

1. Create .claude/settings.json with:
   a) permissions.allow for the safe, frequent commands (stop permission prompts):
      - Bash(npm run test), Bash(npm test), Bash(npm run lint), Bash(npm run e2e),
        Bash(npm run build), Bash(npm run dev), Bash(npm run pack)
      - Bash(git status), Bash(git diff*), Bash(git log*), Bash(git show*)
      - Bash(npx tsc*), Bash(npx prettier*)
   b) hooks:
      - PreToolUse on Bash: run .claude/hooks/no-global-git-config.sh
        (blocks git config --global and git config --system; cites AGENTS.md rule "only --local")
      - PostToolUse on Edit|Write|MultiEdit: run .claude/hooks/core-purity.sh
        (if path is under src/core/, grep new content for forbidden imports:
         child_process, node:child_process, 'fs', "fs", node:fs, electron, DOM globals
         (window., document.); block with AGENTS.md rule #1 message if found)
      - PostToolUse on Edit|Write|MultiEdit: run .claude/hooks/execfile-guard.sh
        (if content adds execFile/exec/spawn and path is NOT under src/main/git/ and NOT a test file,
         warn citing AGENTS.md rule #2; fail-open on own error)

2. Create .claude/hooks/no-global-git-config.sh — reads stdin JSON, extracts the command string,
   checks for "config --global" or "config --system", exits 2 with a rule-citing message if found,
   exits 0 otherwise. On any internal error: exit 0 (fail-open, agentic-dx-plan.md §3 rule 2).

3. Create .claude/hooks/core-purity.sh — reads stdin JSON, extracts file path and new content,
   if path matches src/core/ greps content for forbidden imports, exits 2 with a message citing
   AGENTS.md rule #1 if found. On any internal error: exit 0.

4. Create .claude/hooks/execfile-guard.sh — reads stdin JSON, if path outside src/main/git/
   and not a test file and content contains execFile/exec\b/spawn\b, exits 2 with AGENTS.md rule #2
   message. On any internal error: exit 0.

5. Make all hook scripts executable (chmod +x).

6. Create tests/tooling/guardrails.test.sh (or a Vitest/Node test file) that:
   - Feeds each hook a known-bad payload via stdin and asserts exit code 2.
   - Feeds each hook a known-good payload and asserts exit code 0.
   - Feeds each hook a malformed/empty stdin and asserts exit code 0 (fail-open).
   Document how to run: `bash tests/tooling/guardrails.test.sh` or `npm run test:tooling`.

7. Add "test:tooling": "bash tests/tooling/guardrails.test.sh" to package.json scripts.

8. Run the guardrail tests and confirm all pass.

9. Run npm run lint and both tsc projects — confirm clean.

Exit criteria:
- .claude/settings.json exists and parses as valid JSON
- All three hook scripts exist and are executable
- Each hook blocks a known-bad payload (exit 2) and allows a known-good one (exit 0)
- Each hook exits 0 on malformed stdin (fail-open)
- npm run test:tooling passes
- npm run lint and both tsc projects clean
- No changes to src/

Update WORKFLOW.md:
- Change "Current level" → "Current level: DX-1 — Guardrails active"
- Change "🔒 DX-1" → "✅ DX-1"
- Uncomment the DX-1 block (remove the <!-- and --> lines)

Then run the standard DX-track progress footer (commit as "DX-1: Executable guardrails").
```

---

### How you work after DX-1

**Before:** you manually remember the rules; an agent can accidentally add `import fs from 'fs'` to
`src/core/` and it silently compiles.
**After:** the violation is blocked at edit time with a message citing the rule. `git config --global`
is blocked automatically. Common commands no longer prompt for permission.

New working pattern:

- `npm run test`, `npm run lint`, `git status`, `git diff` — **no more permission prompts**.
- If Claude tries to edit `src/core/` with a forbidden import → blocked instantly, you see the rule.
- If you ever see the hook fire falsely → it's a real invariant being tested. Fix the code, not the hook.
- To audit the guardrails anytime: `npm run test:tooling`.

---

## Step DX-2 — Slash commands (`.claude/commands/`)

**Problem it solves:** the per-phase ritual (run both tsc + vitest + lint + e2e, then craft the exact
commit message with the trailer) is retyped every session. One command per job; identical execution
every time.

**Touches:** adds `.claude/commands/`. Zero changes to `src/`.

---

### Prompt DX-2

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md — "Operating workflow", "Git workflow", "Definition of Done"
- docs/plans/agentic-dx-plan.md §Step DX-2 and Appendix A (command shape)

This is Step DX-2: slash commands. Adds .claude/commands/ only — zero changes to src/.

Create the following four command files. Each must have YAML frontmatter with:
  description, argument-hint (if needed), allowed-tools

---

### .claude/commands/verify-phase.md

description: "Run the full phase gate: both tsc projects, vitest, lint, and optionally e2e"
argument-hint: "[--ui]"
allowed-tools: Bash(npx tsc*), Bash(npm run lint), Bash(npm test), Bash(npm run e2e)

Body: Run in order, stopping on first failure:
1. npx tsc -p tsconfig.node.json --noEmit  (ALWAYS — this is the one most often forgotten)
2. npx tsc -p tsconfig.web.json --noEmit
3. npm test (Vitest)
4. npm run lint
5. If --ui argument is present: npm run e2e

Report each step as ✅/❌ with the exact last 5 lines of output.
Final summary: GATE PASS (all green) or GATE FAIL (list what failed).

---

### .claude/commands/commit-phase.md

description: "Commit exactly 'Phase N: <name>' with the project trailer. Refuses on red tests. Never pushes."
argument-hint: "<N> <phase name...>"
allowed-tools: Bash(npm test), Bash(git add*), Bash(git commit*), Bash(git status)

Body:
1. Run npm test — if any test fails, STOP and report "REFUSED: tests are red. Fix tests first."
2. Run git add -A
3. Commit with:
   subject: "Phase $N: <rest of $ARGUMENTS>"
   body: one-line summary of what was built
   trailer: "Co-Authored-By: Claude <noreply@anthropic.com>"
4. Report the full commit hash and subject.
5. Do NOT run git push under any circumstances.

---

### .claude/commands/new-phase.md

description: "Scaffold a new phase: read its plan section and prompt, check previous phase gate, show Goal/Tasks/Exit"
argument-hint: "<phase-number-or-DX-N>"
allowed-tools: Read, Bash(grep*), Bash(git log*)

Body:
1. Read docs/progress-log.md — find the previous phase entry and confirm Exit criteria shows ✅.
   If previous phase not ✅, STOP: "Previous phase gate not met. Check docs/progress-log.md."
2. Identify which plan file owns this phase (use docs/plans/ matching and AGENTS.md reference docs).
3. Read the matching section from that plan and its prompts file.
4. Output:
   ### Phase <N> — <name>
   **Gate:** previous phase ✅ (confirmed from progress-log.md)
   **Plan section:** <plan file> §<section>
   **Prompt file:** <prompts file>
   **Goal:** <from plan>
   **Tasks:** <from plan>
   **Exit criteria:** <from plan>
   **Architecture rules to watch:** <list relevant AGENTS.md rules for this phase>

---

### .claude/commands/log-phase.md

description: "Append the Progress-Log entry and tick the Phase Checklist for a completed phase"
argument-hint: "<N> <name> — then describe what was built"
allowed-tools: Read, Edit, Bash(date*)

Body:
1. Read docs/progress-log.md to get today's log format from recent entries.
2. Append a new entry under "## Progress Log" (newest last) following the exact format of recent entries.
   The entry must include: Built, Files, Tests (exact numbers), Exit criteria (✅ or ⚠️), Notes.
3. Find Phase <N>'s checkbox in the Phase Checklist and change `[ ]` to `[x]`.
4. Do NOT commit — the commit is a separate step (use /commit-phase).
5. Report what was appended and what checkbox was ticked.

---

After creating all four commands:
- Confirm each file has valid frontmatter (description + allowed-tools at minimum)
- Run /verify-phase mentally: does it cover both tsc projects? Yes.
- Run npm run lint — confirm clean.

Exit criteria:
- All four command files exist under .claude/commands/
- /verify-phase runs both tsc projects in step 1 and 2 (not just one)
- /commit-phase refuses on red tests and produces the exact "Phase N: <name>" subject
- /new-phase checks the previous phase gate before scaffolding
- /log-phase writes the entry without committing
- npm run lint clean

Update WORKFLOW.md:
- Change "Current level" → "Current level: DX-2 — Phase workflow in four commands"
- Change "🔒 DX-2" → "✅ DX-2"
- Uncomment the DX-2 block (remove the <!-- and --> lines)

Then run the standard DX-track progress footer (commit as "DX-2: Slash commands").
```

---

### How you work after DX-2

**Before:** every phase close requires you to remember: run tsc node, run tsc web, run vitest, run lint,
craft the exact commit message with the `Co-Authored-By` trailer, don't forget to update the log.
**After:** four commands replace that ritual entirely.

New working pattern — a phase now closes like this:

```
/new-phase 56          ← check gate, read the plan, get the brief
<implement the phase>
/verify-phase --ui     ← run the full gate; see GATE PASS or GATE FAIL
/log-phase 56 Push Policy Foundations — <summary bullets>
/commit-phase 56 Push Policy Foundations
```

That's it. Four commands, the same every time, impossible to format wrong.

---

## Step DX-3 — Subagent reviewers (`.claude/agents/`)

**Problem it solves:** when you write code, the same agent wrote and is reviewing it — maker = checker.
Two invariants (core purity, security rules) need an independent eye that hasn't seen the session
context. These reviewers are clean-context: they read only the diff and the cited rule.

**Touches:** adds `.claude/agents/`. One line added to `AGENTS.md`. Zero changes to `src/`.

---

### Prompt DX-3

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md (all architecture rules, especially #1, #2, #4, #5, #6)
- SECURITY.md
- docs/plans/agentic-dx-plan.md §Step DX-3 and Appendix A (agent shape)
- docs/plans/ai-integration-plan.md §Authority boundary (advisory-only AI rule)

This is Step DX-3: subagent reviewers. Adds .claude/agents/ and one AGENTS.md line — zero src/ changes.

Create the following two agent files. Each must have YAML frontmatter:
  name, description, tools

---

### .claude/agents/core-purity-reviewer.md

name: core-purity-reviewer
description: "Read-only. Given a diff or file list, confirms src/core/** stays free of forbidden imports (child_process, fs, electron, DOM) and that new code is pure + injected. Reports file:line findings. Does not edit code."
tools: Read, Grep, Glob, Bash

System prompt body (enforce these rules from AGENTS.md):
- RULE #1: src/core/ must have NO imports of child_process (any variant), fs, node:fs, electron, window, document, or any DOM global.
- RULE #4: every service in src/core/ must be expressed as an interface and injected (no direct instantiation of concrete services with I/O side-effects).

Behaviour:
1. Read the list of changed/new files in src/core/.
2. For each file, grep for the forbidden patterns.
3. Check that new service consumers reference an interface type, not a concrete class.
4. Report findings as: FINDING: <file>:<line> — <what> violates AGENTS.md rule #N.
5. If no findings: report CLEAN — src/core/ purity confirmed.
6. You do not edit code. You do not suggest alternatives unless asked.

---

### .claude/agents/safety-reviewer.md

name: safety-reviewer
description: "Read-only. Reviews a diff touching src/main/git, src/main/security, src/main/ai, or IPC for: secrets-never-logged, git args as arrays (not strings), paths after --, destructive/remote actions behind confirmation, advisory-only AI boundary. Reports file:line findings."
tools: Read, Grep, Glob, Bash

System prompt body (enforce these rules):
- AGENTS.md: "Never log secrets" — no console.log/error of tokens, passwords, keys, env vars containing SECRET/TOKEN/KEY/PASS.
- AGENTS.md: "Git args are always an array, never string-interpolated; path args after --"
- AGENTS.md: "Destructive/remote actions stay behind confirmation"
- SECURITY.md: execFile only (no exec/spawn with a shell string)
- ai-integration-plan.md: AI assistants are advisory-only; they must never trigger git actions autonomously

Behaviour:
1. Read each changed file in the diff.
2. Check for each rule violation.
3. Report as: FINDING: <file>:<line> — <what> violates <rule source>.
4. If no findings: report CLEAN — safety rules confirmed.
5. You do not edit code.

---

After creating both agents:
- Add one line to AGENTS.md under "Reference docs":
  "**Subagent reviewers:** `.claude/agents/core-purity-reviewer.md` (AGENTS.md #1/#4),
   `.claude/agents/safety-reviewer.md` (SECURITY.md + AI advisory boundary)"
- Demonstrate: create a temp file with `import { execFile } from 'child_process'` in src/core/,
  invoke core-purity-reviewer on it, confirm it returns a FINDING. Then delete the temp file.
- Run npm run lint — confirm clean.

Exit criteria:
- Both agent files exist with name/description/tools frontmatter
- core-purity-reviewer returns a FINDING on a deliberately impure src/core/ file
- safety-reviewer returns a FINDING on a diff that logs a token variable
- AGENTS.md references both agents
- npm run lint clean

Update WORKFLOW.md:
- Change "Current level" → "Current level: DX-3 — Maker ≠ checker"
- Change "🔒 DX-3" → "✅ DX-3"
- Uncomment the DX-3 block (remove the <!-- and --> lines)

Then run the standard DX-track progress footer (commit as "DX-3: Subagent reviewers").
```

---

### How you work after DX-3

**Before:** code review is ad-hoc — the same agent that wrote the code reviews it.
**After:** maker ≠ checker. You can invoke a clean-context reviewer on any diff.

New working pattern — before committing any phase touching `src/core/` or `src/main/`:

```
Task: review the changes I made in src/core/ for purity violations.
Use the core-purity-reviewer subagent.

Task: review the diff for security rule violations.
Use the safety-reviewer subagent.
```

The reviewer agents start with no session context — they only know the diff and the rules. That's the
whole point.

---

## Step DX-4 — AI evals (`tests/evals/`)

**Problem it solves:** Smart Commit, Change Review, Safety Copilot, and the new GenUI chat cards are
fully built — but quality is assumed, not measured. There are no evals. This is the biggest modern gap.
**Gate rule:** DX-4 must be done before Phase 62 (free-text model-chosen GenUI) is started, because
Phase 62 opens a new free-text AI surface with no baseline.

**Touches:** adds `tests/evals/` and `npm run eval`. Zero changes to `src/`.

---

### Prompt DX-4

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md
- docs/plans/agentic-dx-plan.md §Step DX-4
- docs/plans/ai-integration-plan.md §Advisory-only invariant, §Smart Commit, §Safety Copilot
- src/core/ai/ — scan the types and chatBlocks.ts to understand the output shapes
- src/main/testing/ — check if GITWARDEN_E2E_FAKE_AI or a fake adapter already exists

This is Step DX-4: AI evals. Adds tests/evals/ and npm run eval — zero src/ changes.

Tasks:

1. Understand the existing fake AI adapter: find where GITWARDEN_E2E_FAKE_AI or equivalent is
   defined and how it produces canned responses. Evals must use it (offline, deterministic).

2. Create tests/evals/README.md explaining:
   - What evals are (offline quality checks against the fake adapter)
   - How to add a new case (one fixture file = one case)
   - How to run live spot-check mode (skip by default, env var to enable)
   - The golden-set format

3. Create tests/evals/fixtures/ with at least 5 golden cases covering:
   a. smart-commit: diff with staged changes → commit subject ≤ 50 chars, imperative mood,
      no file names as subject, no secrets leaked, references the change not the file
   b. smart-commit: diff that would tempt a "chore: update" → must be specific
   c. safety-copilot: repo with work profile, commit attempted with personal email
      → must produce a PROFILE_MISMATCH or IDENTITY_CONFLICT finding
   d. change-review: diff with an obvious bug (off-by-one, missing null check) → must find it
   e. change-review: clean diff → must not report false positives (≤ 0 findings)

   Each fixture: { input: { diff, repoContext, … }, expectedProperties: { … } }

4. Create tests/evals/run-evals.ts (Vitest or plain Node/ts-node):
   - Loads each fixture from tests/evals/fixtures/
   - Calls the relevant assistant through the fake adapter
   - Asserts each expectedProperty (structural/regex checks, not exact strings)
   - Reports per-case pass/fail with the actual vs expected
   - Skips live-AI mode unless GITWARDEN_EVAL_LIVE=1

5. Add to package.json scripts:
   "eval": "vitest run tests/evals/ --reporter=verbose"
   (or equivalent that runs offline by default)

6. Run npm run eval — confirm all 5 cases pass with the fake adapter.

7. Run npm run lint and both tsc projects — confirm clean.

Exit criteria:
- npm run eval runs without network access and reports per-case pass/fail
- The wrong-profile Safety Copilot case (c) passes (PROFILE_MISMATCH detected)
- The false-positive case (e) passes (no spurious findings)
- Adding a new case is a one-file addition to tests/evals/fixtures/
- npm run lint and both tsc clean

Update WORKFLOW.md:
- Change "Current level" → "Current level: DX-4 — Measured AI quality"
- Change "🔒 DX-4" → "✅ DX-4"
- Uncomment the DX-4 block (remove the <!-- and --> lines)

Then run the standard DX-track progress footer (commit as "DX-4: AI evals").
```

---

### How you work after DX-4

**Before:** "the AI feature works" means e2e tests passed — but quality (tone, accuracy, safety) is
assumed. You can't know if a change degraded Smart Commit quality without trying it manually.
**After:** `npm run eval` gives a measurable quality baseline. Regressions surface before commit.

New working pattern — add this to your gate before any AI-touching phase:

```
/verify-phase    ← tsc + vitest + lint
npm run eval     ← AI quality check (add this for phases 28–62 and DX-4+)
```

And when adding a new AI capability (e.g. Phase 62 free-text GenUI):

1. Add a golden fixture for the new capability first.
2. Implement.
3. `npm run eval` must pass before `/commit-phase`.

**Product backlog unblocked:** after DX-4, Phase 62 is safe to start.

---

## Step DX-5 — Agent-agnostic shareability

**Problem it solves:** handing the repo to another tool (Codex, Gemini, a new Claude session) requires
explaining the whole project from scratch. `repomix` packs it to one file. `CONTRIBUTING.md` gives
a human the same orientation in 5 minutes.

**Touches:** adds `repomix.config.json`, `CONTRIBUTING.md`, and `npm run pack`. Optionally one diagram.
Zero changes to `src/`.

---

### Prompt DX-5

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md
- docs/plans/agentic-dx-plan.md §Step DX-5

This is Step DX-5: agent-agnostic shareability. Adds config, docs, and one npm script.

Tasks:

1. Create repomix.config.json at the repo root:
   {
     "output": { "filePath": "gitwarden-context.txt", "style": "xml" },
     "ignore": {
       "useGitignore": true,
       "useDefaultPatterns": true,
       "customPatterns": [
         "node_modules/**", "out/**", "dist/**",
         "*.tsbuildinfo", "package-lock.json",
         "gitwarden-context.txt",
         "**/*.key", "**/*.pem", "**/.env*"
       ]
     }
   }
   Add "gitwarden-context.txt" to .gitignore.

2. Add to package.json scripts:
   "pack": "npx repomix"

3. Run npm run pack — confirm it produces gitwarden-context.txt without secrets or node_modules.
   Check the output size is reasonable (< ~2 MB ideally).

4. Create CONTRIBUTING.md at the repo root. Keep it under 100 lines. Include:
   - One-sentence project description + link to AGENTS.md as the agent source of truth
   - Prerequisites (Node version from package.json, git, electron dependencies)
   - The five commands: dev, test, e2e, lint, build
   - The phase workflow in 6 steps (copy from AGENTS.md "Operating workflow" — do not duplicate prose,
     just reference AGENTS.md and add the /verify-phase and /commit-phase shortcuts from DX-2)
   - The non-negotiables (pure core, GitRunner-only execFile, no global git config) as 3 bullet points
   - How to load the repo into another AI tool: npm run pack → paste gitwarden-context.txt

5. Run npm run lint — confirm clean.

Exit criteria:
- npm run pack produces gitwarden-context.txt (not checked into git)
- gitwarden-context.txt contains no node_modules/, no *.tsbuildinfo, no secrets
- CONTRIBUTING.md exists, < 100 lines, links to AGENTS.md rather than duplicating it
- npm run lint clean

Update WORKFLOW.md:
- Change "Current level" → "Current level: DX-5 — Agent-agnostic"
- Change "🔒 DX-5" → "✅ DX-5"
- Uncomment the DX-5 block (remove the <!-- and --> lines)

Then run the standard DX-track progress footer (commit as "DX-5: Shareability").
```

---

### How you work after DX-5

**Before:** giving the repo to a new tool means explaining context from scratch.
**After:** `npm run pack` → paste `gitwarden-context.txt` → the tool has the full picture.

New working pattern:

- New agent / new tool → `npm run pack` → paste output. Done.
- Human onboarder → `CONTRIBUTING.md` → can run the app and understand the rules in 5 minutes.
- Before a long Claude session on a complex cross-cutting feature: `npm run pack`, paste into a fresh
  context, ask Claude to map the codebase before starting.

---

## Step DX-6 — Optional / à la carte

Do any of these independently. None are required. Do not batch them.

| Option                             | When to do it                                                               | Prompt approach                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Architecture diagram**           | When a new agent/human is confused by core↔main↔preload↔renderer boundaries | Ask Claude to produce `docs/architecture.md` with an ASCII or Mermaid diagram of the 4 layers and their crossing rules |
| **project-factory onboard**        | When starting a genuinely new feature (not retroactively)                   | `/project-factory:onboard` on the new feature's plan — do NOT run across existing 61 phases                            |
| **Split DECISIONS.md → ADR files** | When the monolith starts hurting navigation (likely > 20 decisions)         | Ask Claude to split each decision to `docs/adr/NNNN-*.md` MADR format, one commit                                      |
| **GenUI north-star refs**          | Before Phase 62                                                             | Add Vercel AI SDK generative-UI + Google A2UI links to genui-blocks-plan.md as named anchors                           |
| **.mcp.json code-graph**           | If codebase navigation is costing real time in sessions                     | Add project-scoped MCP only when the pain is demonstrated, not speculatively                                           |

---

## Product backlog (resumes after DX-4 minimum)

Recommended order — business decision is yours, this is the rationale:

### Prompt: Client Branch Access (Phases 56–59)

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md
- docs/plans/client-branch-access-plan.md
- docs/prompts/client-branch-access-prompts.md
- docs/progress-log.md (confirm Phases 0–55a and DX-0–DX-4 are ✅)

Run /new-phase 56 to confirm the gate, read the plan section, and get the implementation brief.
Then follow the standard phase workflow.
```

### Prompt: Distribution & Release (Phases 40–45)

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md
- docs/plans/distribution-release-plan.md
- docs/prompts/distribution-release-prompts.md
- docs/progress-log.md (confirm all prerequisite phases ✅)

Run /new-phase 40 to confirm the gate and get the implementation brief.
Then follow the standard phase workflow.
```

### Prompt: Phase 62 — Free-text GenUI (requires DX-4 first)

```
Work in the GitWarden repository at /Users/tarasshchadylo/Documents/agents-project/git-visual.

Before doing anything, read:
- AGENTS.md
- docs/plans/genui-blocks-plan.md §Phase 62
- docs/prompts/genui-blocks-prompts.md
- tests/evals/ — confirm npm run eval passes (DX-4 exit criteria)
- docs/progress-log.md (confirm Phase 61 and DX-4 are ✅)

Run /new-phase 62 to confirm the gate and get the implementation brief.
Then follow the standard phase workflow.
```

---

## Quick reference: new workflow summary

| Before DX track                            | After full DX track (DX-0→DX-5)                              |
| ------------------------------------------ | ------------------------------------------------------------ |
| Docs may not match reality                 | Status table in progress-log.md is single source of truth    |
| Permission prompts for npm/git             | Allowlisted — run silently                                   |
| Invariant violations possible              | Blocked at edit time by hooks                                |
| Phase gate = 5 manual commands             | `/verify-phase` — one command                                |
| Commit format from memory                  | `/commit-phase N name` — exact format every time             |
| Starting a phase = reading 3 docs          | `/new-phase N` — reads them, checks gate, shows brief        |
| AI quality assumed                         | `npm run eval` — measured before every AI-touching commit    |
| New tool onboarding = explain from scratch | `npm run pack` → paste                                       |
| Review = same agent that wrote             | `@core-purity-reviewer` / `@safety-reviewer` — clean context |
