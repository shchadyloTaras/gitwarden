# Investigation — Branch-switch data freshness & switch freeze (WIP handoff)

**Status:** implemented by Phases 89–97 — all 45 findings (#1–#13, W1–W32) FIXED, none deferred.
See §Implementation status (Phases 89–97) below for the per-finding map. Original two-wave audit
(investigation only, no code changed yet) preserved below for reference.
Wave 1 (2026-07-06): renderer stores/screens → 13 deduped bugs (§Final findings below).
Wave 2 (2026-07-07): 5 subagents on uncovered surfaces (main/IPC, external-change staleness,
branch-action flows, AI panel/quick-fix, repo lifecycle) → 32 new findings (§Wave 2 below).
**Date:** 2026-07-06 / 2026-07-07 (audit) — 2026-07-07 (implementation, Phases 89–97)
**User complaint (paraphrased):** switching branches sometimes shows stale / cross-branch data
(especially the **Status** tab), and switching in the branch **select sometimes hangs / lags**.
Test repo for repro: https://github.com/shchadyloTaras/test

---

## Implementation status (Phases 89–97) — complete

All 45 findings closed; nothing deferred. Grouped by the phase that fixed each — see
`docs/progress-log.md` for the full per-phase entries (Built/Files/Tests) this summarizes.

| Phase                                                        | Findings fixed                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 89 — Stale-request guard + store load hygiene                | #1, #5, #6, #9, #12, W5, W7, W16, W19 (renderer half)                                         |
| 90 — `currentBranch` single ownership + repo/profile hygiene | #4, #10 (mitigated — see note), #11, W14, W18, W19 (main half — `JsonStore.update`), W30, W32 |
| 91 — Verified-target compound writes                         | #2, W1, W8, W9, W10, W21, W26, W29                                                            |
| 92 — Branch-state truth + safe delete                        | #7, W6, W13, W20, W27                                                                         |
| 93 — Switch UX (non-reentrant picker, stash quick-fix)       | #3, #13, W3, W17                                                                              |
| 94 — AI actions pinned to their origin                       | W2, W11, W15                                                                                  |
| 95 — Focus revalidation + refresh wiring                     | W4 (cheap layer), W12, W25, W28                                                               |
| 96 — `.git` watcher                                          | W4 (full — supersedes the cheap layer as the primary path)                                    |
| 97 — Polish + regression sweep                               | W22, W24, W31                                                                                 |

**Note on #10 ("double-load"):** Phase 90 eliminated the dominant real-world case — a same-repo
metadata save re-triggering a full branch/guard reload (`setActiveRepo`'s value-equal bail, W30).
A genuine _different_-repo switch still transiently nulls `currentBranch` before branchStore
re-derives it; this is correct, not a bug — the old repo's branch name is never fabricated as the
new repo's, and no store keys an effect on `currentBranch` in a way that fires an extra git read
because of it. Marked mitigated, not "unfixed," because the audit's specific claim (doubled git
work) doesn't reproduce against the current code.

**Verification:** every phase's exit criteria required `npx tsc --noEmit` (both tsconfigs) clean,
`npm test` green, `npm run lint` clean; UI phases additionally required a green Playwright run.
Phase 97's own regression sweep re-ran the full Vitest + Playwright suites end-to-end against this
finished state (see the Phase 97 progress-log entry for the exact counts).

---

## Root cause (confirmed by reading the code)

Three things line up so that a branch's data can be stale and switching can feel frozen:

1. **Read-only git ops run concurrently and unordered.**
   `GitRunner.run()` does `inv.readOnly ? execute() : this.enqueue(inv.cwd, execute)`
   — only **writes** are serialized per repo; **reads run immediately, with no ordering**
   relative to each other or to writes.
   `src/main/git/GitRunner.ts:33-40`, `:131-138`
   Read-only (concurrent) in `src/main/services/GitService.ts`: `getStatus`, `getBranches`,
   `getDiff`, `getCommitHistory`, `getEffectiveIdentity`, `getRemotes`.
   Reads pass **no `timeoutMs`**, so a read has no deadline.

2. **Only `headerGuardStore` drops stale results.** It uses a monotonic `reqId` and its own
   comment says "a slow getEffectiveIdentity for repo A must not land after a newer refresh for
   repo B and overwrite it." **Every other data store has no such guard** — the last `set()`
   wins regardless of which branch/repo it belonged to.
   Guard: `src/renderer/store/headerGuardStore.ts:31,40,53,75`
   No guard: `statusStore.ts`, `branchStore.ts`, `commitStore.ts`, `remoteStore.ts`,
   `historyStore.ts`, `safetyCenterStore.ts`.

3. **Branch switching is fire-and-forget with no debounce/cancel.**
   Header picker: `onChange={(name) => void doSwitch(name)}` (`GlobalHeader.tsx:190`).
   `Dropdown.choose()` calls `onChange` synchronously and closes (`Dropdown.tsx:244-248`).
   `doSwitch` (`branchStore.ts:60`) awaits `switchBranch` (serialized write) → optimistic
   `setCurrentBranch` → `refreshBranches`. Rapid clicks queue **multiple full working-tree
   checkouts**; the picker `value={currentBranch}` only advances as each completes, so it lags
   behind the clicks and feels frozen. No superseded-switch is cancelled.

---

## How the app reacts to a branch change (verified)

Screens reload via `useEffect` deps:

- `StatusScreen` `[activeRepo, currentBranch, loadStatus]` — reloads; also resets
  `selectedFile`/`diff`. **Diff effect deps `[activeRepo, selectedFile, diffMode]` omit
  `currentBranch`** (`StatusScreen.tsx:514-539`).
- `HistoryScreen` `[activeRepo, currentBranch, load]` (`:100-102`)
- `CommitScreen` `[load, activeRepo, currentBranch]` (`:40-42`)
- `RemoteScreen` `[load, activeRepo, currentBranch]` (`:53-55`)
- `SafetyCenterScreen` `[activeRepo, liveCurrentBranch, activeProfile_, load, profiles]` (`:106-108`)
- `BranchesScreen` `[activeRepo, load]` — **omits `currentBranch`** but shares `useBranchStore`
  with the header (`:75-77`).

`appStore.currentBranch` has **multiple writers** (a consistency hazard):
`branchStore.load` (from `isCurrent`), `branchStore.doSwitch/doCreate` (optimistic),
`remoteStore.load` (from `getStatus.branch`, `remoteStore.ts:96`), `remoteStore.doPull`.
`setActiveRepo` nulls `currentBranch` only when the repo id changes (`appStore.ts:74-89`).

Header effects: `loadBranches` on `[activeRepo]`; `refreshGuard` on
`[activeRepo, activeProfile, profiles]` (not `currentBranch`) — `GlobalHeader.tsx:82-98`.

---

## Final findings (deduped & ranked)

The audit workflow produced ~39 raw findings across all tabs; 19 passed adversarial verification
before the org monthly spend limit halted the remaining verifiers + the synthesis step. Below is
the deduped, ranked synthesis (mine, folding in the workflow's calibration).

**Calibration — read this first.** A _single deliberate_ switch (click one branch, let it settle)
is largely **safe**: `doSwitch` (`branchStore.ts:65`) `await`s the `git switch` _write_ before the
optimistic `setCurrentBranch` fires the reload, so only one read is in flight and it reads the
already-checked-out branch. The races below bite on **rapid/overlapping switches, fast repo hops,
or a large repo under I/O load** — i.e. exactly the user's "інколи" (sometimes). Also: `git switch`
keeps the **index**, so _staged_ files often look identical across branches; the visibly-wrong data
is the **branch name, ahead/behind, commit history, per-branch changed files, and safety verdict**.

| #   | Tab / Area                                     | What the user sees                                                                                                                                                                   | How often                            | Severity       |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | -------------- |
| 1   | All tabs (Status/Commit/Remote/History/Safety) | After a fast switch, the tab shows the **previous branch's** data; `currentBranch` itself can be pinned to the wrong branch                                                          | Easy to hit (fast clicks / big repo) | **High**       |
| 2   | Remote (pull), Commit                          | A **write acts on the wrong branch**: pull `--ff-only` merges into whatever HEAD git is on now (not the branch named at click), commit clears the box + commits on whatever's active | Rare timing, but data-affecting      | **High**       |
| 3   | Branch picker (global)                         | Switching **hangs/lags**: rapid clicks queue N full serialized checkouts (working tree churns through every intermediate branch) + a fan-out of concurrent reads saturates git       | Easy to hit                          | **High**       |
| 4   | Header / Inspector                             | Header + Inspector show a branch that **isn't the checked-out one**; can stay pinned to a **deleted/renamed** branch                                                                 | Common race                          | Medium         |
| 5   | Commit (AI draft)                              | "Draft with AI" message written on branch X **appears on branch Y** of the same repo                                                                                                 | Every time (by design flaw)          | Medium         |
| 6   | History                                        | `loadMore()` appends the **other branch's commits** onto the list (mixed history); unpushed markers/return panel label the wrong commits                                             | Scroll-then-switch                   | Medium         |
| 7   | Remote / any                                   | Reads have **no timeout** → a hung/lock-contended git leaves the tab stuck on "Loading…" with no recovery but manual refresh                                                         | Rare                                 | Medium         |
| 8   | Branches                                       | The **current-branch marker** goes stale after a pull/remote refresh (tab doesn't reload on `currentBranch`, shares store but nobody updates `branches`)                             | Deterministic after pull             | Low–Med        |
| 9   | Remote                                         | ahead/behind (**upstream**) shows the old branch's basis briefly (load() resets remotes/identity but **not** `upstream`)                                                             | Common but brief                     | Low            |
| 10  | Repo switch (all)                              | `setActiveRepo` nulls `currentBranch` → branch-scoped tabs **load twice** per repo switch (once branch=null, once re-derived) — doubled git work + a stale-set race                  | Deterministic (perf)                 | Low            |
| 11  | App shell                                      | Auto-select-repo effect (`App.tsx:370-376`) can **fight the header repo picker** if the `repos` array identity changes                                                               | Rare                                 | Low            |
| 12  | Status                                         | `loading` is a shared boolean not owned by a request → brief inconsistent "(status set, still loading)" or a stuck flag when two `loadStatus` interleave                             | Rare                                 | Low            |
| 13  | Branch picker                                  | Superseded switch **success/error toasts interleave** — wrong branch name or a spurious error flashes                                                                                | Common race                          | Low (cosmetic) |

### Detail + anchors

- **#1 Stale-read last-write-wins (the core bug).** No store except `headerGuardStore` drops a
  superseded result; reads are unordered. A slow read for the old branch/repo `set()`s last.
  `statusStore.ts:23-37`, `commitStore.ts:70-109`, `remoteStore.ts:63-102`, `historyStore.ts:44-74`,
  `branchStore.ts:45-58`, `safetyCenterStore.ts:45-116`; unordered reads `GitRunner.ts:39`.
  `branchStore.load` also `setCurrentBranch(A's current)`, so a stale repo-A load repaints repo B's
  picker with A's branches → picking one runs `switchBranch` on B with a name that may not exist.
- **#2 Wrong-branch writes.** Pull passes a captured `branch` but `git pull --ff-only` integrates
  into _current HEAD_; if a switch interleaves it merges into the wrong branch (`remoteStore.doPull`
  `remoteStore.ts:119-154`, `RemoteScreen.tsx`). `doCommit` clears the message + commits against
  whatever repo/branch is active when it resolves (`commitStore.ts:132-147`). `stage/unstage/
discard/clean` post-op reload writes another branch's status if a switch interleaves
  (`statusStore.ts:39-69`, `StatusScreen.tsx:550-567`).
- **#3 Freeze/lag.** Fire-and-forget `void doSwitch(name)` (`GlobalHeader.tsx:190`), no debounce/
  cancel; serialized checkouts queue (`branchStore.ts:60-75`, `GitRunner.ts:131-138`); unserialized
  reads fan out per switch (`GitRunner.ts:39`) with no `timeoutMs`.
- **#4 currentBranch multi-writer.** 5 uncoordinated writers (`branchStore.load/doSwitch/doCreate`,
  `remoteStore.load/doPull`); Inspector reads it verbatim (`Inspector.tsx:28,93-95`); nothing clears
  it when the branch disappears (`appStore.ts:90`).
- **#5 AI draft keyed by repo, not branch** (`commitStore.ts:43,75,86,152-170`) — verified
  deterministic.
- **#6 History mixing** (`historyStore.ts:76-92` `loadMore` uses `commits.length` as skip;
  `unpushedCount` staleness).
- **#7 No read timeout** (`GitRunner.ts:81-83` only fires if `timeoutMs` passed; no store passes it).
- **#8 Branches marker stale** (`BranchesScreen.tsx:75-77` deps omit `currentBranch`;
  `branchStore.branches` not refreshed by other stores' `setCurrentBranch`).
- **#9 upstream not reset** (`remoteStore.ts:63-73` resets `remotes`/`identity` but not `upstream`).
- **#10 double-load** (`appStore.ts:85` null-reset + header re-derive).

Note: the finder-flagged "diff panel shows the previous branch's diff" is **likely mitigated** —
the Status load effect resets `selectedFile`/`diff` to null on `currentBranch` change
(`StatusScreen.tsx:514-520`), so the diff clears rather than showing stale content. Left as low /
monitor.

---

## Wave 2 (2026-07-07) — 32 new findings from 5 subagents on uncovered surfaces

Numbered W1–W32, ranked. "Det" = deterministic (happens every time).

| #       | Area                 | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | How often                                          | Severity                    |
| ------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| W1      | Uncommit             | **"Return last/all unpushed" can `reset --mixed` the WRONG branch** — eligibility is an unordered read, the reset queues _behind_ an in-flight switch, so it rewinds the destination branch, possibly past pushed commits                                                                                                                                                                                                                                                     | Rare race (widened by queued checkouts, wave-1 #3) | **Critical**                |
| W2      | AI chat Apply        | **"Apply" writes AI file edits into whichever REPO is active at click** — proposal stores no repo id; also never checks `before` vs disk (cross-BRANCH clobber) and bypasses the git write queue                                                                                                                                                                                                                                                                              | Det (switch repo, click)                           | **High**                    |
| W3      | Header picker        | **Failed `git switch` from the header is completely silent** (error only renders on Branches tab; its `load()` then wipes it). User thinks they switched; commits land on the old branch                                                                                                                                                                                                                                                                                      | Det on any switch failure (dirty tree = routine)   | **High**                    |
| W4      | Whole app            | **No external-change detection at all** — no fs-watcher, no focus/visibility revalidation, no polling. Terminal `git switch/commit/branch` is invisible; tabs heal only by remount; **header picker/guard/Inspector never heal** (always mounted)                                                                                                                                                                                                                             | Det once it happens                                | **High**                    |
| W5      | Branches tab         | **Armed "Delete?/Merge?" confirm survives repo switches** — with a same-named branch (main/develop…) in repo B the confirm renders pre-armed; one click deletes/merges the wrong repo's branch                                                                                                                                                                                                                                                                                | Det given name collision                           | **High**                    |
| W6      | Branches/Git         | **Delete uses `git branch -D`** (force) — unmerged commits vanish behind the same lightweight confirm; plan mandates `-d` + escalated force-confirm                                                                                                                                                                                                                                                                                                                           | Det                                                | **High**                    |
| W7      | Status               | **statusStore never clears `status` on load** — old repo's file list stays visible AND clickable during a repo switch; stage/discard on a stale row hits the NEW repo with the OLD path (`README.md` collisions ⇒ destructive discard of the wrong file)                                                                                                                                                                                                                      | Display det; wrong write = race                    | **High**                    |
| W8      | Merge (all channels) | **Local merge, `merge-remote-into-local` quick-fix, and create-branch act on live HEAD at queue-execution time** — IPC never carries the target; clean-tree pre-check is an unordered read (TOCTOU). Extends wave-1 #2 beyond pull                                                                                                                                                                                                                                            | Rare race (real via queued checkouts)              | **High**                    |
| W9      | Push auth            | **Push can run with the wrong credential isolation** — auth resolved from a remotes read that can be stale vs a queued `set-url` after profile reassignment                                                                                                                                                                                                                                                                                                                   | Rare race                                          | **High** (identity promise) |
| W10     | Push `-u`            | `-u` decision reads HEAD's upstream, not the pushed branch's — first push may never set tracking ⇒ "unpushed" counts wrong ⇒ weakens uncommit safety                                                                                                                                                                                                                                                                                                                          | Race; det when branch state stale                  | Med-High                    |
| W11     | Commit draft card    | Chat "Insert" drops the AI commit message into whatever repo is active at click, bypassing `draftsByRepo`'s own cross-repo guard                                                                                                                                                                                                                                                                                                                                              | Det                                                | Med-High                    |
| W12     | Header/Guard         | Guard badge and Safety Center can **contradict each other on screen** after external change (screen remounts recompute; badge never does)                                                                                                                                                                                                                                                                                                                                     | External change                                    | Med-High                    |
| W13     | Fresh repo           | **Unborn branch (fresh init) invisible to `getBranches`** — picker/Branches show no branch while Status says `main`; detached HEAD marks nothing current                                                                                                                                                                                                                                                                                                                      | Det for every init                                 | Medium                      |
| W14     | Header picker        | Re-selecting the **same repo is a silent no-op** — the intuitive "refresh" gesture does nothing (object identity unchanged, no effect re-fires)                                                                                                                                                                                                                                                                                                                               | Det                                                | Medium                      |
| W15     | Chat Apply           | After Apply succeeds, **Status/Commit next to the chat don't refresh** — looks exactly like "stale tab"                                                                                                                                                                                                                                                                                                                                                                       | Det                                                | Medium                      |
| W16     | Branches tab         | Merge-conflict banner from repo A **persists on repo B** (nothing clears `mergeConflict`; its "Go to Status" then dead-ends)                                                                                                                                                                                                                                                                                                                                                  | Det after conflict + switch                        | Medium                      |
| W17     | Dropdown             | Keyboard highlight is a raw index — options refreshing while popup open makes **Enter check out the neighbor branch**                                                                                                                                                                                                                                                                                                                                                         | Rare race                                          | Medium                      |
| W18     | Startup              | Profile-to-repo sync races store loading — whether launch switches to `repos[0]`'s profile depends on which IPC wins; guard may show Review unprovoked                                                                                                                                                                                                                                                                                                                        | Common race per launch                             | Medium                      |
| W19     | Profiles             | Rapid repo hops fire unguarded concurrent `setActiveProfile` writes — last-_resolved_ wins; JsonStore RMW can drop a concurrent settings edit                                                                                                                                                                                                                                                                                                                                 | Rare race                                          | Medium                      |
| W20     | Remote               | "Upstream gone" (remote branch deleted) renders as **in sync (0/0)** — porcelain omits `branch.ab`, parser keeps defaults                                                                                                                                                                                                                                                                                                                                                     | Det in that state                                  | Low-Med                     |
| W21     | Remediation          | Retry-push banner: push failures don't pin `remote`/`branch` (violating the field's own contract) — fix button rebinds to the live branch in a paint window                                                                                                                                                                                                                                                                                                                   | Rare race                                          | Low-Med                     |
| W22     | Worktrees            | Deleted-in-Finder worktree keeps the branch badged "In worktree" forever — Switch/Delete hidden, no prune affordance in-app                                                                                                                                                                                                                                                                                                                                                   | Common for worktree users                          | Low-Med                     |
| W23     | Commit               | Typed commit message is one **global** field — follows you across repos; initialize-repo lands on Commit with the old repo's text                                                                                                                                                                                                                                                                                                                                             | Det                                                | Low-Med                     |
| W24     | Connect flow         | Cancel racing the OAuth return-poke: main persists the link, renderer drops the event — profile shows unlinked until a full reload                                                                                                                                                                                                                                                                                                                                            | Rare race                                          | Low-Med                     |
| W25     | Remote               | `doFetch` refreshes **nothing** — Fetch's only observable effect is the toast                                                                                                                                                                                                                                                                                                                                                                                                 | Det                                                | Low-Med                     |
| W26–W32 | Grouped low          | Commit-hash toast can show another branch's HEAD (`commit`+`rev-parse` not atomic) · `deleteBranch` exists-check TOCTOU → false "Deleted" success · `getCommitsAhead` catch-all shows whole history as unpushed · same-repo metadata save re-fires all `[activeRepo]` effects (picker flicker, doubled Safety load) · create-branch failure wipes the typed name · update check once per launch · `repositories.list` failure → `repos:[]` → activeRepo nulled then re-picked | Mixed                                              | Low                         |

Full per-finding details (symptom/root cause/file:line/fix) are in the five wave-2 agent reports;
key anchors: W1 `src/main/ipc/uncommitExecutor.ts:50-72` + `GitService.ts:532-578` · W2
`aiChatStore.ts:172-181` + `AgenticActionExecutor.ts:14-33` (schema has `before`, nothing reads it)
· W3 `GlobalHeader.tsx:70,190` + `branchStore.ts:72-74` (error rendered only by BranchesScreen) ·
W4 zero watcher/focus/poll hits in `src/`, `preload/`, `electron/`; only Status has a Refresh
button · W5 `branchStore.ts:46` (load doesn't reset confirms), `BranchesScreen.tsx:352-422` · W6
`GitService.ts:373-386` vs plan `docs/plans/gitwarden-plan.md:580` · W7 `statusStore.ts:23-37` ·
W8 `gitMergeHandler.ts:15-25`, `remediationExecutor.ts:118-148`, `GitService.ts:285-302` · W9
`ipc-handlers.ts:902-916` + `remoteReconcile.ts:74-84` · W13 `GitService.ts:330-363`,
`PorcelainParser.ts:41-43` · W18 `App.tsx:291-300,370-376`, `appStore.ts:18-27`.

**Clean (checked, no issue):** preload bridge (stateless pass-through) · gitInitializeHandler ·
no main-process caches · Inspector does no git reads of its own · chat streaming state lives in
the store (nothing strands on unmount) · non-active repo removal never re-picks `repos[0]`.

## Recommended fixes (grouped by root cause — one fix kills the most)

- **A. Add a `headerGuardStore`-style stale-result guard to every data store** ← _biggest win._
  (status/branch/commit/remote/history/safety). Capture a monotonic `reqId` (and/or
  `repoPath`+expected branch) at the top of each `load`, and **drop the result if superseded**
  before `set()`. Neutralizes **#1**, the stale-set halves of **#2/#4/#8/#9**, and **#6, #12, #13**.
  Put it in one shared helper so stores can't diverge.
- **B. Make branch switching non-reentrant.** Disable the branch picker (or ignore clicks) while a
  switch is in flight, and/or debounce + cancel superseded switches so N clicks ≠ N checkouts.
  Fixes **#3**, removes the interleave that enables **#2**. (`AbortSignal` is already plumbed through
  `GitInvocation`/`GitRunner`.)
- **C. Verify HEAD inside the serialized write, for EVERY write channel.** Extend beyond pull/commit
  to: local merge + `merge-remote-into-local` remediation (pass `expectedTargetBranch` through IPC,
  check `symbolic-ref --short HEAD` inside the enqueued job, refuse on mismatch), **uncommit**
  (run read-eligibility + `reset --mixed` as ONE enqueued compound job — W1 is the critical one),
  push `-u` (query the _named_ branch's upstream: `rev-parse ${branch}@{u}` — W10), push auth
  (re-read remote URL inside the write, or always pass credential isolation — W9), create-branch
  base, retry-push pinning (`doRemotePush` populates `remote`/`branch` in `lastFailure` — W21).
  Fixes **#2, W1, W8, W9, W10, W21, W26, W27**.
- **D. Single source of truth for `currentBranch`.** Derive it from the branch list's `isCurrent`
  (or one owner) instead of 5 concurrent writers, and clear it when the branch disappears.
  Fixes **#4**, **#8**.
- **E. Small per-bug fixes:** give store reads a `timeoutMs` + a recovery affordance (**#7**);
  key the AI draft by repo **and branch** (**#5**); reset `upstream` at the top of `remoteStore.load`
  (**#9**); collapse the `setActiveRepo` double-load (**#10**); stabilize the `App.tsx` auto-select
  effect against `repos` identity churn (**#11**, **W32**).
- **F. External-change refresh (W4, W12, W14, W25 — likely the biggest share of the complaint).**
  Cheapest first: revalidate the active repo's stores on window `focus`/`visibilitychange`
  (pattern already exists in `ConnectGitHubModal.tsx:145`); make same-repo re-select an explicit
  refresh; have Safety Center's load also refresh `headerGuardStore`; `doFetch`/chat-Apply nudge
  the relevant stores (**W15**). Better later: main-process `fs.watch` on `.git/HEAD` + `.git/refs`
  → push event → stores reload.
- **G. Stamp AI actions with their origin (W2, W11).** Put `repositoryId` (+ branch, + `before`
  content hashes) on proposals and chat blocks at generation time; at click, refuse or relabel when
  it differs from `activeRepo`; `AgenticActionExecutor` verifies `edit.before` against disk before
  each write (schema already carries `before` — nothing reads it).
- **H. Branch-action hygiene (W3, W5, W6, W13, W16, W17).** Surface `doSwitch` errors globally
  (header inline/toast — W3); reset `deleteConfirmBranch`/`mergeConfirmBranch`/`mergeConflict` in
  `branchStore.load()` and scope confirms to `(repoPath, branch)` (W5, W16); switch delete to
  `-d` with an escalated force-confirm path (W6); synthesize the unborn/detached current branch in
  `getBranches` (W13); key Dropdown highlight by option value (W17).

**Suggested implementation order:** A (kills the most, mechanical) → H:W3 + F (the two
user-visible complaint drivers) → C:W1 (critical uncommit) + G:W2 (deterministic AI clobber) →
B → rest of C/H → D → E.

---

## Resume the verification workflow

Script (self-contained, re-runnable): the audit fans out one finder per tab → adversarial
verify each finding → synthesize a ranked report with file:line + repro.

```
Workflow({ scriptPath: "/Users/tarasshchadylo/.claude/projects/-Users-tarasshchadylo-Documents-agents-project-git-visual/b64b80d6-3193-4601-9bdf-59448324b622/workflows/scripts/branch-switch-freshness-audit-wf_f6758265-caf.js" })
```

Same-session resume (reuses completed agents): add
`resumeFromRunId: "wf_f6758265-caf"`. Across sessions the cache is gone — just re-run the script.

Surfaces the workflow covers: status, commit, remote, history, branches+header picker,
safety-center, appStore-currentBranch, cross-cutting freeze. Each finding is verified
CONFIRMED / PLAUSIBLE / REFUTED against the real serialization + effect-deps behavior.
