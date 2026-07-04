# Plan — Uncommit to Working Changes: pull an unpushed commit back into your changes to redo it

**Status:** ✅ complete — Phases 76–79 — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 76 → 79.
**Feature-complete stop point:** Phase 79.
**Prompts:** [`docs/prompts/uncommit-to-changes-prompts.md`](../prompts/uncommit-to-changes-prompts.md).

## Goal

Today, once a user commits, GitWarden gives them no way to take it back. The **History** screen is
read-only — it lists commits with no per-commit actions ([HistoryScreen.tsx:113-160](../../src/renderer/screens/HistoryScreen.tsx)) —
so the only way to undo a commit and redo it (fix a typo, split it, drop a stray file, or just
recommit it as-is) is to open a terminal and run `git reset`. A non-technical user is stuck.

This feature lets the user **return an unpushed commit back into their working changes** with one
click on History. The committed work reappears as ordinary, unstaged working-tree changes on the
**Status** screen — visible, editable, and ready to be re-staged and re-committed. Two actions:
**"Return last commit"** (the top commit) and **"Return all unpushed commits"** (collapse every
commit that isn't on the remote yet into one working set). Mechanically it is a
`git reset --mixed HEAD~N` — nothing is deleted, and the original commit remains recoverable via
git's reflog.

**Product boundary (decided — "general-purpose undo, unpushed-only, mixed reset"):** this is a
neutral "undo commit" convenience, **not** a profile/identity safety fix — it has no special
coupling to profiles (the existing Commit-screen guard already runs when the user recommits, which
is enough). It **only ever touches unpushed commits**: a commit that already exists on the
remote-tracking branch is off-limits, because returning it would rewrite published history and
force a force-push — which GitWarden never does. It returns changes **unstaged** (`--mixed`, not
`--soft`/`--hard`) and does **not** expose a soft/mixed/hard choice. It never fetches, never pushes,
never touches global/system state (honors the AGENTS.md rule _"Don't change global git config —
only `--local`"_ — this feature changes no config at all).

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a claim with real
`file:line` links and the **consequence** for this feature:

1. **The "unpushed set" already has a primitive — `getCommitsAhead`.** `GitService.getCommitsAhead`
   runs `git log <remote>/<branch>..HEAD` and, on a first push where the tracking ref doesn't exist,
   **falls back to the full history** ([GitService.ts:309-321](../../src/main/services/GitService.ts)).
   **Consequence:** the "how many commits are unpushed" count reuses this exact range; and its
   no-upstream fallback is precisely why "return all unpushed" must be **disabled** when there is no
   upstream (the range is meaningless there — see finding 8 and the Decisions).

2. **No `reset` method exists anywhere.** `GitService` has `commit`
   ([GitService.ts:116-128](../../src/main/services/GitService.ts)),
   `getStatus`/`getCommitHistory`/`queryCommitLog`, `stageAll`/`unstageAll`, but nothing that moves
   `HEAD`. **Consequence:** add one narrow method, `resetMixed(repoPath, target)`, running
   `git reset --mixed <target>` with `readOnly: false` and the target as an **array element**
   (never string-interpolated into a shell — args stay an array, honoring rule #3).

3. **`HEAD~N` is the correct, divergence-safe reset target — not the upstream ref.** Resetting to
   `<remote>/<branch>` would misbehave on a _diverged_ branch (it would adopt the remote's unique
   commits into the working-tree diff). Peeling exactly `N` local commits with `HEAD~N` returns
   precisely the unpushed changes and can never move the branch pointer past the last pushed commit.
   **Consequence:** the target is `HEAD~1` for "return last" and `HEAD~<ahead>` for "return all
   unpushed", where `<ahead>` is the unpushed count from finding 1. `N` is a validated positive
   integer, so `` `HEAD~${n}` `` is safe data in the args array.

4. **`--mixed` gives the exact "changes come back unstaged" behavior.** `git reset --mixed <target>`
   moves `HEAD`, resets the index to the target, and **leaves the working tree untouched** — so the
   returned commit's content shows as unstaged modifications (and any files the commit newly added
   reappear as untracked). This is what the Status screen already renders via `getStatus`
   ([GitService.ts:60-67](../../src/main/services/GitService.ts)), which returns
   `GitStatus { files, upstream?, ahead, behind }` ([types.ts:135-141](../../src/core/types.ts)).
   **Consequence:** no new status plumbing — the returned changes surface on the existing Status UI.

5. **The clean-tree pre-check has a cheap existing primitive, and there's an exact precedent for
   refusing on a dirty tree.** The diverged-branch merge executor refuses with a plain-language
   message when `getStatus(...).files.length > 0`
   ([remediationExecutor.ts:118-130](../../src/main/ipc/remediationExecutor.ts)). **Consequence:**
   mirror it — refuse to return a commit while the working tree has changes, so the returned changes
   never intermingle with pre-existing ones and the user can actually review "what's there."

6. **Merge / root / detached-HEAD detection is a git query, not an fs peek.** A merge commit has ≥2
   parents (`git rev-list --parents -n 1 <hash>`), the root commit has no parent (`HEAD~1` doesn't
   resolve), a detached HEAD fails `git symbolic-ref -q HEAD`, and an in-progress merge/rebase is
   detectable via `git rev-parse --verify -q MERGE_HEAD` / the rebase refs. **Consequence:** the
   main layer gathers these booleans with read-only git calls through `GitRunner` (the only
   execFile caller) and the pure core decides on them — no `fs` in core (rule #1).

7. **The IPC pattern is a thin, Zod-validated `wrap(...)` per channel — copy `git:commit`, not the
   remediation model.** Every git channel parses a payload then calls the service, e.g. `git:commit`
   ([ipc-handlers.ts:314-319](../../src/main/ipc/ipc-handlers.ts)) with `GitCommitPayload`
   ([ipc-schemas.ts:65-68](../../src/main/ipc/ipc-schemas.ts)), surfaced on the preload bridge
   ([preload/index.ts:163-164](../../preload/index.ts)) and typed in `window.d.ts`
   ([window.d.ts:143](../../src/renderer/types/window.d.ts)). The `remediation:execute` channel
   ([ipc-handlers.ts:363-368](../../src/main/ipc/ipc-handlers.ts)) exists but is driven by **safety
   codes / git errors** via the `remediation.ts` model. **Consequence:** this is a **user-initiated**
   action, not a diagnosed remediation, so it gets its **own dedicated channels** shaped like the
   plain `git:*` handlers — it does **not** extend the `ExecutableAction` remediation model.

8. **The renderer needs a read channel to know what's unpushed — nothing surfaces it today.**
   `getCommitsAhead` is **not wired to any IPC channel or the preload bridge** (grep: only the
   `git:getCommitHistory` read exists, [ipc-handlers.ts:398-403](../../src/main/ipc/ipc-handlers.ts)),
   and `historyStore` loads a flat commit list with no unpushed flag
   ([historyStore.ts:1-60](../../src/renderer/store/historyStore.ts)). **Consequence:** add a
   read-only `history:getReturnState` channel that returns which/how-many commits are unpushed plus
   the eligibility booleans, so History can both **mark** unpushed commits and enable/disable the two
   actions.

9. **The inline two-step confirm is the house pattern, and it already distinguishes reversible from
   irreversible.** `StatusScreen`'s row confirm keys off `confirmKey === file.path` and styles a
   distinct red "irreversible" banner only when `extraAction?.danger === true`
   ([StatusScreen.tsx:107-113](../../src/renderer/screens/StatusScreen.tsx),
   [StatusScreen.tsx:239-254](../../src/renderer/screens/StatusScreen.tsx)); Discard (reversible)
   uses the plain confirm, `git clean` (irreversible) uses the red one, with matching `STR`
   entries ([strings.ts:153-167](../../src/renderer/strings.ts)). **Consequence:** reuse the
   **plain, non-`danger`** inline confirm — this op is reversible (changes stay in the working tree;
   the commit stays in the reflog), so it must **not** get the red irreversible banner. Copy should
   reassure.

10. **Navigation to Status after success is a one-liner.** `appStore` exposes a `NavScreen` union
    including `'status'` and `'history'` ([appStore.ts:29-35](../../src/renderer/store/appStore.ts))
    and `navigate(screen)` ([appStore.ts:54,73](../../src/renderer/store/appStore.ts)).
    **Consequence:** on success the store/screen calls `navigate('status')` so the user lands where
    the returned unstaged changes are shown; `STR.NAV_STATUS`/`STR.NAV_HISTORY` already exist
    ([strings.ts:40,44](../../src/renderer/strings.ts)).

11. **`IpcResult`'s error arm already carries structured fields, and refusals are plain strings.**
    The error arm is `{ ok: false; error: string; code?; remediation? }`
    ([window.d.ts:56](../../src/renderer/types/window.d.ts)); the merge executor returns refusals as
    `{ ok: false, message }` ([remediationExecutor.ts:120-130](../../src/main/ipc/remediationExecutor.ts)).
    **Consequence:** the return-commit executor returns a small structured result
    `{ ok, message? }` for refusals (dirty tree, root, merge, detached, no-upstream, nothing
    unpushed); a genuine git failure re-throws so `wrap()` classifies it normally.

## Scope

- **In:** a pure-core `evaluateUncommit` eligibility model; `GitService.resetMixed` +
  read-only context gathering (unpushed count, merge/root/detached/in-progress, upstream presence,
  clean tree); a small injectable `uncommitExecutor` behind two dedicated user-initiated IPC
  channels (`history:returnLastCommit`, `history:returnUnpushed`) plus a read channel
  (`history:getReturnState`); History-screen unpushed markers + the two actions with an inline
  non-destructive confirm; success → navigate to Status; all strings externalized.
- **Out / Non-goals:**
  - **No touching pushed commits** — anything on the remote-tracking branch is off-limits; no
    force-push, ever.
  - **No soft/hard reset and no mode picker** — `--mixed` only, one fixed behavior.
  - **No per-row "reset to here"** on arbitrary commits (the "returns everything after it too"
    semantic surprises non-technical users) — only the two named actions.
  - **No profile/identity coupling** — the existing Commit-screen guard covers recommitting.
  - **No returning a merge commit or the root commit**, no acting on a detached HEAD or during an
    in-progress merge/rebase/cherry-pick — each is refused with a plain message.
  - **No auto-restage and no auto-commit** — the user reviews on Status and commits with the
    existing flow.
  - **No new safety verdicts/severities** and **no global/system-state mutation.**

## The new contract (pure core)

A new pure module `src/core/history/uncommit.ts` — decision-only, no Node/DOM, fully Vitest-able:

```ts
// src/core/history/uncommit.ts
export interface UncommitContext {
  unpushedCount: number // commits in <remote>/<branch>..HEAD; when no upstream, count of local
  // commits is NOT used for "all" (see hasUpstream)
  hasUpstream: boolean // is there a remote-tracking branch to define "pushed" against?
  workingTreeClean: boolean // getStatus(...).files.length === 0
  headIsMerge: boolean // HEAD has ≥2 parents
  headIsRoot: boolean // HEAD has no parent (HEAD~1 doesn't resolve)
  rangeHasMerge: boolean // any commit in HEAD~unpushedCount..HEAD is a merge (for "all")
  inProgressOp: boolean // mid-merge/rebase/cherry-pick
  detachedHead: boolean // HEAD is not on a branch
}

export type UncommitRefusal =
  | 'nothing-unpushed'
  | 'dirty-tree'
  | 'root-commit'
  | 'merge-commit'
  | 'detached-head'
  | 'in-progress-op'
  | 'no-upstream-for-all'

export interface UncommitEligibility {
  canReturnLast: boolean
  canReturnAllUnpushed: boolean
  returnAllCount: number // = unpushedCount when canReturnAllUnpushed
  refusals: { last?: UncommitRefusal; all?: UncommitRefusal }
}

export function evaluateUncommit(ctx: UncommitContext): UncommitEligibility
```

Rules the model encodes (deterministic): a global block (`detachedHead` / `inProgressOp` / `dirty
tree` → both actions refused); `canReturnLast` needs an unpushed, non-merge, non-root HEAD;
`canReturnAllUnpushed` additionally needs `hasUpstream` and no merge in the range and
`unpushedCount ≥ 1`. Human-facing copy for each `UncommitRefusal` lives in `STR` (renderer), not in
core — the model returns the enum, the UI maps it to a string.

---

## Phase 76 — Uncommit eligibility model (pure core)

**Goal:** the deterministic contract the later phases consume — from a plain `UncommitContext`,
decide which of the two actions are allowed and why not. Logic-first; no IPC, no UI. Honors
AGENTS.md rule #1 (pure core).

**Implementation:**

- Add `src/core/history/uncommit.ts` with the `UncommitContext` / `UncommitRefusal` /
  `UncommitEligibility` types and `evaluateUncommit(ctx)` per the contract above. Pure functions
  only — no `child_process`/`fs`/electron/DOM imports.
- Encode the decision matrix: global refusals (detached HEAD, in-progress op, dirty tree) short-
  circuit both actions; `canReturnLast` requires `unpushedCount ≥ 1 && !headIsMerge && !headIsRoot`;
  `canReturnAllUnpushed` requires the same plus `hasUpstream && !rangeHasMerge`; set the matching
  `refusals.last` / `refusals.all` enum when blocked; `returnAllCount = unpushedCount`.
- Add `tests/unit/uncommit.test.ts` covering the full matrix: clean single unpushed commit → both
  allowed (all count 1); 3 unpushed → both allowed (all count 3); `unpushedCount 0` → both refused
  `nothing-unpushed`; dirty tree → both `dirty-tree`; root commit → `root-commit`; merge HEAD →
  `merge-commit`; no upstream → `last` allowed, `all` refused `no-upstream-for-all`; merge in range →
  `all` refused `merge-commit`; detached / in-progress → both refused.

**Exit criteria:** `npx tsc --noEmit` clean on both tsconfigs; `npm test` green for
`uncommit.test.ts`; `src/core/` stays pure (core-purity reviewer/hook passes); `npm run lint`
clean; no IPC/UI changes.

**Files:** new `src/core/history/uncommit.ts`, `tests/unit/uncommit.test.ts`.

---

## Phase 77 — GitService: reset + unpushed/state gathering (main)

**Goal:** the real git primitives — count unpushed commits, gather the merge/root/detached/
in-progress/upstream/clean booleans, and perform the mixed reset. Honors AGENTS.md rules #2
(GitRunner is the only executor), #3 (args arrays), #5 (no secrets logged).

**Implementation:**

- Add `GitService.getUnpushedCount(repoPath, remote, branch)` reusing the `getCommitsAhead`
  `<remote>/<branch>..HEAD` range ([GitService.ts:309-321](../../src/main/services/GitService.ts)) —
  return the count (and reuse its no-tracking-ref detection to report `hasUpstream: false`).
- Add `GitService.getUncommitContext(repoPath)` that assembles an `UncommitContext` with read-only
  (`readOnly: true`) `GitRunner` calls: `getStatus` for the clean-tree flag
  ([GitService.ts:60-67](../../src/main/services/GitService.ts)); `rev-list --parents -n 1 HEAD` for
  `headIsMerge`; `HEAD~1` resolution for `headIsRoot`; `symbolic-ref -q HEAD` for `detachedHead`;
  `rev-parse --verify -q MERGE_HEAD` (+ rebase/cherry-pick refs) for `inProgressOp`; `getUnpushedCount`
  for `unpushedCount`/`hasUpstream`; `rev-list --merges HEAD~<n>..HEAD` for `rangeHasMerge`.
- Add `GitService.resetMixed(repoPath, target)` running `['reset', '--mixed', target]`
  (`readOnly: false`, args array). Callers pass `` `HEAD~${n}` `` where `n` is a validated positive
  integer (finding 3) — never free-form user text.
- Extend the core types/service types as needed; no changes to `commit`/`push`/`pull` behavior.

**Exit criteria:** `npx tsc --noEmit` clean; **integration tests (Vitest, offline real temp repo +
a local bare repo as the "remote")**: `getUnpushedCount` correct before/after a push; a single
`resetMixed('HEAD~1')` returns the commit's content as **unstaged** changes (status shows the files,
`ahead` drops by 1); `resetMixed('HEAD~3')` collapses three unpushed commits into one unstaged set;
`getUncommitContext` reports the right booleans for merge HEAD, root commit, and no-upstream repos;
`npm test` green; `npm run lint` clean; the **safety-reviewer** subagent passes (args arrays, no
secrets logged, no global/system state). No UI.

**Files:** edit `src/main/services/GitService.ts` (+ `src/core/types.ts` if a shared type helps);
new/extended `tests/unit/git-service-uncommit.test.ts` (integration against a temp repo).

---

## Phase 78 — Return-commit executor + IPC (main + IPC)

**Goal:** the two user-initiated actions and the read channel run behind typed, Zod-validated IPC:
gather context → `evaluateUncommit` → refuse with a plain message, or compute `HEAD~N` and
`resetMixed`. Honors AGENTS.md rules #3 (args arrays), #6 (the explicit button click + inline
confirm is the confirmation; the op is reversible so no extra irreversible gate).

**Implementation:**

- Add `src/main/ipc/uncommitExecutor.ts` (mirroring the injectable, unit-testable shape of
  [remediationExecutor.ts:31-52](../../src/main/ipc/remediationExecutor.ts)) with a narrow
  `Pick<GitService, 'getUncommitContext' | 'getUnpushedCount' | 'resetMixed' | 'getRemotes'>` dep.
  It exposes: `getReturnState(deps, {repoPath, remote?, branch?})` → `{ eligibility, unpushedCount }`
  (calls `getUncommitContext` + `evaluateUncommit`); `returnLastCommit(...)` → clean-tree/eligibility
  guard then `resetMixed('HEAD~1')`; `returnUnpushed(...)` → guard then `resetMixed('HEAD~'+count)`.
  Refusals return `{ ok: false, message }` (map the `UncommitRefusal` enum to a plain string);
  a genuine git error re-throws so `wrap()` classifies it.
- Add Zod payloads in [ipc-schemas.ts](../../src/main/ipc/ipc-schemas.ts): a
  `UncommitReturnPayload = z.object({ repoPath, remote?, branch? })` and reuse `GitRepoPathPayload`
  ([ipc-schemas.ts:55](../../src/main/ipc/ipc-schemas.ts)) shape for the read.
- Register three `wrap(...)` handlers in [ipc-handlers.ts](../../src/main/ipc/ipc-handlers.ts)
  alongside the git block (copy the `git:commit` shape, [ipc-handlers.ts:314-319](../../src/main/ipc/ipc-handlers.ts)):
  `history:getReturnState`, `history:returnLastCommit`, `history:returnUnpushed`.
- Add the bridge methods in [preload/index.ts](../../preload/index.ts) (mirror
  [preload/index.ts:163-187](../../preload/index.ts)) and their types in
  [window.d.ts](../../src/renderer/types/window.d.ts) under a `history` bridge namespace.

**Exit criteria:** `npx tsc --noEmit` clean; **integration tests (Vitest, offline real temp repo +
local bare remote)**: `returnLastCommit` on a clean single-unpushed repo → `ok: true`, the commit's
files are unstaged, `getReturnState` afterward reports nothing unpushed; `returnUnpushed` with 3
ahead → one unstaged set; a **pushed** HEAD (ahead 0) → `getReturnState` disables both and the
executor refuses `nothing-unpushed` **without** resetting; dirty tree → refusal without reset; root
commit and merge HEAD → their refusals; no-upstream repo → last allowed, all refused; `npm test`
green; `npm run lint` clean; the **safety-reviewer** subagent passes. No UI.

**Files:** new `src/main/ipc/uncommitExecutor.ts`; edit `src/main/ipc/ipc-schemas.ts`,
`src/main/ipc/ipc-handlers.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`; new
`tests/unit/uncommit-executor.test.ts`.

---

## Phase 79 — History screen: markers + return actions (renderer + e2e)

**Goal:** the user returns an unpushed commit to their changes with one click on History —
feature-complete stop point.

**Implementation:**

- **`historyStore`** ([historyStore.ts:1-60](../../src/renderer/store/historyStore.ts)): after
  loading commits, call `window.api.history.getReturnState(...)` and keep `eligibility` +
  `unpushedCount` (and enough to know which top commits are unpushed) in state; add
  `returnLast()` / `returnAllUnpushed()` actions that call the bridge, and on success clear state,
  reload, and trigger navigation to Status.
- **`HistoryScreen`** ([HistoryScreen.tsx:113-160](../../src/renderer/screens/HistoryScreen.tsx)):
  render an **unpushed** marker on the commits that aren't on the remote yet; show
  **"Return last commit"** on the top commit when `eligibility.canReturnLast`, and **"Return all N
  unpushed commits"** when `eligibility.canReturnAllUnpushed && N > 1`; when an action is refused,
  show the mapped plain-language reason instead of the button. Use the **plain** inline two-step
  confirm (the non-`danger` path, [StatusScreen.tsx:107-113,239-254](../../src/renderer/screens/StatusScreen.tsx))
  with reassuring copy ("Your changes stay in your working area — nothing is deleted"). On success,
  show a brief success note and `navigate('status')` ([appStore.ts:54,73](../../src/renderer/store/appStore.ts)).
- **Strings:** externalize all new copy in [strings.ts](../../src/renderer/strings.ts) — action
  labels, the confirm prompt/confirm/cancel, the reassurance line, the success line, and one string
  per `UncommitRefusal`. No hard-coded user-facing strings. (Copy is English, consistent with the
  existing `STR` table — see the Decisions note on the Ukrainian name.)

**Exit criteria (Playwright e2e, offline fixtures + local bare remote):**

- A repo with exactly **one unpushed** commit, clean tree → History marks it unpushed and offers
  "Return last commit"; clicking → confirm → the app lands on **Status** with the commit's files
  shown as **unstaged** changes, and History no longer lists that commit as unpushed.
- A repo with **three unpushed** commits → "Return all 3 unpushed commits" collapses them into one
  unstaged working set.
- A **pushed** commit (nothing ahead) → **no** return action is offered.
- A **dirty** working tree → the action is refused with the clean-tree message (no reset happens).
- `npm test`, `npm run e2e`, `npm run lint` all green; no hard-coded user-facing strings.

**Files:** edit `src/renderer/store/historyStore.ts`, `src/renderer/screens/HistoryScreen.tsx`,
`src/renderer/strings.ts` (and `src/renderer/store/appStore.ts` only if a nav helper is added); new
`tests/e2e/uncommit.spec.ts`.

---

## Acceptance criteria (feature)

- From the History screen, a user can return an **unpushed** commit — the last one, or all unpushed
  at once — back into visible **unstaged** working changes, review/edit them on Status, and recommit
  with the existing flow, without a terminal.
- A commit that is **already on the remote** is never returned; the action is not offered for it,
  and there is no code path that force-pushes.
- The op is `git reset --mixed HEAD~N` — nothing is deleted, changes reappear unstaged, and the
  original commit stays recoverable via the reflog. No soft/hard mode is exposed.
- Returning is refused up front with a clear message on a dirty tree, a merge or root commit, a
  detached HEAD, or during an in-progress merge/rebase; no confusing raw git error.
- No global/system-state mutation; no git config changes; git args stay arrays; no secrets logged.
- Logic-first honored: Phases 76–78 ship green Vitest before the UI; Phase 79 has green Playwright.
  One commit per phase; the progress-log entry written **before** each commit; not pushed.

## Decisions (resolved)

1. **General-purpose "undo commit", not an identity fix.** No profile coupling; the existing
   Commit-screen guard covers recommitting. (Grilling Q1 = B.)
2. **`--mixed` — changes return unstaged; no mode picker.** One fixed behavior. (Q2.)
3. **Unpushed-only, hard guardrail.** A commit on the remote-tracking branch is off-limits; force-
   push never happens. Boundary computed via the `getCommitsAhead` range. (Q3.)
4. **Two named actions, target `HEAD~N`.** "Return last" = `HEAD~1`; "Return all unpushed" =
   `HEAD~<ahead>`. `HEAD~N` (not the upstream ref) keeps it correct under divergence and never
   crosses a pushed commit. No per-row "reset to here". (Q4 + grounding finding 3.)
5. **Home is the History screen**, with an unpushed marker (nothing surfaces unpushed state today).
   Actions appear only on unpushed commits. (Q5.)
6. **Refuse on a dirty tree** with a plain message, mirroring the merge executor's clean-tree pre-
   check, so returned changes never intermingle. (Q6.)
7. **Refuse root/merge commits, detached HEAD, and in-progress merge/rebase/cherry-pick;** with no
   upstream, offer only "return last". (Q7.)
8. **Inline two-step confirm, non-destructive styling** (not the red `git clean` banner); the op is
   reversible (working tree + reflog). Reassuring copy. (Q8.)
9. **No identity integration.** (Q9.)
10. **Naming:** conceptual/UA name is «Повернути коміт у зміни» / EN "Return commit to changes"; the
    in-code `STR` strings stay **English**, consistent with the existing `STR` table
    ([strings.ts](../../src/renderer/strings.ts)) — a Ukrainian UI would be a separate i18n effort,
    out of scope here. After success, navigate to **Status**. (Q10.)

## Open questions (resolve at kickoff)

- **"Return all unpushed" placement:** a header/toolbar action on History vs. an affordance on the
  oldest unpushed commit row. Lean: a small header action above the list (clearer than hanging it on
  a specific row), with "Return last commit" on the top commit row. Confirm at Phase 79 kickoff.
- **Dirty-tree refusal affordance:** message-only (proposed) vs. also linking to Status/Commit so
  the user can stash/commit first. Lean: message-only for the MVP.
