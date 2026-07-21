# GitWarden — History Commit Details Phase Prompts

Copy-paste prompts to drive the **History Commit Details** feature one phase at a time. Each prompt
is self-contained, points at the plan in `docs/plans/history-commit-details-plan.md`, and **ends with
the standard progress footer** that records progress in `docs/progress-log.md`. Rules live in
`CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (110 → 113). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Phase 110 is the pure-core checkpoint;
Phase 111 completes GitService/IPC; Phase 112 fixes History scrolling and pagination; Phase 113 is
the renderer/e2e feature-complete stop point. One commit per phase; the progress-log entry written
**before** the commit.

**Prerequisites / offline note:** no network or GitHub account is required. Unit and integration
tests use captured NUL-delimited fixtures and real repositories in temporary directories. Electron
Playwright fixtures create local commits, including root, rename, binary, and merge cases.

**Product boundary (do not cross):** commit inspection is read-only. Do not add checkout, revert,
reset, uncommit, cherry-pick, amend, rebase, patch editing, remote fetching, or any other write
action to the detail pane. Do not add a commit graph, search, blame, side-by-side diff, or AI panel
integration. Merge details use first-parent semantics.

Background facts (already verified against the tree — don't re-litigate):

- `HistoryScreen` currently nests an inner `overflowY: auto` body inside the already-scrollable app
  `<main>` without the complete `min-height: 0` containment chain. The commit list and `Load more`
  action are sequential children, so the growing list can put the action outside the usable pane.
- `historyStore.load()` and `loadMore()` share one request tracker. A later same-target refresh can
  invalidate a user-initiated pagination response; the existing request-guard test covers only a
  repository switch.
- Pagination currently requests exactly 50 and appends with `--skip = commits.length`. The decided
  replacement requests `visibleLimit + 1` from offset zero, atomically replaces the snapshot, and
  derives `hasMore` from the look-ahead row.
- `GitCommit` is a compact list model only. The new pure-core `GitCommitDetails` contract carries
  parent hashes, changed-file records, and an opaque unified patch without changing `GitCommit`.
- `GitService` already owns NUL-delimited history parsing and all read-only Git access. The renderer
  reaches it only through Zod-validated IPC and the typed preload bridge.
- `ResizableMainSplit` is the canonical persisted, pointer/keyboard-resizable master/detail layout.
  Status already uses it and contains the current unified-diff line styling that this track will
  extract and share.
- Existing `tests/e2e/history.spec.ts` proves one happy 50 → 55 pagination click but does not assert
  scroll ownership, refresh overlap, commit selection, changed files, or patch contents.

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

## Phase 110 — Commit-detail contracts and parsers (pure core)

```
Work on Phase 110 of GitWarden (docs/plans/history-commit-details-plan.md §"Phase 110 — Commit-detail contracts and parsers (pure core)"). Pure core only — no Git execution, IPC, preload, renderer, or shared-doc registration.

Tasks:
- Extend `src/core/types.ts` with `GitCommitFileStatus`, `GitCommitFileChange`, and `GitCommitDetails` exactly as defined in the plan. Keep the existing compact `GitCommit` list shape unchanged.
- Add `src/core/parsers/CommitDetailsParser.ts` with pure functions for one NUL-delimited commit-metadata record and one NUL-delimited `--name-status -z` stream. Assemble those parsed values with an opaque patch string into `GitCommitDetails`.
- Map `A/M/D/R/C/T/U` to the typed statuses. Preserve unknown codes with their path, retain both paths and the numeric similarity for rename/copy records, and reject structurally incomplete metadata or rename/copy records with a typed parse error.
- Preserve path text exactly, including spaces and Unicode. Retain every parent hash from metadata. Do not interpret patch lines or import renderer code.
- Add `tests/unit/commit-details-parser.test.ts` for normal/root/multiple-parent metadata; added/modified/deleted/type-changed files; rename/copy scores; spaces/Unicode; empty file output; unknown status; malformed metadata; truncated rename/copy output; and binary patch pass-through.
- Export through an existing core parser/module barrel only if consumers already use one. Keep `src/core/` free of Node, Electron, DOM, `fs`, and `child_process` imports.

Exit: `npx tsc --noEmit -p tsconfig.node.json`, `npx tsc --noEmit -p tsconfig.web.json`, the focused parser tests, full `npm test`, and `npm run lint` are green; core-purity review confirms the new parser remains framework-free.

Then run the standard progress footer.
```

---

## Phase 111 — Read-only GitService and typed IPC (main + preload)

```
Work on Phase 111 of GitWarden (docs/plans/history-commit-details-plan.md §"Phase 111 — Read-only GitService and typed IPC (main + preload)"). Main, validated IPC, preload, and integration tests only — no renderer UI or shared-doc registration. Begin only after Phase 110's progress-log gate is ✅.

Tasks:
- Add `GitService.getCommitDetails(repoPath, fullHash)` beside the existing History methods. Gather authoritative NUL-delimited metadata, root/first-parent `--name-status -z` file changes, and the no-color unified patch through the existing `readOnly()`/`GitRunner` path.
- Use GitRunner args arrays only, no shell or interpolated command string. Apply rename/copy detection consistently to the file list and patch. Root commits compare with the empty tree; merge commits retain all parent hashes but compare their details with the first parent.
- Pass the three outputs through the Phase 110 pure parser. Return changed files truthfully for normal, root, rename/copy, deletion, Unicode, binary, empty-patch, and merge cases.
- Add `GitCommitDetailsPayload` to `src/main/ipc/ipc-schemas.ts` with `repoPath` and a 40–64 character hexadecimal full hash. Reject leading dashes, revision syntax, abbreviated ids, and empty values before Git runs.
- Register `git:getCommitDetails` in `src/main/ipc/ipc-handlers.ts` through the standard `IpcResult` wrapper. Expose the typed call from `preload/index.ts` and mirror it in `src/renderer/types/window.d.ts`.
- Add real-temp-repository integration tests for normal/root/rename/deletion/Unicode/binary/merge commits. Add focused schema and command-argument assertions so the full-hash validation, first-parent behavior, read-only flag, and args arrays cannot regress.
- Do not log patch content, repository data, or secrets. Do not add any renderer call or write operation in this phase.

Exit: both TypeScript configs, focused parser/service/IPC tests, full `npm test`, and `npm run lint` are green; every new Git call is read-only, routed through GitRunner, passed as an args array, and accepts only the validated full hash.

Then run the standard progress footer.
```

---

## Phase 112 — Reliable pagination and scroll containment (renderer store + layout)

```
Work on Phase 112 of GitWarden (docs/plans/history-commit-details-plan.md §"Phase 112 — Reliable pagination and scroll containment (renderer store + layout)"). Fix History list state and layout only — no commit-detail pane yet and no shared-doc registration. Begin only after Phase 111's progress-log gate is ✅.

Tasks:
- Replace `historyStore`'s one shared tracker model with an explicit target identity (repository path + current branch), visible-limit state, and separate initial/refresh versus pagination request guards. A repository/branch change resets to 50; a same-target refresh preserves the current visible limit.
- Request `visibleLimit + 1` commits from offset zero, deduplicate by full hash, render only `visibleLimit`, and derive `hasMore` from the look-ahead item. `loadMore()` must be single-flight, raise the desired limit exactly once, and atomically replace the snapshot.
- Define failure and stale-result behavior exactly: another-target responses are dropped; a failed page keeps existing rows and `hasMore`, restores the prior visible limit, clears `loadingMore`, and allows one truthful retry; rapid clicks while loading start no duplicate read.
- Pass the current branch from `HistoryScreen` into the load target so branch switches cannot inherit rows, pagination depth, or responses from the old branch.
- Make `.gw-history-page` a bounded overflow-hidden flex column and `.gw-history-body` the only `min-height: 0` vertical scroll owner. Keep the table header sticky and place `Load more` in a sticky, opaque, bordered footer that does not cover the final row.
- Externalize the touched History loaded-count, loading, `Load more`, pagination failure, and empty-state strings in `src/renderer/strings.ts`.
- Extend unit tests for first-click success, exact-multiple look-ahead, duplicate hashes, rapid clicks, failed-click retry, same-target refresh during pagination, repository switch, and branch switch.
- Extend `tests/e2e/history.spec.ts` at a constrained app height: prove the History body has real scroll overflow, header/footer remain reachable, one click increases the rows, and no duplicate hashes appear.

Exit: both TypeScript configs, focused History-store tests, full `npm test`, and `npm run lint` are green; `npm run e2e -- tests/e2e/history.spec.ts` proves one-scroll-owner containment and first-click pagination without duplicates. No commit-detail UI exists yet.

Then run the standard progress footer.
```

---

## Phase 113 — Resizable commit-detail browser (renderer + e2e) — feature-complete stop point

```
Work on Phase 113 of GitWarden (docs/plans/history-commit-details-plan.md §"Phase 113 — Resizable commit-detail browser (renderer + e2e) — feature-complete stop point"). Renderer + e2e; read-only feature-complete stop point. Begin only after Phase 112's progress-log gate is ✅.

Tasks:
- Extend `historyStore` with selected hash, commit-detail data, loading/error state, and a dedicated detail request guard. New selection, repository change, or branch change invalidates the prior response. Same-target refresh/pagination preserves selection only while the full hash remains visible.
- Convert History commit rows into semantic buttons or equivalent keyboard-operable options with visible focus, `aria-selected`, and a selected-row style. Keep row text usable/selectable and retain all Uncommit markers and controls.
- Use `ResizableMainSplit` with its own versioned History width key: the left pane owns the existing History content and sticky pagination; the right pane starts with a select-commit empty state, then shows subject, full/short hash, author name/email, date, parent/merge context, and changed-file count.
- Render changed-file status labels and old → new rename/copy paths, then the complete unified patch. Show truthful binary-only and no-textual-patch states without hiding the changed files. Detail loading/errors stay in the right pane and never freeze or replace the commit list.
- Extract Status's current diff-line styling into `src/renderer/components/UnifiedDiff.tsx` and use it from both Status and History. Preserve theme colors, whitespace, horizontal code scrolling, and existing Status behavior/test ids.
- Add History split, selected-row, metadata, file-list, diff, compact-width, and reduced-motion styles to `dataScreens.css`. Keep the split's existing pointer and keyboard resize semantics.
- Externalize every new label, accessible name, loading/empty/error message, file-status label, and merge/root context in `STR`.
- Extend `tests/e2e/history.spec.ts` for mouse and keyboard selection, selected state, authoritative metadata, changed filenames, added/deleted diff lines, rename display, resize semantics, root/binary states, fast selection, and reset on branch/repository change. Keep Phase 79 Uncommit and Phase 112 scroll/pagination coverage green.
- Run full TypeScript, Vitest, lint, focused and full Electron Playwright, core-purity, and safety reviews. The detail pane must expose no mutating action and all Git access must remain behind the typed preload bridge.

Exit: both TypeScript configs, focused parser/service/store tests, full `npm test`, and `npm run lint` are green; focused and full `npm run e2e` prove the reported scroll/first-click fixes plus mouse/keyboard commit inspection, files, patch, resize behavior, stale-response safety, and preserved Uncommit flow; core-purity and safety reviews have no blocking findings.

Then run the standard progress footer.
```
