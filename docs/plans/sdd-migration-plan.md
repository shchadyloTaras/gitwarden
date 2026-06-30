# GitWarden — SDD Documentation Migration Plan

> Migrate the project's documentation from the custom `docs/plans/` + `docs/prompts/` layout to the **SDD `docs/features/<slug>/` structure** (`spec.md` + `tasks.md` per feature, plus a repo-level `docs/architecture-map.md` and `docs/roadmap.md`), then **remove the old folders** — safely, on a branch, behind verification gates, with the destructive delete isolated in its own revertable commit.
>
> **Scope honesty:** this is a one-off **chore/infra track**, not a product feature. It converts each plan into an SDD `spec.md` (the WHAT+WHY) and routes each plan's + prompt's HOW into a `tasks.md`. It deliberately **stops there** — it does not run the full SDD pipeline (`design`/`sad.md`, `api`, `plan-tests`). Those can be run later, per slug, if a fully pipelined feature folder is wanted.

## 0. How to Read This Plan

A standalone **migration track**, not a product track. It uses a **local step counter `M0…M6`** (like the Agentic DX track's `DX-N`), **not** the global phase counter — so it never pollutes the product Phase Checklist. Same plan conventions as the rest of the repo: each step has a **Goal**, **Tasks**, and an explicit **Exit criteria** gate.

**Driving these steps:** copy-paste the matching `M-N` prompt from `docs/prompts/sdd-migration-prompts.md`. **`/new-phase` does not work here** — this track is intentionally absent from the `new-phase.md` / `log-phase.md` phase→plan tables (see §0.1), so drive it from the prompts file directly.

**Self-consuming scaffolding (read this twice):** this plan and its prompts file **live inside `docs/plans/` and `docs/prompts/`** — the very folders step **M6** deletes. That is intentional: when the migration completes, its own scaffolding is consumed along with the rest. Therefore:

- Do **not** create a `docs/features/sdd-migration/` spec — this is a chore, not a feature.
- Do **not** register `M0…M6` in the `docs/progress-log.md` Phase Checklist (the link would dangle the moment M6 runs). The migration is recorded **only** as a `## Documentation` entry in `docs/progress-log.md`, written in M6 per the AGENTS.md "SDD documentation track" rule.
- The migration plan/prompts files reference `docs/plans/`/`docs/prompts/` heavily, but those references sit **inside the doomed dirs**, so the M5 gates exclude them by glob and M6 deletes them — no dangling references result.

### 0.1 Why this track is NOT wired into the phase tables

The product convention lists every plan+prompts pair in `AGENTS.md` "Reference docs", the `new-phase.md` phase→plan table, the `log-phase.md` phase→track table, and the progress-log checklist. This migration track is **deliberately excluded** from all of them — exactly as `header-guard-badge` (a non-phased fix) is excluded — because it owns no global phases and self-deletes on completion. Wiring it in would only create references that M6 immediately invalidates. Its sole footprint is this plan, its prompts, and the M6 `## Documentation` log entry.

### 0.2 Verifiability principle (mirrors the rest of the repo)

The destructive step (M6) runs **only** after the M5 gates pass: an all-file-types residual scan, forward-link integrity, and a per-spec structural floor. Nothing is deleted while its replacement is uncommitted (M3 commits the new artifacts first). The delete is `git rm` in an isolated commit, so the whole migration is recoverable via git at every step.

---

## 1. Why this migration (and why it must be gated)

The repo's `docs/plans/` + `docs/prompts/` layout predates SDD. SDD's `docs/features/<slug>/` structure is the project's chosen documentation backbone going forward (the `sdd:*` skills read and write it). Converting brings the docs onto one structure and lets the `sdd:*` pipeline operate on every feature.

But this is a **destructive change on an actively-developed repo with deep dependencies**, surfaced by a prior recon pass:

- **12 references live in TypeScript source comments**, not Markdown (Appendix A) — a naïve `*.md`-only grep is blind to them.
- **Cross-plan narrative links** between plan bodies, and **three operational command files** (`new-phase.md`, `log-phase.md`, `run-track.md`) encode plan/prompt paths and slug→path conventions.
- **A second prose copy** of three prompt paths sits in `AGENTS.md` outside the Reference-docs block.
- **Renaming slugs** (the first instinct) multiplies breakage for zero benefit (Appendix B).

So the migration is **staged, gated, branch-isolated, and per-step committed** — never a one-shot `rm -rf`.

---

## 2. What changes (the slug map — keep every slug)

The **only** path transformation is `docs/plans/<slug>-plan.md` → `docs/features/<slug>/spec.md`. **No slug is renamed** (Appendix B). Each feature folder also gets a `tasks.md` holding the HOW (Appendix C).

| Plan file (`docs/plans/`)      | Slug (unchanged)       | Prompts file (`docs/prompts/`)    | Phase range | Notes                                  |
| ------------------------------ | ---------------------- | --------------------------------- | ----------- | -------------------------------------- |
| `gitwarden-plan.md`            | `gitwarden`            | `phase-prompts.md` ⚠️             | 0–20        | MVP Core                               |
| `github-oauth-plan.md`         | `github-oauth`         | `github-oauth-prompts.md`         | 21–27       | —                                      |
| `ai-integration-plan.md`       | `ai-integration`       | `ai-integration-prompts.md`       | 28–39       | human name "AI Connections"            |
| `ai-chat-redesign-plan.md`     | `ai-chat-redesign`     | **NONE (inline)** ⚠️              | 52–55a      | no prompts file — never invent one     |
| `distribution-release-plan.md` | `distribution-release` | `distribution-release-prompts.md` | 40–45       | 🟡 partial (40–42,45 done; 43–44 open) |
| `landing-page-plan.md`         | `landing-page`         | `landing-page-prompts.md`         | 46–51       | —                                      |
| `client-branch-access-plan.md` | `client-branch-access` | `client-branch-access-prompts.md` | 56–59       | —                                      |
| `genui-blocks-plan.md`         | `genui-blocks`         | `genui-blocks-prompts.md`         | 60–62       | —                                      |
| `agentic-dx-plan.md`           | `agentic-dx`           | `dx-execution-prompts.md` ⚠️      | DX-0–DX-6   | DX track                               |
| `header-guard-badge-plan.md`   | `header-guard-badge`   | `header-guard-badge-prompts.md`   | **none**    | **special case — not a phased track**  |

⚠️ **Prompts-convention exceptions** (these break `run-track.md`'s `docs/prompts/<slug>-prompts.md` formula): `gitwarden`→`phase-prompts.md`, `agentic-dx`→`dx-execution-prompts.md`, `ai-chat-redesign`→inline (no file). M4 must handle these explicitly, never synthesize a path.

**`header-guard-badge` special case:** it owns no phase range, has no Phase Checklist entry, and is absent from every phase table. Convert its plan+prompts to a `spec.md`/`tasks.md` the same way, but do **not** add it to any phase→plan/range table. Preserve its self-asserted `Status: ✅ implemented (commit f37c7ee)` in the spec frontmatter (it is not re-derivable from a checklist).

---

## 3. The safety model (the gates that protect M6)

| Gate (runs in M5)          | Command / check                                                                                                                                                                 | Pass condition                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **A — md completeness**    | `rg -n 'docs/plans\|docs/prompts' -g '*.md' -g '!docs/plans/**' -g '!docs/prompts/**'`                                                                                          | **zero lines**                                 |
| **B — all-types residual** | `rg -n 'docs/plans\|docs/prompts' -g '!node_modules/**' -g '!dist/**' -g '!docs/plans/**' -g '!docs/prompts/**'`                                                                | **zero lines** (catches the 12 `.ts` comments) |
| **C — forward links**      | every `docs/features/<slug>/spec.md` referenced from an updated file exists on disk **and** any cited section/appendix anchor resolves (no stale `§7.x`/`Phase N`/`Appendix X`) | all resolve                                    |
| **D — spec floor**         | each `spec.md` has §1–§8 present, frontmatter `feature_size` matches `.size`, `sdd:critic` passed                                                                               | all true                                       |

**HARD HALT:** if any gate fails, do **not** proceed to M6. Fix and re-run M5.

The doomed dirs are excluded by glob in Gates A/B precisely because this plan + prompts (and the plan↔plan cross-links) legitimately contain those strings and are deleted in M6 anyway.

---

## 4. Migration Steps

### M0 — Safety preconditions

**Goal:** never run destructively on `main` or a dirty tree.
**Tasks:**

- Assert `git status --porcelain` is empty (clean tree). If not, STOP.
- Assert the current branch is **not** `main`. If it is, `git switch -c chore/sdd-migration`.

**Exit:** on a dedicated migration branch, clean working tree, ready to work.

### M1 — Convert each feature to `spec.md` + `tasks.md`

**Goal:** a valid SDD `spec.md` (WHAT+WHY) and a `tasks.md` (HOW) per slug — keeping slugs, validated by the real SDD checks. **No deletion yet.**
**Tasks (per slug; `header-guard-badge` per the §2 special case):**

- Create `docs/features/<slug>/`. Bootstrap `CONTEXT.md` and reconcile every domain role/term the plan uses (Personal/Work/Client profile, repo, push policy, SSH key, …) into its `## Glossary` via the glossary skill **before** writing §4 — so §4 roles are canonical (no invented `user`/`admin`).
- Classify size against the 4-signal matrix and write `docs/features/<slug>/.size` (these multi-file plans are almost all M+). Size is the feature's **inherent scope**, independent of phase/completion status — a shipped or non-phased feature (e.g. `header-guard-badge`) still has a real size; don't conflate "done"/"unphased" with a size value. Mirror it in spec frontmatter `feature_size`.
- Write `spec.md` by **mapping plan intent** into §1–§8 (Context, Goals, Non-goals, User stories ≥5, Acceptance criteria, NFRs numeric + §6.1 Security/privacy, KPIs ≥3, Open questions with owner+due). **Transform, don't transcribe:** lift behavior rules to business-observable Given/When/Then; **strip every** HTTP verb / URL path / status-code numeric / `module.error_name` / JSON fragment / SQL construct from §5 (those map to `api`/`data-model` later). Fill every section or write an explicit `<!-- N/A: reason -->`.
- Write `docs/features/<slug>/tasks.md` holding the plan's HOW + the matching prompts file's per-phase steps/file-lists (mapping in §2; `ai-chat-redesign` has no prompts file — use the plan's inline phases). **Do not** copy the commit/push/progress-log ritual — that is process and stays in `AGENTS.md`.
- Self-run the forbidden-token regex over §5 and verify **both** coverage floors (≥1 AC of each of the 5 types: happy/error/authorization/domain-invariant/cross-context, **and** ≥1 AC per retained §4 user story).
- Dispatch the `sdd:critic` subagent on the assembled `spec.md` (clean context) and resolve every finding. **Do not skip the critic** — it is the one gate that catches what a hand author rationalizes past.

**Exit:** all 10 `docs/features/<slug>/{spec.md,tasks.md,.size,CONTEXT.md}` exist; every `spec.md` has §1–§8, zero forbidden tokens in §5, both coverage floors met, `feature_size` matches `.size`, and `sdd:critic` passed. Nothing deleted; nothing in `docs/plans/`/`docs/prompts/` touched yet.

### M2 — Architecture map + roadmap

**Goal:** the repo-level SDD artifacts, handling interactivity.
**Tasks:**

- `docs/architecture-map.md`: if it already exists, **reuse** it (do not re-run `survey` interactively). Otherwise run `sdd:survey gitwarden` and accept its scan.
- Run `sdd:roadmap gitwarden` → `docs/roadmap.md`. Place each feature in Now/Next/Later per its completion status in `docs/progress-log.md`. **Distribution & Release stays 🟡 partial** (40–42,45 done; 43–44 open) — preserve that.

**Exit:** `docs/architecture-map.md` and `docs/roadmap.md` exist and are non-trivial; roadmap reflects the real per-track status incl. the Distribution partial.

### M3 — Commit migrated artifacts (while old folders still exist)

**Goal:** never delete source-of-truth in favor of uncommitted replacements.
**Tasks:**

- `git add docs/features docs/architecture-map.md docs/roadmap.md`
- Commit: `docs: add SDD feature specs (migrated from plans/prompts)` with the agent `Co-Authored-By` trailer.

**Exit:** the new `docs/features/` tree + map + roadmap are committed on the branch; `docs/plans/`/`docs/prompts/` still present.

### M4 — Repoint every reference (then commit)

**Goal:** zero references will dangle after M6. Keep slugs; replace each `docs/plans/<slug>-plan.md` (and matching prompts path) with `docs/features/<slug>/spec.md`.

**Discover first (do not trust a hand list):** run the Gate-B grep (`rg -n 'docs/plans|docs/prompts' -g '!node_modules/**' -g '!dist/**' -g '!docs/plans/**' -g '!docs/prompts/**'`) and repoint **every** hit it returns. Appendix A is the verified known set — a checklist over the grep, not a replacement for it.

**Tasks — update each site (full inventory + handling in Appendix A):**

- `AGENTS.md` — "Reference docs" block (all 10 bullets incl. `header-guard-badge`), operating-workflow step 1 (the **second**, prose copy — rewrite the whole sentence), the "Before working" line, and the SoT-rule line naming `docs/plans/`.
- `WORKFLOW.md` — **resolver rewrite:** collapse its separate "read the plan" + "read the prompt" steps into one `docs/features/<slug>/spec.md` read; repoint the `dx-execution-prompts.md` reference. Not a token swap.
- `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `DECISIONS.md`.
- `docs/progress-log.md` — **grep the whole file:** per-track sub-headings **and** inline body-prose refs (superseded-by notes, past file-list lines).
- `docs/code-graph-mcp.md`; `landing/README.md` (relative `../docs/plans/…` form); **all 8 `docs/adr/*` `source:` frontmatter lines** (mapping in Appendix A).
- `.claude/commands/new-phase.md` — rewrite the table to a single `docs/features/<slug>/spec.md` column (**derive `<slug>` from the existing plan basename** — the table has no slug column); **preserve the `52–55a` and `DX-0–DX-6` literal ranges**.
- `.claude/commands/log-phase.md` — reconcile its phase→track NAME table (names, not paths; won't surface in a path grep).
- `.claude/commands/run-track.md` — rewrite the RESOLVE convention to `docs/features/<slug>/spec.md` (drop the prompts-path concept); preserve the three §2 exceptions. **`sdd-migration` is never a run-track target** — do not add it to the resolver; it is driven only from its prompts file.
- **Cross-plan narrative links** carried into the new `spec.md`/`tasks.md` bodies → `docs/features/<other>/spec.md`.
- **The 12 `.ts` source comments** (Appendix A) — 11 → `docs/features/github-oauth/spec.md`, 1 → `docs/features/ai-integration/spec.md`.
- **Anchors:** when a repointed ref cites a plan `§7.x` / `Phase N` / `Appendix X`, **drop or remap** it to the SDD section (or `tasks.md`) — plan numbering does not survive the transform (Appendix A).
- **Self-references (REMOVE, do not repoint):** a few surviving docs reference the migration's **own** files. These have no `features/` target and self-delete, so **delete the reference** rather than repointing it: the `AGENTS.md` "SDD migration (transient chore)" Reference-docs line, and the historical `docs/progress-log.md` parenthetical (≈ line 848) that names `docs/plans/sdd-migration-plan.md`. Removing them in M4 is what keeps Gate B green at M5 (those references sit in surviving docs, not the doomed dirs).
- **Re-derive** affected views per the AGENTS.md single-source-of-truth rule (Build order, Feature Track Status) — but **do not change any Phase Checklist box state**.

Make edits **idempotent** (re-running finds nothing to change rather than double-editing).

- Commit: `docs: repoint all references to SDD feature specs`.

**Exit:** all reference sites updated; the migration's own plan/prompts (inside the doomed dirs) intentionally left as-is; ready for the gates.

### M5 — Verification gates (HARD HALT on any failure)

**Goal:** prove deletion is safe before doing it.
**Tasks:** run Gates A, B, C, D from §3.

**Exit:** all four gates green. On any failure, fix and re-run — **do not** proceed to M6.

### M6 — Delete (isolated commit) + log + finish

**Goal:** remove the old trees revertably and record the migration.
**Tasks:**

- `git rm -r docs/plans docs/prompts` (**not** shell `rm -rf`). This deletes this plan and its prompts too — intended (§0).
- Commit: `docs: remove migrated plans/ and prompts/ trees` (**its own** commit, separate from M3/M4).
- Append to `docs/progress-log.md` under `## Documentation` (create the section if absent):
  ```
  ### SDD migration: plans/ + prompts/ → docs/features/ — <date>
  - Output: docs/features/*/{spec.md,tasks.md}, docs/architecture-map.md, docs/roadmap.md
  - Summary: Converted all plans/prompts to SDD feature specs (slugs unchanged); repointed every
    reference (incl. 12 .ts comments, command files, cross-plan links); removed docs/plans + docs/prompts.
  ```
- Commit that log entry: `docs: log SDD migration completion`.
- **Do NOT push. Do NOT merge to `main`.** Leave the branch for review.

**Exit:** `docs/plans/` and `docs/prompts/` gone; `## Documentation` entry committed; branch `chore/sdd-migration` ready for review; gates were green before deletion.

---

## 5. Acceptance Criteria (migration-level)

After M6, on the `chore/sdd-migration` branch: every former plan exists as `docs/features/<slug>/spec.md` (slug unchanged) with §1–§8, zero forbidden tokens in §5, both AC coverage floors met, `feature_size` matching `.size`, and a passed `sdd:critic`; each feature has a `tasks.md` carrying the plan + prompt HOW; `docs/architecture-map.md` and `docs/roadmap.md` exist with the Distribution partial preserved; **Gate B (all file types) returns zero residual references** — including the 12 `.ts` comments, the 8 `docs/adr/*` `source:` lines, `docs/code-graph-mcp.md`, `landing/README.md`, `log-phase.md`, the AGENTS.md second prose copy, progress-log body prose, and all cross-plan links; every repointed link resolves on disk with no stale section anchor; `docs/plans/` and `docs/prompts/` are removed via `git rm` in an isolated, revertable commit; the migration is recorded as a `## Documentation` entry; nothing was pushed or merged. **Recovery:** any step is revertable via git because the new artifacts were committed (M3) before the source was removed (M6).

---

## Appendix A — Reference inventory (what M4 must touch)

> **The live Gate-B grep is authoritative, not this list.** M4 **must run** `rg -n 'docs/plans|docs/prompts' -g '!node_modules/**' -g '!dist/**' -g '!docs/plans/**' -g '!docs/prompts/**'` **first** to enumerate every site, then repoint each. The inventory below is the **known set verified during authoring** — a checklist, not a substitute for the scan. (A prior hand-enumerated list missed the ADRs, `code-graph-mcp.md`, and `landing/README.md` — hence the grep-first rule.)

**Markdown / docs (caught by an `*.md` grep):**

- `AGENTS.md` — Reference-docs block, operating-workflow step 1 prose (the second copy), the "Before working" line, and the SoT-rule line that names `docs/plans/`.
- `WORKFLOW.md` — **resolver rewrite**, not a token swap: collapse its separate "read the plan in `docs/plans/`" + "read the prompt in `docs/prompts/`" steps into one `docs/features/<slug>/spec.md` read, and repoint the `dx-execution-prompts.md` reference (≈ line 85).
- `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `DECISIONS.md`.
- `docs/progress-log.md` — **the whole file**, not just the per-track sub-headings: also the inline body-prose refs (e.g. "Superseded by the GitHub OAuth plan — …", and the file-list lines in past entries). Grep the full file.
- `docs/code-graph-mcp.md` (≈ line 10) → `docs/features/agentic-dx/spec.md`.
- `landing/README.md` (≈ lines 12–13, relative `../docs/plans/…` form) → both links to `docs/features/landing-page/spec.md`.
- **All 8 ADRs** under `docs/adr/` carry a `source:` frontmatter line → repoint each: `0001`,`0002`,`0003`,`0005`,`0006` → `docs/features/gitwarden/spec.md`; `0004` → `github-oauth`; `0007` → `ai-integration`; `0008` → `ai-chat-redesign`.
- `.claude/commands/new-phase.md` (table), `.claude/commands/log-phase.md` (phase→track NAME table), `.claude/commands/run-track.md` (RESOLVE convention rewrite).
- Cross-plan links inside plan bodies (now carried into `spec.md`/`tasks.md`).

**Stale anchors (a transform hazard, handle in M4):** many of these refs cite a plan **section/appendix/phase anchor** — ADR `source:` lines (`§7.1`, `§7.3`, `§1.1`, `Appendix B–D`), the 12 `.ts` comments (`§6 Phase 23/24/25/27`, `Appendix A–D`), `code-graph-mcp.md` (`§Step DX-6`). Plan numbering does **not** survive the transform to SDD §1–§8. When repointing, **drop or remap the anchor** to the corresponding SDD section (or to `tasks.md` for HOW/phase anchors) — never leave a pointer claiming a `§7.x`/`Phase N`/`Appendix X` that no longer exists. Gate C checks anchors, not just file existence (§3).

**TypeScript source comments (NOT caught by an `*.md` grep — the original blind spot):**

| File:line                                  | Cites                    | Repoint to                             |
| ------------------------------------------ | ------------------------ | -------------------------------------- |
| `src/main/git/askpass.ts:7`                | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `electron/index.ts:91`                     | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/main/ipc/GitHubAuthCoordinator.ts:7`  | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/core/schemas.ts:4`                    | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/core/types.ts:19`                     | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/core/config/github.ts:5`              | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/core/config/github.ts:10`             | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/main/services/HttpClient.ts:6`        | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/main/services/GitHubApiService.ts:3`  | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/main/services/FetchHttpClient.ts:6`   | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/main/services/GitHubAuthService.ts:3` | `github-oauth-plan.md`   | `docs/features/github-oauth/spec.md`   |
| `src/core/ai/types.ts:7`                   | `ai-integration-plan.md` | `docs/features/ai-integration/spec.md` |

These 12 are inert comments — deleting the folders does **not** break the build, but they become stale pointers. M4 repoints them; Gate B is what proves none remain.

---

## Appendix B — Why slugs are NOT renamed

The first-instinct rename (`ai-integration`→`ai-connections`, `distribution-release`→`distribution`, `ai-chat-redesign`→`ai-chat`) buys nothing and multiplies breakage:

- `run-track.md` resolves paths **from the slug** — a rename changes the lookup key and 404s `/run-track`.
- Dense cross-plan links (`"the AI plan (docs/plans/ai-integration-plan.md)"`) appear in several plan bodies; a rename must rewrite every one atomically.
- `AGENTS.md` Reference-docs + operating-workflow line, `progress-log.md` headings, the `new-phase.md` table — all key on the slug/basename.

A faithful migration changes the **path** (`plans/<slug>-plan.md` → `features/<slug>/spec.md`) and, if desired, the human **display name** in prose/tables — but **never the slug/basename**.

---

## Appendix C — Where each kind of content goes

`spec.md` is strictly WHAT+WHY (§1–§8); the SDD validator forbids HOW/implementation detail and forbidden tokens. So plan/prompt content decomposes:

| Content                                          | Home                                                            |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Problem / goals / non-goals / behavior rules     | `spec.md` §1–§8 (transformed to business-observable AC)         |
| Per-phase build steps, file lists, exit criteria | `docs/features/<slug>/tasks.md`                                 |
| Architecture / tech choices (future)             | `sad.md` via `sdd:design` + ADRs via `sdd:decide-adr`           |
| Verification / tests (future)                    | `test-plan.md` via `sdd:plan-tests`                             |
| Commit/push/progress-log **ritual**              | **stays in `AGENTS.md`** — never copied into a feature artifact |

This migration produces `spec.md` + `tasks.md` only. Running `sdd:design`/`sdd:api`/`sdd:plan-tests` per slug later upgrades a folder to the full pipeline.

---

## Appendix D — Commit sequence (revertability)

Four commits on `chore/sdd-migration`, in order:

1. `docs: add SDD feature specs (migrated from plans/prompts)` — M3 (new artifacts, old folders intact).
2. `docs: repoint all references to SDD feature specs` — M4.
3. `docs: remove migrated plans/ and prompts/ trees` — M6 (`git rm`, isolated).
4. `docs: log SDD migration completion` — M6 (`## Documentation` entry).

Because (1) lands before (3), the originals are never lost to an uncommitted replacement, and the destructive commit (3) is reviewable and revertable on its own. No push, no merge — review on the branch.
