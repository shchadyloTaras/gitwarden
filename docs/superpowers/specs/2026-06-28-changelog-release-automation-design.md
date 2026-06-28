# CHANGELOG Release Automation — Design Spec

- **Status:** Approved (design) — ready for an implementation plan
- **Date:** 2026-06-28
- **Track:** Agentic DX / tooling (not a numbered product phase)
- **Scope:** Slice 1 only (see §5). Landing sync and CI release notes are explicitly deferred.

---

## 1. Problem & goal

Today `CHANGELOG.md` is written by whichever coding agent happens to remember, inline with a
fix commit, guided only by convention (`docs/release-checklist.md` + the _Keep a Changelog_
format already in the file). Evidence: `0.1.1` was added inside the unrelated commit
`60ae68b "fix: handle branch worktree conflicts"`, co-authored by an agent. This works but is
**unenforced and inconsistent** — nothing collects the changes, nothing checks the entry exists.

**Goal:** one repeatable command, run at release time, that:

1. deterministically gathers the **app's** commits since the last tag (excluding landing),
2. has the agent **summarize them into user-facing CHANGELOG entries**,
3. bumps the version and performs the structural CHANGELOG surgery deterministically,
4. creates the release commit + tag **locally**, and **stops** — the final `git push` is the
   human's (this is what triggers the existing CI release build).

## 2. Locked decisions

| Decision           | Choice                                                                         | Why                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger**        | Release time (tag), not per-commit / per-push                                  | Changelog is release-organized; avoids the commit/push loop, token cost, and noise of per-push.                                 |
| **Location**       | Local (Claude Code), not CI                                                    | No API key in CI; human keeps the last look; fits `docs/release-checklist.md`.                                                  |
| **Engine**         | Pure-AI agent for the prose, on a deterministic skeleton (chosen "Approach 1") | Matches the described flow; no new dependency (no git-cliff); the agent never loses a commit because the list is deterministic. |
| **Who pushes**     | The human. The agent never pushes.                                             | Preserves the AGENTS.md hard rule "Never push unless explicitly asked."                                                         |
| **Output surface** | Root `CHANGELOG.md` only                                                       | "For gitwarden, not landing." Landing changelog and GitHub Release notes are deferred (§5).                                     |

## 3. Architecture & components

Three parts with a strict "deterministic vs AI" split.

### ① Pure logic — `src/core/changelog/`

A new sibling to the existing `src/core/updates/`. Pure functions: no `fs`, no
`child_process`, no Electron/DOM. Covered by Vitest and guarded by the `core-purity-reviewer`
subagent.

```ts
type Commit = { hash: string; subject: string; body: string; files: string[] }

// Drop commits that are landing-only. A commit is "landing-only" iff it changed ≥1 file and
// EVERY changed path starts with "landing/". Everything else is kept (it touches the app).
filterAppCommits(commits: Commit[]): Commit[]

// Advisory semver hint from conventional-commit subjects/bodies of the APP commits:
//   'major' if any subject has "!:" or any body has "BREAKING CHANGE"
//   else 'minor' if any "feat"/"feat(scope)"
//   else 'patch'; 'none' if there are no app commits.
// Pre-1.0 note: the caller may downgrade major→minor (release-checklist policy). Advisory only.
suggestBump(commits: Commit[]): 'major' | 'minor' | 'patch' | 'none'

// Structural surgery on the changelog text. Renames the (already-filled) "## [Unreleased]"
// section to "## [<version>] — <date>", inserts a fresh empty "## [Unreleased]" above it, and
// appends the compare link "[<version>]: <repoUrl>/compare/<prevTag>...v<version>" in the
// link-reference block, ordered above the previous version's link (matching existing style).
// Idempotent: if "## [<version>]" already exists, returns the text unchanged + an `alreadyRolled`
// signal. Throws if no "## [Unreleased]" heading is present.
rollUnreleased(changelogText, version, date, repoUrl, prevTag): { text: string; alreadyRolled: boolean }
```

> Note: `extractSection` (changelog → GitHub Release notes) is **not** built in this slice — it
> is only needed for the deferred CI release-notes work (§5). YAGNI.

### ② Thin I/O shell — `scripts/release-changelog.cjs`

Style of the existing `scripts/after-pack.cjs`. The **only** place that touches git and files:

- `git describe --tags --abbrev=0` → last tag (e.g. `v0.1.1`); `git log <tag>..HEAD` with files.
- Calls `filterAppCommits` + `suggestBump` from ①; prints the **deterministic app-commit list**
  (JSON) for the agent to read.
- After the agent has filled `## [Unreleased]`, applies `rollUnreleased` to `CHANGELOG.md` and
  bumps `package.json` `version`.
- Date is `new Date().toISOString().slice(0, 10)` (plain Node — `Date` is available here).
- `repoUrl` = `https://github.com/shchadyloTaras/gitwarden` (read from `package.json`).

### ③ Orchestrator — slash command `.claude/commands/release.md`

Modeled on `.claude/commands/commit-phase.md`: frontmatter + `allowed-tools` + explicit
`REFUSED` gates. `allowed-tools` **excludes `git push`** (and `commit-phase.md` already
establishes the "Never pushes" precedent). It drives the flow in §4.

### Responsibility split

| Part                                                                  | Owner             | Deterministic?              |
| --------------------------------------------------------------------- | ----------------- | --------------------------- |
| last tag, commit list, landing filter, structural edits, version bump | script ② + core ① | ✅                          |
| **summarizing commits → user-facing bullets**                         | **agent**         | ❌ (hence the human review) |
| commit + tag                                                          | agent             | ✅                          |
| `git push`                                                            | **human**         | —                           |

## 4. Release flow

Two human checkpoints (✋); the final push is the human's.

1. **Human:** runs `/release` in Claude Code.
2. **Gates** (else `REFUSED`, see §6): clean tree · commits exist since last tag · `npm test` green.
3. **Collect** (script ②): last tag → `git log` → `filterAppCommits` → `suggestBump`.
4. ✋ **Checkpoint 1:** agent shows the suggested version + the app-commit list; the human
   confirms the version (or overrides).
5. **Agent writes** (the only creative step): reads the commit list, summarizes into bullets
   grouped `Added / Fixed / Changed`, in the established tone of the existing `CHANGELOG.md`
   (concise, user-facing). The agent applies **editorial** judgment — pure chore/docs/ci commits
   may be omitted from user-facing bullets even though the deterministic filter kept them. The
   agent writes these bullets **under `## [Unreleased]`**.
6. **Apply** (script ②): `rollUnreleased` renames `[Unreleased]` → `[<version>] — <date>`,
   inserts a fresh empty `[Unreleased]`, adds the compare link; bumps `package.json`.
7. ✋ **Checkpoint 2:** agent shows the final diff (`CHANGELOG.md` + `package.json`); the human
   reviews / tweaks wording.
8. **Commit + tag** (agent, local): `git commit -m "chore: release v<version>"` (with the
   Claude co-author trailer) and `git tag v<version>`. Then **STOP** and print:
   `Ready. Review, then: git push origin main && git push origin v<version>`.
9. **Human:** pushes → `release.yml` fires on the tag: existing guard (`tag == package.json
version`) passes because both were bumped together; the 3-OS matrix builds and a draft
   GitHub Release is published.

## 5. Scope

**Slice 1 (this design — what we build now):** the `/release` command, the `src/core/changelog/`
pure functions, the `scripts/release-changelog.cjs` shell, unit + tooling tests, and the
release-checklist update. Output is the root `CHANGELOG.md` only.

**Deferred (future slices, not built now):**

- **2a — Landing sync.** Make `landing/src/content/docs/changelog.md` an auto-derived mirror of
  the root changelog (frontmatter + root body) so it never drifts. Currently kept manually.
- **2b — CI release notes.** Add `extractSection` (pure) + a deterministic `release.yml` step
  that fills the GitHub Release body via `gh release edit` — removes the manual copy-paste in
  release-checklist step 6.
- **3 — In-app "What's new."** `UpdateService` currently uses only `html_url`; once the release
  body is populated (2b), surface it on update. Out of scope here.

## 6. Gates & error handling

| Condition                                             | Action                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Working tree dirty                                    | `REFUSED` — don't fold unrelated changes into the release commit   |
| No commits since last tag                             | `REFUSED` — nothing to release                                     |
| All commits are landing-only                          | `REFUSED` — no app changes ("not landing")                         |
| `npm test` red                                        | `REFUSED` — release-checklist step 1 is a hard gate                |
| Target version already tagged                         | `REFUSED` — version conflict                                       |
| `## [<version>]` already present (re-run before push) | Detected via `alreadyRolled`; do not double-apply (idempotent)     |
| Any push                                              | Command **STOPS** after the tag; `allowed-tools` has no `git push` |

Backstop: the existing `release.yml` guard (`tag == package.json version`) catches any
desync between the bumped version and the tag.

## 7. Testing strategy

- **`src/core/changelog/` — Vitest unit tests** (the project's logic-first backbone):
  - `filterAppCommits`: landing-only dropped; mixed (src + landing) kept; pure-src kept.
  - `suggestBump`: `feat → minor`; only-`fix → patch`; `feat!`/`BREAKING CHANGE → major`;
    empty → `none`.
  - `rollUnreleased`: `[Unreleased]` renamed with date; fresh empty `[Unreleased]` inserted;
    compare link correct (`<prevTag>...v<version>`); idempotent on re-run; throws with no
    `[Unreleased]`.
- **`scripts/release-changelog.cjs` — tooling smoke** against a **temporary git repo** fixture
  (offline, mirroring the project's other e2e; `tests/fixtures/` already exists).
- **Agent prose** — not unit-tested (non-deterministic); covered by ✋ Checkpoint 2 (human
  review). An optional Vitest eval under `tests/evals/` for summary quality is possible but is
  gold-plating and out of scope.

## 8. File inventory (Slice 1)

- `src/core/changelog/` — pure functions + types (`filterAppCommits`, `suggestBump`, `rollUnreleased`)
- `tests/unit/changelog.test.ts` — unit tests
- `scripts/release-changelog.cjs` — I/O shell
- `.claude/commands/release.md` — the `/release` slash command
- `docs/release-checklist.md` — step 2 → "run `/release`" (step 6 stays manual until slice 2b)
- `docs/progress-log.md` — a DX-track progress entry, written before the implementation commit
  (AGENTS.md rule)

## 9. Non-goals

- No per-commit or per-push automation (rejected in §2).
- No automatic `git push` / no LLM running in CI.
- No change to global git config; no new runtime dependency for the app.
- No landing-changelog or GitHub-Release-notes changes in this slice (deferred, §5).
