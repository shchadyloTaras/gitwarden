# Plan — Merge a Branch: fold one local branch into the branch you're on, without the terminal

**Status:** ⬜ not started — Phases 82–84 — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 82 → 84.
**Feature-complete stop point:** Phase 84.
**Prompts:** [`docs/prompts/merge-branch-prompts.md`](../prompts/merge-branch-prompts.md).

## Goal

Today a user can create, switch, and delete branches from the Branches screen, but there is **no way
to combine two branches** — finishing a feature branch by folding it into `main` requires opening a
terminal and running `git merge`. A non-technical user is stuck. (The already-shipped
**Diverged-Branch Merge** only handles the _remote_ side: bringing a fetched `origin/<branch>` into
the current branch from the failed-pull recovery banner — it does nothing for a purely local
feature branch.)

This feature adds a **one-click "Merge into `<current>`" action** to every other local branch on the
Branches screen. Clicking it (after a short inline confirm) runs a plain **local merge** of that
branch into the branch you're currently on. A clean or fast-forwardable merge folds the work in and
the list refreshes; a **real content conflict** is never guessed at — the repo is left in git's
standard mid-merge state and the user is routed to the **existing** `resolve-conflicts` → Status flow
where the current stage-then-commit UI finishes the merge.

**Product boundary (decided — "local branch → current branch, merge only, no auto-resolve"):** the
action is purely **local** — it merges a local branch ref into the checked-out branch. It does
**not** fetch, does **not** push, and never needs a token or the network. It offers **merge only**
(no rebase — rebase rewrites local commit SHAs, hard to explain and risky in a GUI). The **target is
always the current branch** (no source/target picker). It **never** auto-resolves a content
conflict, adds **no new identity guard** (merge is local and reversible; identity stays enforced at
Push — a fast-forward merge creates no commit at all), and never touches global/system state (honors
the AGENTS.md rule _"Don't change global git config — only `--local`"_ — this feature changes no
config at all).

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a claim with real
`file:line` links and the **consequence** for this feature:

1. **A local merge primitive is 90% built — `mergeRemoteBranch` is the exact template.**
   `GitService.mergeRemoteBranch` runs `git merge --no-edit <remote>/<branch>` — purely local (no
   `auth` param, no credential env, no network), `--no-edit` avoids dropping a GUI user into an
   editor, and a real conflict rejects with a `GitError` code `mergeConflict`
   ([GitService.ts:201-218](../../src/main/services/GitService.ts)). **Consequence:** add a sibling
   `mergeBranch(repoPath, ref)` running `git merge --no-edit <ref>` and refactor `mergeRemoteBranch`
   to delegate to it (`mergeBranch(repoPath, \`${remote}/${branch}\`)`) so there is a single merge
   code path.

2. **The Branches screen already lists local branches with per-row actions — Merge is the missing
   verb.** `BranchesScreen` renders `localBranches` with **Switch** / **Delete** buttons and a
   two-step inline Delete confirm keyed on `deleteConfirmBranch`, plus a worktree guard
   (`isCheckedOutInAnotherWorktree`) that swaps the actions for an "In worktree" badge when a branch
   is checked out elsewhere ([BranchesScreen.tsx:51-357](../../src/renderer/screens/BranchesScreen.tsx)).
   **Consequence:** add a **"Merge into `<current>`"** button + inline confirm on each non-current
   local branch row, mirroring Delete's two-step pattern. Merging a branch that is checked out in
   another worktree is safe (we merge its **ref**, we never check it out), so Merge can be offered
   even on worktree rows.

3. **`branchStore` has `doSwitch`/`doCreate`/`doDelete` but no `doMerge`.** Each action calls
   `window.api.git.<op>`, refreshes the branch list via `refreshBranches`, and sets a
   `successMessage`/`error` ([branchStore.ts:28-114](../../src/renderer/store/branchStore.ts)).
   **Consequence:** add `doMerge(branch)` with the same shape; on a **conflict** result carry the
   returned `remediation` in state so the screen can offer a "Go to Status" navigate; on a dirty-tree
   refusal set the plain `error` string.

4. **The branch IPC pattern is a thin, Zod-validated `wrap(...)` per channel — copy
   `git:switchBranch`.** `git:switchBranch` and `git:deleteBranch` parse
   `GitBranchOpPayload = { repoPath, branch }` then call the service
   ([ipc-handlers.ts:377-396](../../src/main/ipc/ipc-handlers.ts),
   [ipc-schemas.ts:87-90](../../src/main/ipc/ipc-schemas.ts)); the method is surfaced on the preload
   bridge ([preload/index.ts:177-182](../../preload/index.ts)) and typed in `window.d.ts`
   ([window.d.ts:150-152](../../src/renderer/types/window.d.ts)). **Consequence:** add a `git:merge`
   channel the same way, **reusing `GitBranchOpPayload`** — no new schema — plus the bridge method
   `git.merge(repoPath, branch)` and its `window.d.ts` type. This is a **user-initiated** action, so
   it gets a plain `git:*` handler; it does **not** extend the `ExecutableAction` remediation model.

5. **A conflict already routes to Status for free — no core / remediation change.** `mergeConflict`
   is a `RemediableGitErrorCode` that `GIT_ERROR_ACTION` maps to `resolve-conflicts`, which is a
   `navigate` remediation targeting `status`
   ([remediation.ts:26-27,79-81,116-125](../../src/core/safety/remediation.ts)); and `wrap()`'s
   `toIpcFailure` attaches `code` **and** (because the code is remediable) the `remediation` to any
   thrown `GitError` ([ipc-handlers.ts:140-149](../../src/main/ipc/ipc-handlers.ts),
   [ipcFailure.ts:25-35](../../src/main/ipc/ipcFailure.ts)). **Consequence:** the `git:merge` handler
   simply **lets a `mergeConflict` `GitError` propagate** — the renderer receives the
   `resolve-conflicts` remediation automatically and renders it with the existing `RemediationButton`
   navigate branch (see finding 6). No new error code, no core edit.

6. **The conflict "Go to Status" affordance already exists — `RemediationButton`.** For a `navigate`
   remediation, `RemediationButton` renders a button that calls `navigate(target)`
   ([RemediationButton.tsx:87-92](../../src/renderer/components/RemediationButton.tsx)); `RemoteScreen`
   reuses it exactly this way in its recovery banner
   ([RemoteScreen.tsx:397-402](../../src/renderer/screens/RemoteScreen.tsx)). **Consequence:** the
   Branches screen renders the returned conflict remediation with the same component — a "Go to
   Status" button — no new navigation code.

7. **The clean-tree pre-check has a cheap existing primitive + an exact precedent.** `getStatus`
   returns `GitStatus { files, upstream?, ahead, behind }`
   ([GitService.ts:60-67](../../src/main/services/GitService.ts)); the diverged-branch-merge executor
   already refuses with a plain-language message when `getStatus(...).files.length > 0`
   ([remediationExecutor.ts:118-142](../../src/main/ipc/remediationExecutor.ts)). **Consequence:** the
   `git:merge` handler runs the same `files.length === 0` guard and refuses a dirty tree up front with
   a clear message, instead of letting git fail with a confusing "local changes would be overwritten."

8. **Navigation is a one-liner already wired.** `appStore` exposes a `NavScreen` union including
   `'status'` and `'branches'` and a `navigate(screen)` setter
   ([appStore.ts:29-73](../../src/renderer/store/appStore.ts)). **Consequence:** the conflict "Go to
   Status" (finding 6) needs no new nav plumbing.

9. **All row copy is externalized in `STR`.** `BranchesScreen` uses `STR.TT_BRANCH_SWITCH` /
   `TT_BRANCH_DELETE` / `TT_BRANCH_CREATE` etc., and `strings.ts` is the single table
   ([strings.ts](../../src/renderer/strings.ts)). **Consequence:** all new merge labels, the confirm
   prompt/confirm/cancel, and the success line go in `STR` — no hard-coded user-facing strings.

## Scope

- **In:** a local `GitService.mergeBranch(repoPath, ref)` (+ refactor `mergeRemoteBranch` to delegate
  to it); a `git:merge` IPC channel (reusing `GitBranchOpPayload`) with a clean-tree pre-check that
  refuses a dirty tree; the preload bridge + `window.d.ts` typing; `branchStore.doMerge`; a "Merge
  into `<current>`" inline-confirm row action on `BranchesScreen` for every non-current local branch;
  a real conflict falling back to the **existing** `resolve-conflicts` → Status flow via
  `RemediationButton`; success → branch-list refresh; all strings externalized.
- **Out / Non-goals:**
  - **No rebase** — merge only (rebase rewrites local SHAs; explicit non-goal, matches the diverged
    merge).
  - **No source/target picker** — the target is always the current (checked-out) branch.
  - **No merging remote branches from this screen** — remote→current stays the pull-banner flow
    (Diverged-Branch Merge). Only local branches are offered as the merge source.
  - **No fetch and no push inside this action** — it stops at the local merge; the user clicks the
    existing Push button separately (reuses Push's safety checks as-is). Network-free, auth-free.
  - **No auto-resolution of content conflicts** — a real conflict is left in git's standard mid-merge
    state and handed to the existing `resolve-conflicts` → Status flow.
  - **No new conflict-resolution UI** — the Status stage-then-commit flow already finishes a merge.
  - **No abort/undo of a merge** (`git merge --abort`) — deferred to a separate fast-follow feature
    that should also rescue the diverged-pull conflict state.
  - **No new identity guard on the merge itself** — merge is local; identity stays enforced at Push
    (a fast-forward merge creates no commit at all). Matches the diverged-merge precedent.
  - **No merge on a detached HEAD** — with no current branch the action is hidden.
  - **No new safety verdicts/severities** and **no global/system-state mutation** (no git config
    changes).

---

## Phase 82 — Local branch merge in GitService (main)

**Goal:** a purely local `git merge --no-edit <ref>` primitive that a real conflict rejects as
`mergeConflict`, with one shared merge code path. Honors AGENTS.md rules #2 (GitRunner is the only
executor), #3 (args arrays), #5 (no secrets logged).

**Implementation:**

- Add `GitService.mergeBranch(repoPath, ref)` running `['merge', '--no-edit', ref]`
  (`readOnly: false`, a `timeoutMs` mirroring `mergeRemoteBranch`'s `60_000`) — **no `auth` param**,
  no network, no credential env ([GitService.ts:201-218](../../src/main/services/GitService.ts) is the
  template). `ref` is a branch name passed as a **single array element** (never string-interpolated
  into a shell).
- Refactor `mergeRemoteBranch` to delegate:
  `return this.mergeBranch(repoPath, \`${remote}/${branch}\`)` — behaviour and doc unchanged, one
  merge path so the GitRunner stdout-conflict classification (Phase 69) covers both.
- **No clean-tree pre-check here** — that is the orchestration layer's job (Phase 83); this phase is
  the raw primitive.

**Exit criteria:** `npx tsc --noEmit` clean on both tsconfigs; **integration tests (Vitest, offline
real temp repo)**: a fast-forwardable merge succeeds and advances the branch; a true 3-way merge
creates a merge commit; a **conflicting** merge (both branches edit the same line) rejects with a
`GitError` code `mergeConflict` (regression-proofs the GitRunner stdout-classification fix from
Phase 69); an "already up to date" merge is a successful no-op; `mergeRemoteBranch`'s existing tests
stay green (delegation preserves behaviour); `npm test` green; `npm run lint` clean; the
**safety-reviewer** subagent passes (args arrays, no secrets logged, no global/system state). No
IPC/UI.

**Files:** edit `src/main/services/GitService.ts`; new/extended `tests/unit/git-service-merge.test.ts`
(integration against a temp repo).

---

## Phase 83 — `git:merge` channel + clean-tree pre-check (main + IPC)

**Goal:** `git.merge(repoPath, branch)` runs behind a typed, Zod-validated IPC channel: clean-tree
pre-check → local merge → success, or a real conflict → the structured `resolve-conflicts`
remediation (attached automatically by `wrap()`). Honors AGENTS.md rules #3 (args arrays), #6 (the
explicit button click + inline confirm is the confirmation — no second modal).

**Implementation:**

- Register `ipcMain.handle('git:merge', ...)` alongside the branch block (copy the `git:switchBranch`
  shape, [ipc-handlers.ts:377-382](../../src/main/ipc/ipc-handlers.ts)), **reusing
  `GitBranchOpPayload = { repoPath, branch }`** ([ipc-schemas.ts:87-90](../../src/main/ipc/ipc-schemas.ts))
  — no new schema.
- In the handler: run `getStatus` ([GitService.ts:60-67](../../src/main/services/GitService.ts)); if
  `status.files.length > 0`, **refuse the merge with a plain-language message** (mirroring the
  diverged-merge executor's clean-tree pre-check,
  [remediationExecutor.ts:118-142](../../src/main/ipc/remediationExecutor.ts)) **without** attempting
  the merge. Otherwise call `services.git.mergeBranch(repoPath, branch)`.
- On a `mergeConflict` `GitError`, **do not catch it** — let it propagate so `wrap()`'s
  `toIpcFailure` ([ipc-handlers.ts:140-149](../../src/main/ipc/ipc-handlers.ts),
  [ipcFailure.ts:25-35](../../src/main/ipc/ipcFailure.ts)) attaches `code: 'mergeConflict'` **and** the
  `resolve-conflicts` → `status` remediation automatically
  ([remediation.ts:116-125](../../src/core/safety/remediation.ts)). Any other git error also flows
  through `wrap()` unchanged.
- Add the bridge method `git.merge(repoPath, branch)` in
  [preload/index.ts](../../preload/index.ts) (mirror `switchBranch`,
  [preload/index.ts:177-178](../../preload/index.ts)) and its type in
  [window.d.ts](../../src/renderer/types/window.d.ts) (mirror
  [window.d.ts:150-152](../../src/renderer/types/window.d.ts)).

**Exit criteria:** `npx tsc --noEmit` clean; **integration tests (Vitest, offline real temp repo)**:
a clean / fast-forwardable divergent merge returns `ok: true` and the repo is merged; a real
conflicting merge surfaces `code === 'mergeConflict'` with `remediation.action === 'resolve-conflicts'`
(navigate → `status`) and the repo is left mid-merge (`MERGE_HEAD` present); a **dirty** working tree
returns the pre-check refusal **without** attempting the merge; `npm test` green; `npm run lint`
clean; the **safety-reviewer** subagent passes (args arrays, no secrets logged, no global/system
state). No UI.

**Files:** edit `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`,
`src/renderer/types/window.d.ts`; new/extended `tests/unit/git-merge-ipc.test.ts` (integration
against a temp repo, asserting the `toIpcFailure` → remediation mapping for a real conflict).

---

## Phase 84 — Merge action on the Branches screen (renderer + e2e)

**Goal:** the user merges a local branch into the current one with one click on Branches —
feature-complete stop point.

**Implementation:**

- **`branchStore`** ([branchStore.ts:28-114](../../src/renderer/store/branchStore.ts)): add
  `doMerge(branch)` mirroring `doSwitch`/`doDelete` — clear messages, call
  `window.api.git.merge(repoPath, branch)`; on `ok` set a success message (e.g. "Merged `<branch>`
  into `<current>`.") and `refreshBranches`; on failure, if `res.remediation` is present (the
  conflict case) keep it in state so the screen can render the navigate, otherwise set `error`
  (covers the dirty-tree refusal message). Add a `mergeConfirmBranch` state + `setMergeConfirm`
  (mirror `deleteConfirmBranch`/`setDeleteConfirm`).
- **`BranchesScreen`** ([BranchesScreen.tsx:311-357](../../src/renderer/screens/BranchesScreen.tsx)):
  on each **non-current local** branch row, add a **"Merge into `<current>`"** button; clicking sets
  `mergeConfirmBranch` and the row swaps to **"Merge `<branch>` into `<current>`? [Yes, merge]
  [Cancel]"** (mirror the inline Delete confirm at
  [BranchesScreen.tsx:322-353](../../src/renderer/screens/BranchesScreen.tsx)). Show the Merge button
  even for worktree rows (merging its ref is safe), while leaving Switch/Delete hidden there as
  today. **Hide the Merge action entirely when there is no current branch** (detached HEAD →
  `currentBranch === null`). On a conflict result, render the returned remediation via
  `<RemediationButton remediation={…} />` in the banner area
  ([RemediationButton.tsx:87-92](../../src/renderer/components/RemediationButton.tsx), reused as in
  [RemoteScreen.tsx:397-402](../../src/renderer/screens/RemoteScreen.tsx)) — a "Go to Status"
  navigate; on a dirty-tree refusal, show the plain message in the existing `branches-error` banner.
- **Strings:** externalize all new copy in [strings.ts](../../src/renderer/strings.ts) — the merge
  button label (e.g. `MERGE_INTO(current)`), its tooltip, the inline confirm prompt/confirm/cancel,
  and the success line. No hard-coded user-facing strings.

**Exit criteria (Playwright e2e, offline fixtures + local bare remote):**

- A repo with a feature branch ahead of the current branch, **clean tree** → Branches shows "Merge
  into `<current>`" on the feature row; clicking → confirm → the merge folds the feature branch into
  the current branch, a success message shows, and the branch list refreshes.
- A **conflicting** merge (both branches edit the same line) → clicking merge re-diagnoses to a "Go
  to Status" button; following it lands on Status with the file shown as **unmerged/conflicted**,
  where the existing stage-then-commit flow finishes the merge.
- A **dirty** working tree → the action is refused with the clean-tree message and no merge happens.
- (If cheap to assert) the Merge action is **hidden** on a detached HEAD.
- `npm test`, `npm run e2e`, `npm run lint` all green; no hard-coded user-facing strings.

**Files:** edit `src/renderer/store/branchStore.ts`, `src/renderer/screens/BranchesScreen.tsx`,
`src/renderer/strings.ts`; new/extended `tests/e2e/branches.spec.ts` (or a dedicated merge spec).

---

## Acceptance criteria (feature)

- From the Branches screen, a user can merge any **non-current local** branch into the branch they're
  on with one click + inline confirm — no terminal.
- A **clean** / fast-forwardable merge folds the branch in and the list refreshes; the user pushes
  with the existing Push button (the action itself never pushes and never fetches — it is
  network-free and auth-free).
- A **real content conflict** is **never** auto-resolved: the repo is left in git's standard
  mid-merge state and the user is routed to the **existing** Status stage-then-commit flow via the
  `resolve-conflicts` navigate remediation.
- A **dirty** working tree is refused up front with a clear message (no confusing raw git error).
- Remote branches are **not** offered as merge sources here (remote→current stays the pull-banner
  flow); no rebase; no auto-push; no abort; no new identity guard; no global/system-state mutation;
  git args stay arrays; no secrets logged.
- Logic-first honored: Phases 82–83 ship green Vitest before the UI; Phase 84 has green Playwright.
  One commit per phase; the progress-log entry written **before** each commit; not pushed.

## Decisions (resolved)

Resolved in the kickoff grilling session — later phases must not re-litigate:

1. **Merge a selected LOCAL branch INTO the current (checked-out) branch**, on the Branches screen.
   Target implicit; no source/target picker. (Grilling Q1.)
2. **No new identity guard** — merge is local & reversible; identity stays enforced at Push (a
   fast-forward merge creates no commit). Matches the diverged-merge precedent. (Q2.)
3. **Inline two-step confirm** mirroring Delete on the same screen ("Merge `X` into `Y`? [Yes,
   merge] [Cancel]"), naming both branches. (Q3.)
4. **A real conflict reuses the existing `mergeConflict` → `resolve-conflicts` → Status flow** — no
   new conflict UI, no core/remediation change (`mergeConflict` is already remediable). (Q4 +
   grounding finding 5.)
5. **Fast-forward allowed** — plain `git merge --no-edit`; git chooses ff vs merge commit (matches
   `mergeRemoteBranch`).
6. **Clean-tree pre-check** refuses a dirty tree up front with a plain message, mirroring the
   diverged-merge executor. (Q6.)
7. **No auto-push after a successful merge** — the user clicks the existing Push button; the action
   is network-free, auth-free, and never fetches.
8. **Local branches only as source** (including worktree branches — we merge the ref, never check it
   out); remote→current stays the pull-banner flow. Hidden on detached HEAD.
9. **First-class `git:merge` action, NOT a remediation trigger** — reuses `GitBranchOpPayload` and
   copies the `git:switchBranch` handler shape; does not extend the `ExecutableAction` model.
10. **Abort/undo of a merge is OUT OF SCOPE** — deferred to a separate fast-follow feature (which
    should also rescue the diverged-pull conflict state). (Grilling final fork.)

## Open questions (resolve at kickoff)

- **Dirty-tree refusal affordance:** message-only (proposed) vs. also linking to Status/Commit so the
  user can stash/commit first. Lean: message-only for the MVP.
- **Merge button on worktree rows:** the row currently replaces all actions with an "In worktree"
  badge. Confirm at Phase 84 kickoff whether the Merge button sits alongside the badge (proposed —
  merging its ref is safe) or is omitted there for visual simplicity.
- **Conflict affordance surface on Branches:** reuse `RemediationButton` "Go to Status" in the
  branches banner (proposed) vs. a dedicated inline note. Lean: reuse `RemediationButton` (zero new
  nav code).
