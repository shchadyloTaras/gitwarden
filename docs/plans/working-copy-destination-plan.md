# Plan — Working-Copy Destination: make it clear where uncommitted work goes

**Status:** ✅ complete — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 106 → 107.
**Feature-complete stop point:** Phase 107.
**Prompts:** [`docs/prompts/working-copy-destination-prompts.md`](../prompts/working-copy-destination-prompts.md).

## Goal

Status currently separates staged, unstaged, and untracked files, but it does not explain that all
of them still live in one working copy. A user can switch branches, see the same files, and infer
that staging or switching assigned those files to a branch. This feature makes the destination
visible: uncommitted work is not in a branch yet; it joins the branch checked out at the moment of
commit.

**Product boundary (decided — explanatory, not operational):** this is persistent Status-screen
information architecture, not a banner, modal, warning, or new Git action. It must not change
staging, switching, committing, Git execution, IPC, or ownership of branch state.

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **One `FileChange` already models both index and worktree state, and `GitStatus` carries the
   entire file list plus detached-HEAD truth.** `FileChange` has one stable `path` with
   `indexStatus` and `worktreeStatus`, while `GitStatus` provides `files`, `branch`, and
   `detached` ([types.ts:117-152](../../src/core/types.ts)). The porcelain parser emits one record
   for ordinary/renamed files and marks conflicts and untracked files on both sides
   ([PorcelainParser.ts:58-96](../../src/core/parsers/PorcelainParser.ts)). **Consequence:** a pure
   helper can count unique changed paths without adding status fields, Git calls, or IPC.

2. **Status deliberately renders the same `FileChange` in more than one visual section.** It
   derives `staged`, `unstaged`, and `untracked` arrays from `status?.files ?? []`
   ([StatusScreen.tsx:536-539](../../src/renderer/screens/StatusScreen.tsx)); an `MM` file is
   already proved to appear in both lists by the e2e fixture
   ([status.spec.ts:131-153](../../tests/e2e/status.spec.ts)). **Consequence:** the destination
   card must use the new unique-file helper rather than summing section lengths.

3. **The Status toolbar has a stable full-width insertion point, and the untracked section owns
   the label that needs changing.** The toolbar ends before the Status banners/body
   ([StatusScreen.tsx:551-587](../../src/renderer/screens/StatusScreen.tsx)); the current section
   says `UNTRACKED FILES` ([StatusScreen.tsx:785-805](../../src/renderer/screens/StatusScreen.tsx)).
   **Consequence:** place the card immediately below the toolbar, above the existing stash-conflict
   banner, and extend the section header only enough to add the muted new-files explanation.

4. **Status has the right loading and refresh semantics already.** `statusStore.loadStatus` clears
   data only when changing repositories; a same-repository refresh keeps the prior status rendered
   while the request is in flight ([statusStore.ts:26-46](../../src/renderer/store/statusStore.ts)).
   **Consequence:** use `count: null` only while no status has arrived, never a fabricated `0`;
   derive the card from the retained status during a background refresh so it does not flicker.

5. **`appStore.currentBranch` is the existing destination source, with one writer.** The app store
   exposes `currentBranch` ([appStore.ts:56-110](../../src/renderer/store/appStore.ts));
   `branchStore.load` is explicitly its sole writer and clears it when no branch is current
   ([branchStore.ts:90-128](../../src/renderer/store/branchStore.ts)). `doSwitch` writes the new
   branch only after `git.switchBranch` succeeds; its failure path only records `switchError`
   ([branchStore.ts:131-159](../../src/renderer/store/branchStore.ts)). **Consequence:** Status
   reads `appStore.currentBranch` and adds no branch store or optimistic update.

6. **The header has three literal `on` render paths to replace consistently.** Detached HEAD, the
   branch dropdown, and the not-yet-loaded fallback each render their own prefix
   ([GlobalHeader.tsx:206-286](../../src/renderer/components/GlobalHeader.tsx)). **Consequence:**
   make all three read `Checked out:`, while preserving the existing dropdown and detached-pill
   behaviour.

7. **No new refresh channel is needed.** A full active-repo refresh already reloads the branch
   store and the Status store when Status is on screen
   ([refreshActiveRepo.ts:21-80](../../src/renderer/store/refreshActiveRepo.ts)). Existing
   UI-facing labels are centralized in `STR` ([strings.ts:1-37](../../src/renderer/strings.ts)),
   and both themes expose the same semantic color tokens
   ([theme.css:3-97](../../src/renderer/theme.css)). **Consequence:** wire presentation to the
   established refresh/store seams, externalize all copy, and style from existing theme tokens.

8. **The existing switch fixture already proves the important non-optimistic failure behavior.** A
   dirty-tree switch remains on `main` after the picker reports failure
   ([switch-ux.spec.ts:122-136](../../tests/e2e/switch-ux.spec.ts)). **Consequence:** extend this
   coverage to assert the destination card keeps the old branch as well.

## Scope

- **In:**
  - A pure unique-changed-file counter with unit tests.
  - A reusable, presentation-only Working Copy → Commit → Destination Branch card on Status.
  - Explicit dirty, clean, detached, initial-loading, and same-repo-background-refresh states.
  - The `Checked out:` header wording in dropdown, fallback, and detached forms.
  - `NEW FILES` plus `Not yet in Git history` in Status.
  - Externalized strings, light/dark token styling, narrow-width wrapping, semantic region markup,
    and a screen-reader summary.
  - Focused Vitest and Playwright coverage for count, state, successful switch, and failed switch.
- **Out / Non-goals:**
  - Any new Git command, IPC channel, preload API, persistence, branch store, or dependency.
  - Changing staging, switching, commit, conflict, stash, or repository-selection mechanics.
  - A prompt, tooltip-only explanation, dismissible banner, modal, or interactive control in the
    card.
  - Claiming that a detached-HEAD commit is assigned to a branch.

## New contracts

### Pure count

```ts
export function countUniqueChangedFiles(files: readonly FileChange[]): number
```

The helper is framework-free and uses `FileChange.path` as the identity key. A path counts once if
either side represents a change; `unmodified` and `ignored` do not count. A file staged and then
modified again, a conflict, and an untracked file therefore each contribute exactly one.

### Presentation component

```ts
export interface WorkingCopyDestinationCardProps {
  count: number | null
  branch: string | null
  detached: boolean
}
```

`count: null` means the working-copy result is not known yet and must never render as zero. The
component has no store, Git, IPC, or action dependency; `StatusScreen` owns data selection and
hides it only when there is no active repository.

## Phase 106 — Unique working-copy count (pure core)

**Goal:** provide one tested, framework-free definition of the number of changed files in a
working copy.

**Implementation:**

- Add `countUniqueChangedFiles(files)` in
  [`src/core/status/workingCopy.ts`](../../src/core/status/workingCopy.ts). Keep it pure under
  AGENTS.md rule #1: no Electron, DOM, filesystem, child-process, or renderer imports.
- Treat a path as changed when either its index or worktree status is a real change; de-duplicate
  by `path` rather than by staged/unstaged presentation membership. The helper must be defensive
  for a duplicate input path even though porcelain normally produces one `FileChange` per path.
- Add [`tests/unit/working-copy-count.test.ts`](../../tests/unit/working-copy-count.test.ts) with
  clean input; singular/plural-ready one-file input; an `MM` file; duplicate same-path input;
  untracked; conflicted; ignored/unmodified-only records; and mixed paths.
- Do not change `GitStatus`, porcelain parsing, `statusStore`, or any renderer file in this phase.

**Exit criteria:** `npx tsc -p tsconfig.node.json --noEmit` and
`npx tsc -p tsconfig.web.json --noEmit` clean; `npm test` green including the new helper tests;
core-purity passes; `npm run lint` clean.

**Files:** new `src/core/status/workingCopy.ts`; new `tests/unit/working-copy-count.test.ts`.

---

## Phase 107 — Working-copy destination card and truthful labels (renderer + e2e) — feature-complete stop point

**Goal:** Status persistently explains where the current working copy will go, without changing how
Git operates.

**Implementation:**

- Add the reusable, presentation-only
  [`src/renderer/components/WorkingCopyDestinationCard.tsx`](../../src/renderer/components/WorkingCopyDestinationCard.tsx).
  It receives only `count`, `branch`, and `detached` and renders a labelled semantic region with a
  concise screen-reader summary. Its states are:
  - `count > 0`: `N uncommitted change(s)` with muted `Not in any branch yet.`;
  - `count === 0`: keep the full compact card, with `Working copy clean` and `No changes are
waiting to commit.`;
  - `count === null`: `Checking working copy…`, with no numeric count and no claim that the tree
    is clean;
  - normal branch: `DESTINATION BRANCH`, `Checked out: <branch>`, and `Changes join this branch
only after commit.`;
  - detached HEAD: `Detached HEAD` and `A commit will not join a branch until you create one.`;
  - no known branch yet (not detached): neutral `Checking checked-out branch…`, not a fabricated
    branch name.
- In [`StatusScreen.tsx`](../../src/renderer/screens/StatusScreen.tsx), render the card directly
  below the toolbar and above the stash-conflict banner when `activeRepo` exists. Pass
  `countUniqueChangedFiles(status.files)` only when `status` exists; otherwise pass `null`.
  Pass `appStore.currentBranch` as `branch` and the confirmed status detached flag as `detached`.
  Do not read or write branch state anywhere else. Because same-repo reloads retain `status`, the
  old card remains stable during a background refresh.
- Extend the local `SectionHeader` presentation contract only as needed for a muted subtitle, then
  rename the untracked section to `NEW FILES` and add `Not yet in Git history.` This is a copy
  change only; all stage/delete behavior and test IDs remain intact.
- In [`GlobalHeader.tsx`](../../src/renderer/components/GlobalHeader.tsx), replace the visible
  literal `on` before the branch dropdown, fallback text, and detached pill with one externalized
  `Checked out:` label. Update the branch picker’s accessible label to match the same language;
  leave its branch-switch calls and disabled/switching behavior unchanged.
- Add all new visible/accessible text to [`src/renderer/strings.ts`](../../src/renderer/strings.ts).
  Add scoped card styles in [`src/renderer/theme.css`](../../src/renderer/theme.css): a compact
  three-part layout on wide screens, a wrapping/stacked layout at narrow widths, and a visually
  hidden summary utility. Use only existing `--gw-*` tokens so dark and light themes both inherit
  correct contrast.
- Add stable card/header test IDs only where an existing accessible selector cannot express the
  behavior. Do not expose an action or make the connector interactive.
- Add [`tests/unit/working-copy-destination-card.test.tsx`](../../tests/unit/working-copy-destination-card.test.tsx)
  using existing React/React-DOM tooling for loading, dirty, singular/plural, clean,
  normal-branch, and detached copy. Extend
  [`tests/e2e/status.spec.ts`](../../tests/e2e/status.spec.ts) to prove the card counts an `MM`
  file once, stays full when clean, updates its destination after a successful header switch, and
  shows the new header/new-files labels. Extend
  [`tests/e2e/switch-ux.spec.ts`](../../tests/e2e/switch-ux.spec.ts) so a blocked dirty switch
  leaves the destination card on the old branch. Include a detached-HEAD fixture/assertion and a
  narrow-width wrapping assertion without relying on color screenshots alone.

**Exit criteria:** `npx tsc -p tsconfig.node.json --noEmit` and
`npx tsc -p tsconfig.web.json --noEmit` clean; `npm test` green including the count and
presentation tests; `npm run lint` clean; relevant Playwright Status and switch-UX specs green;
the final UI behavior meets every acceptance criterion below.

**Files:** new `src/renderer/components/WorkingCopyDestinationCard.tsx`; new
`tests/unit/working-copy-destination-card.test.tsx`; edit
`src/renderer/screens/StatusScreen.tsx`, `src/renderer/components/GlobalHeader.tsx`,
`src/renderer/strings.ts`, `src/renderer/theme.css`, `tests/e2e/status.spec.ts`, and
`tests/e2e/switch-ux.spec.ts`.

## Acceptance criteria (feature)

1. With an active repository, Status always shows the full-width card immediately below its
   toolbar; with no active repository, the card is absent.
2. A file that is both staged and unstaged contributes one uncommitted change, not two. Untracked
   and conflicted files likewise count once per path.
3. Staging, unstaging, and switching do not claim to assign an uncommitted file to a branch; the
   card always says it is not in any branch yet until commit.
4. A successful branch switch updates `Checked out: <branch>` once the existing branch store has
   confirmed it. A failed or blocked switch leaves the previously checked-out branch on the card.
5. A clean tree retains the complete compact card with `Working copy clean`, rather than
   collapsing to a line or hiding the explanation.
6. A detached HEAD is named explicitly and never represented as a destination branch.
7. Initial Status loading shows an unknown/loading working-copy state rather than `0` changes;
   same-repo refreshes keep the prior card visible until newer status arrives.
8. The Status list says `NEW FILES` with muted `Not yet in Git history`, without changing stage or
   delete actions.
9. The global header says `Checked out:` before its branch dropdown, fallback branch, and detached
   pill.
10. The card is a labelled semantic region with a concise accessible summary, uses theme tokens in
    both modes, and wraps without clipping at narrow widths.

## Decisions (resolved)

- **Slug / numbering:** `working-copy-destination`, Phases 106–107, feature-complete at 107.
- **Copy tone:** plain and honest — `Not in any branch yet.` is preferred over euphemistic
  wording.
- **Clean state:** retain the full compact card; the concept should not disappear precisely when
  the tree is clean.
- **Branch truth:** Status reads `appStore.currentBranch`; `branchStore` remains its sole writer.
  No optimistic branch value, second store, or IPC is allowed.
- **Loading truth:** `null` count is unknown/loading, never zero.
- **Scope boundary:** the card is information only. Git mechanics and the established switch/stage
  code paths remain unchanged.

## Open questions (resolve at kickoff)

None.
