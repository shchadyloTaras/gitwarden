# GitWarden — SDD Documentation Migration Prompts

Copy-paste prompts to drive the SDD documentation migration one step at a time. Each prompt is self-contained and points at the plan (`docs/plans/sdd-migration-plan.md`).

**How to use:** run prompts in order (M0 → M6). This is a **chore/infra track**, not a numbered product phase — `/new-phase` does **not** work here (the track is intentionally absent from the phase tables). Drive it by copying the `M-N` block below directly. Do not start a step until the previous step's Exit criteria are met. References: migration plan in `docs/plans/sdd-migration-plan.md`, rules in `CLAUDE.md` / `AGENTS.md`.

**This track is destructive and self-consuming.** M6 deletes `docs/plans/` and `docs/prompts/` — including this prompts file and the migration plan. That is intended (the scaffolding is consumed when done). The destructive step runs **only** after the M5 gates pass, and the delete is `git rm` in its own revertable commit.

**No commit-per-phase footer here.** Unlike product phases, this track commits at specific steps (M3, M4, M6) and is logged **once** as a `## Documentation` entry in M6 — **not** in the Phase Checklist. Each prompt below states its own commit/no-commit instruction.

---

## M0 — Safety preconditions

```
Work on step M0 of the SDD migration (see docs/plans/sdd-migration-plan.md §4 M0). This is a safety gate — do NOT touch any files yet.

Tasks:
- Run `git status --porcelain`. If it returns ANY output (dirty tree), STOP and report — do not proceed.
- Run `git rev-parse --abbrev-ref HEAD`. If it is `main`, run `git switch -c chore/sdd-migration`. If already on a non-main branch, confirm it is the intended migration branch.

Exit criteria: on branch `chore/sdd-migration` (or an explicitly intended non-main branch), working tree clean. Report the branch name and tree status. Do NOT commit anything.
```

---

## M1 — Convert each feature to spec.md + tasks.md

```
Work on step M1 of the SDD migration (docs/plans/sdd-migration-plan.md §2, §4 M1, Appendix B/C). Convert each of the 10 plans into an SDD docs/features/<slug>/ folder. KEEP every existing slug — do NOT rename. No deletion in this step.

Slug + prompts mapping (from plan §2 — note the 3 exceptions):
  gitwarden            -> docs/prompts/phase-prompts.md
  github-oauth         -> docs/prompts/github-oauth-prompts.md
  ai-integration       -> docs/prompts/ai-integration-prompts.md
  ai-chat-redesign     -> NONE (prompts are inline in the plan; do NOT invent a path)
  distribution-release -> docs/prompts/distribution-release-prompts.md
  landing-page         -> docs/prompts/landing-page-prompts.md
  client-branch-access -> docs/prompts/client-branch-access-prompts.md
  genui-blocks         -> docs/prompts/genui-blocks-prompts.md
  agentic-dx           -> docs/prompts/dx-execution-prompts.md
  header-guard-badge   -> docs/prompts/header-guard-badge-prompts.md   (SPECIAL — see below)

For each slug:
- Create docs/features/<slug>/. Bootstrap CONTEXT.md and reconcile every domain role/term the plan uses (Personal/Work/Client profile, repo, push policy, SSH key, ...) into its ## Glossary via the glossary skill BEFORE writing §4, so §4 roles are canonical (no invented user/admin).
- Classify size against the 4-signal matrix; write docs/features/<slug>/.size (these multi-file plans are almost all M+). Mirror it in spec frontmatter feature_size.
- Write spec.md by MAPPING plan intent into §1–§8 (Context, Goals, Non-goals, User stories ≥5, Acceptance criteria, NFRs numeric + §6.1 Security/privacy, KPIs ≥3, Open questions with owner+due). TRANSFORM, don't transcribe: lift behavior to business-observable Given/When/Then; STRIP every HTTP verb / URL path / status-code numeric / module.error_name / JSON fragment / SQL construct from §5 (those map to api/data-model later). Fill every section or write an explicit <!-- N/A: reason -->.
- Write docs/features/<slug>/tasks.md holding the plan's HOW + the matching prompts file's per-phase steps/file-lists. Do NOT copy the commit/push/progress-log ritual — it stays in AGENTS.md.
- Self-run the forbidden-token regex over §5 and verify BOTH coverage floors (≥1 AC of each of the 5 types: happy/error/authorization/domain-invariant/cross-context, AND ≥1 AC per retained §4 user story).
- Dispatch the sdd:critic subagent on the assembled spec.md (clean context) and resolve every finding. Do NOT skip the critic.

SPECIAL CASE — header-guard-badge: it owns NO phase range and is absent from all phase tables. Convert its plan+prompts the same way, but do NOT add it to any phase table. Preserve its self-asserted "Status: ✅ implemented (commit f37c7ee)" in the spec frontmatter (not re-derivable from a checklist).

Exit criteria: all 10 docs/features/<slug>/{spec.md,tasks.md,.size,CONTEXT.md} exist; every spec.md has §1–§8, zero forbidden tokens in §5, both coverage floors met, feature_size matches .size, and sdd:critic passed. Nothing deleted; docs/plans/ and docs/prompts/ untouched. Do NOT commit yet (M3 commits).
```

---

## M2 — Architecture map + roadmap

```
Work on step M2 of the SDD migration (docs/plans/sdd-migration-plan.md §4 M2). Produce the repo-level SDD artifacts, handling interactivity.

Tasks:
- docs/architecture-map.md: if it already exists, REUSE it (do not re-run survey interactively). Otherwise run `sdd:survey gitwarden` and accept its scan.
- Run `sdd:roadmap gitwarden` to create docs/roadmap.md. Place each feature in Now/Next/Later per its completion status in docs/progress-log.md. Distribution & Release stays 🟡 PARTIAL (40–42, 45 done; 43–44 open) — preserve that.

Exit criteria: docs/architecture-map.md and docs/roadmap.md exist and are non-trivial; the roadmap reflects real per-track status incl. the Distribution partial. Do NOT commit yet (M3 commits).
```

---

## M3 — Commit migrated artifacts (old folders still present)

```
Work on step M3 of the SDD migration (docs/plans/sdd-migration-plan.md §4 M3, Appendix D). Commit the new artifacts WHILE docs/plans/ and docs/prompts/ still exist, so source-of-truth is never deleted in favor of uncommitted replacements.

Tasks:
- Stage ONLY the new artifacts: `git add docs/features docs/architecture-map.md docs/roadmap.md`.
- Commit: `docs: add SDD feature specs (migrated from plans/prompts)` with a one-line body and the trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Do NOT push.

Exit criteria: the docs/features/ tree + architecture-map.md + roadmap.md are committed on chore/sdd-migration; docs/plans/ and docs/prompts/ still present and unchanged. Report the commit hash.
```

---

## M4 — Repoint every reference (then commit)

```
Work on step M4 of the SDD migration (docs/plans/sdd-migration-plan.md §4 M4, Appendix A). Repoint EVERY reference so nothing dangles after M6. Keep slugs: replace docs/plans/<slug>-plan.md (and the matching prompts path) with docs/features/<slug>/spec.md.

DISCOVER FIRST — do not trust a hand list. Run the Gate-B grep and repoint EVERY hit it returns:
  rg -n 'docs/plans|docs/prompts' -g '!node_modules/**' -g '!dist/**' -g '!docs/plans/**' -g '!docs/prompts/**'
Appendix A is the verified known set (a checklist over the grep), not a replacement for it. Known sites:
- AGENTS.md — "Reference docs" block (all 10 bullets incl. header-guard-badge); operating-workflow step 1 (the SECOND, prose copy — rewrite the whole sentence); the "Before working" line; the SoT-rule line naming docs/plans/.
- WORKFLOW.md — RESOLVER REWRITE, not a token swap: collapse its separate "read the plan in docs/plans/" + "read the prompt in docs/prompts/" steps into ONE docs/features/<slug>/spec.md read; repoint the dx-execution-prompts.md reference (~line 85).
- README.md, SECURITY.md, CONTRIBUTING.md, DECISIONS.md.
- docs/progress-log.md — GREP THE WHOLE FILE: per-track sub-headings AND inline body-prose refs (superseded-by notes, past file-list lines), not just the headings.
- docs/code-graph-mcp.md (~line 10) -> docs/features/agentic-dx/spec.md.
- landing/README.md (~lines 12-13, relative ../docs/plans/... form) -> both links to docs/features/landing-page/spec.md.
- All 8 docs/adr/*.md `source:` frontmatter lines: 0001,0002,0003,0005,0006 -> gitwarden; 0004 -> github-oauth; 0007 -> ai-integration; 0008 -> ai-chat-redesign (all to docs/features/<slug>/spec.md).
- .claude/commands/new-phase.md — rewrite the table to a single docs/features/<slug>/spec.md column; DERIVE <slug> from the existing plan basename (the table has no slug column); PRESERVE the literal ranges 52–55a and DX-0–DX-6.
- .claude/commands/log-phase.md — reconcile its phase->track NAME table (names, not paths; won't appear in a path grep).
- .claude/commands/run-track.md — REWRITE the RESOLVE convention to docs/features/<slug>/spec.md (drop the prompts-path concept); preserve the 3 exceptions (gitwarden, agentic-dx, ai-chat-redesign). sdd-migration is NEVER a run-track target — do not add it to the resolver.
- Cross-plan narrative links in the new spec.md/tasks.md bodies -> docs/features/<other>/spec.md.
- The 12 .ts source comments (Appendix A table) — 11 -> docs/features/github-oauth/spec.md, 1 (src/core/ai/types.ts:7) -> docs/features/ai-integration/spec.md.
- ANCHORS: when a repointed ref cites a plan §7.x / Phase N / Appendix X (ADR source: lines, the .ts comments, code-graph-mcp.md), DROP or remap it to the SDD section (or tasks.md for HOW/phase anchors) — plan numbering does not survive the transform. Never leave a pointer claiming a section that no longer exists.
- Re-derive affected views (AGENTS.md Build order, Feature Track Status) per the single-source-of-truth rule. Do NOT change any Phase Checklist box state.

Leave the migration's OWN files (docs/plans/sdd-migration-plan.md, docs/prompts/sdd-migration-prompts.md) as-is — they sit inside the doomed dirs and are deleted in M6. BUT in SURVIVING docs, REMOVE (do not repoint) any reference TO them — they have no features/ target: the AGENTS.md "SDD migration (transient chore)" Reference-docs line, and the historical docs/progress-log.md parenthetical (~line 848) naming docs/plans/sdd-migration-plan.md. Removing these keeps Gate B green at M5. Make all edits idempotent (re-running changes nothing).

Then:
- `git add -A` and commit: `docs: repoint all references to SDD feature specs` with the trailer. Do NOT push.

Exit criteria: every reference site in Appendix A updated; the 12 .ts comments repointed; views re-derived; commit made. Report the commit hash.
```

---

## M5 — Verification gates (HARD HALT on failure)

```
Work on step M5 of the SDD migration (docs/plans/sdd-migration-plan.md §3, §4 M5). Prove deletion is safe. If ANY gate fails, STOP — do not proceed to M6; report what failed and fix it in M4, then re-run M5.

Run all four gates:
- Gate A (md completeness): rg -n 'docs/plans|docs/prompts' -g '*.md' -g '!docs/plans/**' -g '!docs/prompts/**'   → MUST be empty.
- Gate B (all-types residual): rg -n 'docs/plans|docs/prompts' -g '!node_modules/**' -g '!dist/**' -g '!docs/plans/**' -g '!docs/prompts/**'   → MUST be empty (catches the 12 .ts comments, the 8 docs/adr/* source: lines, docs/code-graph-mcp.md, landing/README.md, and progress-log body prose).
- Gate C (forward links): for every docs/features/<slug>/spec.md referenced in the updated files, assert the target file exists on disk AND any cited section anchor resolves (no stale §7.x / Phase N / Appendix X left over from the transform).
- Gate D (spec floor): each spec.md has §1–§8 present, frontmatter feature_size matches .size, and sdd:critic passed for it.

Exit criteria: all four gates green. Report each gate's result explicitly (command + output). Do NOT delete anything in this step.
```

---

## M6 — Delete (isolated commit) + log + finish

```
Work on step M6 of the SDD migration (docs/plans/sdd-migration-plan.md §4 M6, Appendix D). Only proceed if M5's gates were ALL green. This deletes docs/plans/ and docs/prompts/ — including this migration's own plan and prompts (intended).

Tasks:
- `git rm -r docs/plans docs/prompts`  (use git rm, NOT shell rm -rf).
- Commit (its OWN commit, separate from M3/M4): `docs: remove migrated plans/ and prompts/ trees` with the trailer.
- Append to docs/progress-log.md under a `## Documentation` section (create it if absent):
    ### SDD migration: plans/ + prompts/ → docs/features/ — <today's date>
    - Output: docs/features/*/{spec.md,tasks.md}, docs/architecture-map.md, docs/roadmap.md
    - Summary: Converted all plans/prompts to SDD feature specs (slugs unchanged); repointed every
      reference (incl. 12 .ts comments, command files, cross-plan links); removed docs/plans + docs/prompts.
- Commit the log entry: `docs: log SDD migration completion` with the trailer.
- Do NOT push. Do NOT merge to main. Leave chore/sdd-migration for review.

Exit criteria: docs/plans/ and docs/prompts/ are gone; the ## Documentation entry is committed; branch chore/sdd-migration holds 4 commits (M3, M4, M6-delete, M6-log) and is ready for review. Report all four commit hashes and confirm nothing was pushed.
```
