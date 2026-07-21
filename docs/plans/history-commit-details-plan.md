# Plan — History Commit Details: reliable browsing and inspectable commits

**Status:** ✅ complete — Phases 110–113 — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 110 → 113.
**Feature-complete stop point:** Phase 113.
**Prompts:** [`docs/prompts/history-commit-details-prompts.md`](../prompts/history-commit-details-prompts.md).

## Goal

History should behave like a dependable commit browser: its own content scrolls inside the app,
one click on `Load more` visibly loads the next page, and selecting a commit reveals the files and
exact unified diff introduced by that commit. The selected commit appears in a resizable detail
pane on the right while the commit list remains available on the left.

**Product boundary (decided — read-only commit inspection):** this feature reads local Git history
only. It does not check out, revert, reset, cherry-pick, amend, or otherwise mutate the selected
commit; it does not fetch missing history or add a visual commit graph. Merge commits use a
first-parent view so the detail pane shows one coherent patch instead of duplicating changes per
parent.

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **History currently has two competing scroll owners.** The app's `<main>` already scrolls
   ([App.tsx:710-723](../../src/renderer/App.tsx)), while `HistoryScreen` gives its inner body
   `overflowY: 'auto'` without a `minHeight: 0` flex constraint
   ([HistoryScreen.tsx:123-176](../../src/renderer/screens/HistoryScreen.tsx)). The shared
   `.gw-page` primitive also declares `min-height: 100%`
   ([theme.css:265-271](../../src/renderer/theme.css)). **Consequence:** make History a bounded,
   overflow-hidden page with one explicit `min-height: 0` scroll pane; do not rely on nested
   implicit heights.

2. **The table and pagination control already live in the same body, but the button is only at the
   physical end of the growing list.** The sticky table header, commit rows, and `Load more` button
   are rendered sequentially
   ([HistoryScreen.tsx:345-470](../../src/renderer/screens/HistoryScreen.tsx)); the screen CSS clips
   the commit-list card and merely centers the pagination wrapper
   ([dataScreens.css:356-399](../../src/renderer/screens/dataScreens.css)). **Consequence:** keep
   the header sticky and add a sticky pagination footer inside the single History scroll pane so
   the action stays reachable.

3. **Initial loading and pagination share one global request token.** Both `load()` and
   `loadMore()` call `tracker.begin()`, and pagination appends only while its token remains current
   ([historyStore.ts:55-118](../../src/renderer/store/historyStore.ts)). A later same-target refresh
   can therefore make the first pagination response disappear even though the user clicked once.
   The existing guard test proves only that a page for repository A must not append after switching
   to repository B
   ([history-store-request-guard.test.ts:56-72](../../tests/unit/history-store-request-guard.test.ts)).
   **Consequence:** model target changes separately from same-target refreshes, keep the requested
   visible depth across same-target refreshes, and make pagination single-flight and atomic.

4. **The renderer infers pagination from a page-sized array.** `PAGE_SIZE` is 50, initial load asks
   for exactly 50 commits, `hasMore` is true when exactly 50 return, and `loadMore` uses the current
   rendered length as `--skip`
   ([historyStore.ts:7-18](../../src/renderer/store/historyStore.ts),
   [historyStore.ts:73-108](../../src/renderer/store/historyStore.ts)). **Consequence:** request
   `visibleLimit + 1` from offset zero, replace the visible snapshot atomically, and derive
   `hasMore` from the look-ahead row. This removes offset drift and guarantees that one accepted
   click either increases the visible depth or truthfully reaches the end.

5. **The existing commit model contains list metadata only.** `GitCommit` has hashes, subject,
   author, email, and date, but no parent list, changed-file records, or patch
   ([types.ts:179-186](../../src/core/types.ts)). **Consequence:** add a pure commit-detail contract
   rather than overloading list rows with optional fields.

6. **GitService already has the safe read seams but no historical-diff operation.** History uses a
   read-only NUL-delimited `git log` parser
   ([GitService.ts:536-545](../../src/main/services/GitService.ts),
   [GitService.ts:574-594](../../src/main/services/GitService.ts)); the existing `getDiff()` is
   explicitly a staged/working-tree path diff
   ([GitService.ts:735-740](../../src/main/services/GitService.ts)). **Consequence:** add a separate
   `getCommitDetails()` read-only operation that gathers authoritative metadata, NUL-delimited file
   status, and the commit patch through `GitRunner` argument arrays.

7. **History already has a validated, typed IPC route that can be extended consistently.** The
   pagination payload validates repository path, positive limit, and non-negative skip
   ([ipc-schemas.ts:127-131](../../src/main/ipc/ipc-schemas.ts)); the handler delegates directly to
   `GitService`
   ([ipc-handlers.ts:487-491](../../src/main/ipc/ipc-handlers.ts)); preload exposes the typed call
   ([index.ts:224-228](../../preload/index.ts)); and the renderer declaration mirrors it
   ([window.d.ts:175-185](../../src/renderer/types/window.d.ts)). **Consequence:** add one
   hash-validated `git:getCommitDetails` channel across the same four boundaries; no renderer Node
   access and no direct Git call from React.

8. **A reusable master/detail layout already exists.** `ResizableMainSplit` owns persisted width,
   pointer and keyboard resizing, pane minimums, and overflow containment
   ([ResizableMainSplit.tsx:35-59](../../src/renderer/components/ResizableMainSplit.tsx),
   [ResizableMainSplit.tsx:198-255](../../src/renderer/components/ResizableMainSplit.tsx)). Status
   already uses it for a scrollable file list and diff pane
   ([StatusScreen.tsx:710-731](../../src/renderer/screens/StatusScreen.tsx)). **Consequence:** reuse
   this component for History instead of introducing a modal, global inspector dependency, or a
   second resize implementation.

9. **Unified-diff presentation exists but is private to Status.** `DiffLine` maps additions,
   deletions, hunk headers, and file headers to the existing theme tokens
   ([StatusScreen.tsx:321-356](../../src/renderer/screens/StatusScreen.tsx)), and the panel renders
   the diff as individually styled lines
   ([StatusScreen.tsx:470-493](../../src/renderer/screens/StatusScreen.tsx)). **Consequence:** extract
   a shared renderer-only unified-diff component and reuse it from both Status and History so the
   two views do not drift visually.

10. **The current e2e proves only the happy pagination path.** It creates 55 commits, clicks
    `Load more` once, expects 55 unique rows, and expects the button to disappear
    ([history.spec.ts:109-175](../../tests/e2e/history.spec.ts)). It does not assert a bounded scroll
    container, sticky/reachable pagination, same-repository refresh overlap, commit selection,
    changed files, or patch content. **Consequence:** keep the existing fixture pattern and add
    targeted unit/integration/e2e regressions for the reported failures and the new detail flow.

## Scope

- **In:**
  - One bounded History scroll region with a sticky column header and reachable sticky pagination
    footer.
  - Single-flight `Load more` that works on the first accepted click, preserves loaded depth across
    same-repository/same-branch refreshes, resets on repository or branch change, and never renders
    duplicate hashes.
  - A look-ahead pagination read (`visibleLimit + 1`, offset zero) so `hasMore` is truthful without
    requiring an empty extra page.
  - A pure `GitCommitDetails` model: authoritative commit metadata, parent hashes, changed files,
    rename/copy origins and similarity, and an opaque unified patch string.
  - Read-only local Git commands for normal, root, rename/copy, binary, and merge commits; merge
    details use first-parent semantics.
  - A Zod-validated full commit-hash IPC request and typed preload/renderer response.
  - A resizable History master/detail layout: commit list on the left; selected commit metadata,
    changed-file list, and unified diff on the right.
  - Explicit initial, loading, empty-patch, binary, and error states; repository/branch changes clear
    stale selection and stale detail responses.
  - Mouse and keyboard row selection, programmatic selected state, accessible resize behavior,
    and visible focus.
  - Externalized History strings plus unit, integration, Playwright, typecheck, lint, and core-
    purity coverage.
- **Out / Non-goals:**
  - Checkout, revert, reset, uncommit, cherry-pick, amend, rebase, or any new write action from the
    commit detail pane.
  - A commit graph, branch topology visualization, blame, search, filtering, or history rewriting.
  - Side-by-side diff, syntax highlighting, word-level diff, whitespace toggles, patch editing, or
    patch export.
  - Network access, fetching missing objects, GitHub commit pages, pull requests, reviews, or remote
    comments.
  - Virtualizing the list or replacing the existing 50-commit incremental browsing model.
  - Moving commit details into the global AI/context panel or changing AI History Intelligence.

## Commit-detail contract

```ts
export type GitCommitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typeChanged'
  | 'unmerged'
  | 'unknown'

export interface GitCommitFileChange {
  status: GitCommitFileStatus
  path: string
  previousPath?: string
  similarity?: number
}

export interface GitCommitDetails {
  commit: GitCommit
  parentHashes: string[]
  files: GitCommitFileChange[]
  patch: string
}
```

The renderer requests details only with a `fullHash` returned by History. IPC accepts a lowercase or
uppercase 40–64 character hexadecimal full object id and rejects option-like, abbreviated, or
otherwise malformed revisions before Git runs. The pure parser consumes NUL-delimited metadata and
`--name-status -z` output; paths remain opaque Unicode strings, rename/copy records retain both
paths, and the patch remains unparsed text for the shared unified-diff renderer.

For a merge commit, metadata retains every parent hash but changed files and patch compare the
merge result with its first parent. A root commit compares against the empty tree. Binary files stay
in the changed-file list and display Git's binary-diff marker even when no textual hunks exist.

## Phase 110 — Commit-detail contracts and parsers (pure core)

**Goal:** define and prove a framework-free commit-detail model before any Git execution, IPC, or
UI work.

**Implementation:**

- Extend [`src/core/types.ts`](../../src/core/types.ts) with `GitCommitFileStatus`,
  `GitCommitFileChange`, and `GitCommitDetails` using the contract above; keep the existing compact
  `GitCommit` list shape unchanged.
- Add `src/core/parsers/CommitDetailsParser.ts` with pure functions that parse one NUL-delimited
  metadata record and one NUL-delimited name-status stream. Map `A/M/D/R/C/T/U` status codes,
  preserve unknown codes without throwing away their paths, parse rename/copy similarity scores,
  and reject structurally incomplete metadata or rename/copy records with a typed parse error.
- Keep patch content opaque in core: the parser assembles the validated metadata and files with the
  patch string supplied by the caller but does not interpret diff lines or import renderer code.
- Add `tests/unit/commit-details-parser.test.ts` covering a normal commit, root commit, multiple
  parents, added/modified/deleted/type-changed files, rename/copy scores, spaces, Unicode, empty
  file output, unknown status, malformed metadata, truncated rename/copy output, and binary patch
  pass-through.
- Export the parser through the existing core parser/module surface only if a barrel is already
  used by consumers; do not add Node, Electron, DOM, `fs`, or `child_process` imports to `src/core`.

**Exit criteria:** both TypeScript configs are clean with `npx tsc --noEmit -p tsconfig.node.json`
and `npx tsc --noEmit -p tsconfig.web.json`; the focused parser tests and full `npm test` suite are
green; `npm run lint` is green; the core-purity review confirms no Node/Electron/DOM dependency in
the new parser.

**Files:** edit `src/core/types.ts`; new `src/core/parsers/CommitDetailsParser.ts`; new
`tests/unit/commit-details-parser.test.ts`.

---

## Phase 111 — Read-only GitService and typed IPC (main + preload)

**Goal:** load authoritative local details for one validated full commit hash without exposing Git
or Node access to the renderer.

**Implementation:**

- Add `GitService.getCommitDetails(repoPath, fullHash)` beside the existing History methods in
  [`src/main/services/GitService.ts`](../../src/main/services/GitService.ts). Run metadata,
  first-parent/root-aware NUL name-status, and no-color patch reads through the existing
  `readOnly()`/`GitRunner` path only; use argument arrays and a `--` revision/path separator where
  supported, never a shell or interpolated command string.
- Use Git's rename/copy detection consistently for the file list and patch. Retain all parent hashes
  in metadata, compare merges to the first parent, and return root, empty, and binary commits
  truthfully.
- Add a `GitCommitDetailsPayload` to
  [`src/main/ipc/ipc-schemas.ts`](../../src/main/ipc/ipc-schemas.ts) with `repoPath` and a full
  40–64 character hexadecimal `fullHash`; the schema must reject revision syntax, leading dashes,
  abbreviated ids, and empty values.
- Register `git:getCommitDetails` beside the existing history handler in
  [`src/main/ipc/ipc-handlers.ts`](../../src/main/ipc/ipc-handlers.ts), returning the pure-core
  `GitCommitDetails` result through the standard `IpcResult` wrapper.
- Expose the method through [`preload/index.ts`](../../preload/index.ts) and mirror it in
  [`src/renderer/types/window.d.ts`](../../src/renderer/types/window.d.ts). Keep
  `contextIsolation`, sandboxing, and the existing renderer boundary unchanged.
- Add integration coverage against real temporary repositories for a normal commit, root commit,
  rename, deletion, Unicode path, binary file, and merge commit. Assert the exact `GitRunner`
  argument arrays or add a focused service test so hash validation and first-parent/read-only
  behavior cannot regress.

**Exit criteria:** both TypeScript configs are clean; the focused parser/service/IPC tests and full
`npm test` suite are green; `npm run lint` is green; every new Git invocation is read-only, routed
through `GitRunner`, passed as an args array, and accepts only the Zod-validated full hash; no
secret, patch content, or repository data is logged.

**Files:** edit `src/main/services/GitService.ts`, `src/main/ipc/ipc-schemas.ts`,
`src/main/ipc/ipc-handlers.ts`, `preload/index.ts`, and `src/renderer/types/window.d.ts`; add or edit
focused unit/integration test files under `tests/unit/` and `tests/integration/`.

---

## Phase 112 — Reliable pagination and scroll containment (renderer store + layout)

**Goal:** make the existing History list scroll normally and make every accepted `Load more` click
produce a deterministic visible result.

**Implementation:**

- Replace the single shared `tracker` pagination model in
  [`src/renderer/store/historyStore.ts`](../../src/renderer/store/historyStore.ts) with an explicit
  History target identity (repository path plus current branch), visible-limit state, and separate
  initial/refresh versus pagination request guards. Repository or branch changes reset the target
  to 50; a same-target refresh keeps the current visible limit.
- Load `visibleLimit + 1` commits from offset zero, deduplicate by `fullHash`, render only
  `visibleLimit`, and set `hasMore` from the look-ahead item. `loadMore()` is single-flight,
  increases the requested limit exactly once, and atomically replaces the snapshot; a stale result
  for another target is dropped without clearing or corrupting the active target.
- Define failure semantics explicitly: a failed pagination request keeps the prior rows and
  `hasMore`, restores the previous visible limit, clears `loadingMore`, and leaves one actionable
  error so the next click is a genuine retry. Rapid clicks while `loadingMore` are ignored rather
  than starting duplicate reads.
- Pass current branch identity from
  [`src/renderer/screens/HistoryScreen.tsx`](../../src/renderer/screens/HistoryScreen.tsx) into the
  store load target so branch switches cannot reuse pagination depth or responses from the prior
  branch.
- Make `.gw-history-page` a bounded `height: 100%`, `min-height: 0`, overflow-hidden flex column;
  make `.gw-history-body` the only vertical scroll owner with `min-height: 0`; keep the table header
  sticky and move pagination into a sticky, non-overlaying footer with an opaque surface and top
  border in [`src/renderer/screens/dataScreens.css`](../../src/renderer/screens/dataScreens.css).
- Externalize `Load more`, `Loading…`, loaded-count, pagination failure, and History empty/loading
  copy in [`src/renderer/strings.ts`](../../src/renderer/strings.ts) as touched user-facing strings.
- Extend store tests with first-click success, exact-multiple look-ahead, no duplicate hashes,
  rapid double click, failed-click retry, same-target refresh during pagination, repository switch,
  and branch switch. Extend `tests/e2e/history.spec.ts` with a constrained viewport assertion that
  the History body has real scroll overflow, the header/footer remain reachable, and one click
  increases the rows.

**Exit criteria:** both TypeScript configs are clean; focused History-store tests and full
`npm test` are green; `npm run lint` is green; `npm run e2e -- tests/e2e/history.spec.ts` proves
scroll containment and first-click pagination without duplicates at a constrained app height; no
commit-detail UI is added yet.

**Files:** edit `src/renderer/store/historyStore.ts`, `src/renderer/screens/HistoryScreen.tsx`,
`src/renderer/screens/dataScreens.css`, `src/renderer/strings.ts`,
`tests/unit/history-store-request-guard.test.ts`, and `tests/e2e/history.spec.ts`; add a focused
pagination unit test file only if keeping the cases separate improves readability.

---

## Phase 113 — Resizable commit-detail browser (renderer + e2e) — feature-complete stop point

**Goal:** let the user select any loaded commit and inspect its files and exact patch without
leaving History or enabling a mutating Git action.

**Implementation:**

- Extend `historyStore` with selected hash, detail data, loading, and error state plus a dedicated
  detail request guard. Selection calls `window.api.git.getCommitDetails`; a new selection,
  repository change, or branch change invalidates the prior response. Same-target refresh and
  pagination preserve selection only while that full hash remains visible.
- Convert commit rows in
  [`src/renderer/screens/HistoryScreen.tsx`](../../src/renderer/screens/HistoryScreen.tsx) into
  semantic buttons or equivalent keyboard-operable options with visible focus, `aria-selected`,
  and a selected-row style. Do not attach selection to the hash alone or make row text
  unselectable.
- Wrap the bounded History body in
  [`ResizableMainSplit`](../../src/renderer/components/ResizableMainSplit.tsx): the left pane owns
  the existing History list, return-to-working-changes card, and sticky pagination; the right pane
  starts with `Select a commit to view its changes` and then shows commit subject, full/short hash,
  author name/email, date, parent/merge context, and changed-file count.
- Render a compact changed-file list with status labels and old → new paths for renames/copies,
  followed by the full unified patch. Binary-only and no-textual-patch commits get truthful empty
  states without hiding their changed files. Detail loading/error states stay inside the right pane
  and never replace or freeze the commit list.
- Extract Status's current diff-line presentation into a shared renderer-only component such as
  `src/renderer/components/UnifiedDiff.tsx`; use it from both Status and History. Preserve existing
  theme-token coloring, horizontal code scrolling, whitespace, and Status test ids/behavior.
- Add History-specific split sizing, selected-row, metadata, file-list, diff, compact-width, and
  reduced-motion styles to `dataScreens.css`; use the split component's existing keyboard resize
  contract and persist the History width under its own versioned local-storage key.
- Add all new labels, accessible names, loading/empty/error copy, file-status labels, and merge/root
  context to `STR`; do not leave new English literals embedded in JSX.
- Extend `tests/e2e/history.spec.ts` to click a commit and assert authoritative metadata, changed
  filenames, added/deleted lines, rename display, selected state, keyboard selection, resize
  semantics, root/binary empty states, and selection reset on branch/repository change. Keep the
  Phase 79 Uncommit controls and the Phase 112 scroll/pagination regressions green.
- Run the relevant safety and core-purity reviewers because the feature touches Git execution,
  validated IPC, pure core parsing, and a screen that already contains destructive Uncommit
  controls; the new detail pane itself must expose no write path.

**Exit criteria:** both TypeScript configs are clean; focused parser/service/store tests and full
`npm test` are green; `npm run lint` is green; `npm run e2e -- tests/e2e/history.spec.ts` proves the
reported scroll and first-click pagination fixes plus mouse/keyboard commit inspection, changed
files, unified patch, stale-response safety, and preserved Uncommit behavior; `npm run e2e` is green
for the full Electron suite; core-purity and safety reviews report no blocking findings.

**Files:** edit `src/renderer/store/historyStore.ts`, `src/renderer/screens/HistoryScreen.tsx`,
`src/renderer/screens/StatusScreen.tsx`, `src/renderer/screens/dataScreens.css`,
`src/renderer/strings.ts`, and `tests/e2e/history.spec.ts`; new
`src/renderer/components/UnifiedDiff.tsx`; add or edit focused History-store/component tests as
needed.

## Acceptance criteria (feature)

1. History has one visible internal vertical scrollbar; scrolling reaches every loaded row while
   the app shell, global header, and sidebar remain fixed.
2. The History column header remains visible while rows scroll, and the sticky pagination footer is
   reachable and does not cover the last commit row.
3. One accepted click on `Load more` increases the visible commit depth or removes the button when
   the end is reached; it never requires a second click because an unrelated same-target refresh
   invalidated the first response.
4. Pagination never renders a duplicate full hash, rapid clicks start one request, a failure keeps
   existing rows and allows a truthful retry, and repository/branch switches cannot mix histories.
5. Clicking or keyboard-selecting a loaded commit marks exactly one row and opens its details in a
   resizable right pane without navigating away from History.
6. The detail pane shows authoritative subject, full hash, author name/email, date, parent context,
   changed-file count, file statuses, rename/copy paths, and the exact no-color unified patch.
7. Root, merge, rename/copy, deletion, Unicode-path, binary, and no-textual-patch commits render
   truthful files and states; merges use the documented first-parent view.
8. Selecting commits quickly, switching branch, or switching repository never paints stale details
   from the previous selection or target. Same-target refresh preserves selection only if the hash
   still exists in the visible snapshot.
9. Status and History use the same unified-diff renderer without changing existing Status diff
   behavior, and all new History strings are externalized.
10. The detail pane contains no checkout, revert, reset, uncommit, cherry-pick, amend, rebase, or
    other mutating action; the existing separately confirmed Uncommit controls keep their behavior.
11. Unit/integration tests run offline against real temporary Git repositories, and focused plus
    full Vitest, lint, TypeScript, Playwright, core-purity, and safety gates are green.

## Decisions (resolved)

- The feature slug is `history-commit-details`.
- The track is phased as 110–113; Phase 113 is the feature-complete stop point.
- Commit details open in a resizable right-side master/detail pane, not a modal or global inspector.
- Detail content includes metadata, a changed-file list, and the full unified patch.
- Commit inspection is read-only; no new Git mutation is reachable from the detail pane.
- Pagination uses a look-ahead snapshot from offset zero and preserves visible depth across
  same-target refreshes instead of appending fragile offset pages.
- History owns one bounded internal scroll pane with a sticky header and sticky pagination footer.
- Merge details use first-parent semantics; root commits compare against the empty tree.
- The existing Status diff styling becomes a shared renderer component rather than being copied.

## Open questions (resolve at kickoff)

None. Product boundary, detail placement, visible content, merge semantics, pagination behavior,
and non-goals are resolved.
