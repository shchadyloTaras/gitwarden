# Plan — Branch-Switch Data Integrity: every tab shows the branch you're actually on, and every write lands where you aimed it

**Status:** ⬜ not started — Phases 89–97 — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 89 → 97.
**Feature-complete stop point:** Phase 97.
**Prompts:** [`docs/prompts/branch-switch-integrity-prompts.md`](../prompts/branch-switch-integrity-prompts.md).
**Source audit:** [`docs/investigations/branch-switch-freshness-audit.md`](../investigations/branch-switch-freshness-audit.md)
— a two-wave audit (13 + 32 findings, IDs `#1–#13` and `W1–W32`) that this track implements in full.

## Goal

Today, switching branches (or repos) sometimes shows another branch's data in the Status, Commit,
Remote, History and Safety Center tabs; a failed switch from the header is completely silent; a
handful of write operations (uncommit, merge, AI Apply) can land on a branch or repo the user never
aimed at; and anything done outside the app (a terminal `git switch`/`commit`) is invisible until
the user happens to remount a tab — the always-mounted header never heals at all.

This track makes branch/repo state trustworthy end-to-end: **(1)** every data store drops
superseded responses instead of painting them; **(2)** `currentBranch` gets a single owner;
**(3)** every history-changing write verifies — inside the serialized git queue — that HEAD is
still the branch the user saw when they clicked; **(4)** switching becomes non-reentrant, failures
become visible, and a "bring changes & switch" quick-fix handles the routine dirty-tree case;
**(5)** AI-generated actions are pinned to the repo/branch they were generated for; **(6)** the
app revalidates on window focus and (Phase 96) watches `.git` so external changes appear within
a second.

**Product boundary (decided — full scope):** all 45 audit findings are in scope, including the
full `.git` watcher and the stash-based switch quick-fix. The track does **not** auto-resolve
merge or stash-pop conflicts (they always route to the existing resolve-conflicts → Status flow),
does **not** poll or fetch remotes in the background (the watcher observes local `.git` state
only), and does **not** change the AI chat's deliberate cross-repo persistence — only the
_actions_ launched from chat get pinned.

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a claim with real
`file:line` links and the **consequence** for this track:

1. **Read-only git ops bypass the per-repo write queue.** `GitRunner.run` executes
   `inv.readOnly ? execute() : this.enqueue(inv.cwd, execute)`
   ([GitRunner.ts:33-40](../../src/main/git/GitRunner.ts)); only writes are FIFO-serialized
   ([GitRunner.ts:131-138](../../src/main/git/GitRunner.ts)). Reads carry no timeout unless
   `timeoutMs` is passed ([GitRunner.ts:81-83](../../src/main/git/GitRunner.ts)). **Consequence:**
   two overlapping loads can resolve out of order (Phase 89 guards the renderer), and a read taken
   before a queued write is stale by the time the write runs (Phase 91 moves read+decide+write
   into one enqueued job).

2. **Exactly one store already solves the stale-result problem — copy it.** `headerGuardStore`
   keeps a monotonic `reqId` and drops superseded results
   ([headerGuardStore.ts:31-53](../../src/renderer/store/headerGuardStore.ts)); none of
   `statusStore` ([statusStore.ts:23-37](../../src/renderer/store/statusStore.ts)), `branchStore`
   ([branchStore.ts:45-58](../../src/renderer/store/branchStore.ts)), `commitStore`
   ([commitStore.ts:70-111](../../src/renderer/store/commitStore.ts)), `remoteStore`
   ([remoteStore.ts:63-102](../../src/renderer/store/remoteStore.ts)), `historyStore`
   ([historyStore.ts:44-92](../../src/renderer/store/historyStore.ts)) has one — the last `set()`
   wins regardless of which branch/repo it served. **Consequence:** Phase 89 extracts the pattern
   into a pure-core helper and applies it to all six data stores.

3. **`statusStore` never resets its payload at load start** (unlike its siblings): `loadStatus`
   sets `loading/error/repoPath` but leaves the previous repo's `status` rendered and clickable
   ([statusStore.ts:23-37](../../src/renderer/store/statusStore.ts)); StatusScreen's
   discard/clean act on `activeRepo.localPath` + the stale row's path
   ([StatusScreen.tsx:550-568](../../src/renderer/screens/StatusScreen.tsx)). `remoteStore.load`
   resets `remotes`/`identity` but **not `upstream`**
   ([remoteStore.ts:63-73](../../src/renderer/store/remoteStore.ts)). `branchStore.load` resets
   messages but **not** `deleteConfirmBranch`/`mergeConfirmBranch`/`mergeConflict`
   ([branchStore.ts:45-58](../../src/renderer/store/branchStore.ts) vs
   [branchStore.ts:139-162](../../src/renderer/store/branchStore.ts)) — an armed destructive
   confirm survives a repo switch (audit W5). **Consequence:** Phase 89's load hygiene closes
   W7, #9, W5, W16 in the same pass as the request guard.

4. **`appStore.currentBranch` has five uncoordinated writers:** `branchStore.load` (from
   `isCurrent`, [branchStore.ts:51-52](../../src/renderer/store/branchStore.ts)), optimistic sets
   in `doSwitch`/`doCreate` ([branchStore.ts:67](../../src/renderer/store/branchStore.ts),
   [branchStore.ts:84](../../src/renderer/store/branchStore.ts)), and `remoteStore.load`/`doPull`
   from `getStatus.branch` ([remoteStore.ts:96](../../src/renderer/store/remoteStore.ts),
   [remoteStore.ts:142-146](../../src/renderer/store/remoteStore.ts)). **Consequence:** Phase 90
   makes `branchStore` the sole writer; everyone else reconciles through it.

5. **History-changing writes trust an implicit "current HEAD".** The merge IPC payload carries
   only the _source_ branch ([ipc-schemas.ts:94-97](../../src/main/ipc/ipc-schemas.ts));
   `runGitMerge` pre-checks a concurrent read then queues the write
   ([gitMergeHandler.ts:15-25](../../src/main/ipc/gitMergeHandler.ts));
   `mergeBranch` merges into whatever HEAD is by then
   ([GitService.ts:285-292](../../src/main/services/GitService.ts)), and the
   `merge-remote-into-local` remediation has the same shape
   ([remediationExecutor.ts:118-148](../../src/main/ipc/remediationExecutor.ts)). The uncommit
   executor re-reads eligibility (unordered read) then queues `reset --mixed`
   ([uncommitExecutor.ts:50-72](../../src/main/ipc/uncommitExecutor.ts),
   [GitService.ts:572-578](../../src/main/services/GitService.ts)) — audit **W1 (critical)**.
   `push` decides `-u` from **HEAD's** upstream, not the pushed branch's
   ([GitService.ts:251-274](../../src/main/services/GitService.ts)), and the retry-push banner's
   failure record omits `remote`/`branch` on push failures
   ([remoteStore.ts:156-178](../../src/renderer/store/remoteStore.ts)). **Consequence:** Phase 91
   adds a compound-job API to GitRunner and an in-queue HEAD verification to every such write.

6. **Branch deletion is force-delete with a TOCTOU pre-check.** `deleteBranch` lists refs
   (read), silently no-ops if absent, then runs `branch -D`
   ([GitService.ts:373-386](../../src/main/services/GitService.ts)) — unmerged commits vanish
   behind the same lightweight confirm as a merged branch, violating AGENTS.md's "irreversible
   ones get a distinct stronger warning". **Consequence:** Phase 92 switches to `-d`, maps git's
   "not fully merged" refusal to a new error code, and adds an escalated force-confirm path.

7. **Unborn/detached/upstream-gone states are unrepresented.** `getBranches` enumerates
   `refs/heads` only, so a fresh-init repo (unborn HEAD) has no branches and nothing `isCurrent`
   ([GitService.ts:330-363](../../src/main/services/GitService.ts)) while porcelain still reports
   `branch.head` ([PorcelainParser.ts:41-43](../../src/core/parsers/PorcelainParser.ts));
   `branchStore.load` then never updates `currentBranch`
   ([branchStore.ts:51-52](../../src/renderer/store/branchStore.ts)). A gone upstream keeps the
   defaults `ahead = 0, behind = 0` because `branch.ab` is simply absent
   ([PorcelainParser.ts:44-51](../../src/core/parsers/PorcelainParser.ts)). **Consequence:**
   Phase 92 synthesizes the unborn current branch, adds `detached`/`upstreamGone` to the model,
   and renders them honestly.

8. **A failed header switch renders nowhere.** The header wires
   `onChange={(name) => void doSwitch(name)}`
   ([GlobalHeader.tsx:190](../../src/renderer/components/GlobalHeader.tsx)); `doSwitch` writes
   failures only to `branchStore.error`
   ([branchStore.ts:72-74](../../src/renderer/store/branchStore.ts)), which only BranchesScreen
   renders — and `load()` clears it on mount. There is no in-flight lock, so rapid picks queue
   N full checkouts (perceived freeze). The Dropdown's keyboard highlight is a raw index that is
   not remapped when options refresh while open
   ([Dropdown.tsx:161](../../src/renderer/components/Dropdown.tsx),
   [Dropdown.tsx:250-264](../../src/renderer/components/Dropdown.tsx)). **Consequence:** Phase 93
   makes switching non-reentrant, surfaces the error next to the picker, adds the stash quick-fix,
   and keys the highlight by option value.

9. **AI actions resolve their target at click time.** `applyProposal` takes
   `useAppStore.getState().activeRepo.id` when clicked
   ([aiChatStore.ts:172-181](../../src/renderer/store/aiChatStore.ts));
   the executor `fs.writeFile`s `edit.after` without comparing `edit.before` to disk and outside
   the git write queue ([AgenticActionExecutor.ts:14-33](../../src/main/ai/AgenticActionExecutor.ts))
   even though the payload already carries `before`
   ([ipc-schemas.ts:338-347](../../src/main/ipc/ipc-schemas.ts)); the commit-draft card's Insert
   calls the repo-agnostic `setMessage` directly
   ([CommitDraftCard.tsx:60-63](../../src/renderer/components/chatBlocks/CommitDraftCard.tsx),
   [commitStore.ts:113-116](../../src/renderer/store/commitStore.ts)), bypassing the per-repo
   draft stash that exists precisely to prevent wrong-repo delivery
   ([commitStore.ts:43](../../src/renderer/store/commitStore.ts)). **Consequence:** Phase 94
   stamps origin repo+branch on proposals/blocks and verifies `before` (and the queue) at execute.

10. **There are no refresh triggers besides React effect deps.** The wave-2 sweep found zero
    fs-watchers, zero polling, zero focus/visibility revalidation anywhere in `src/`, `preload/`,
    `electron/`; the only manual Refresh button is on Status
    ([StatusScreen.tsx:608-623](../../src/renderer/screens/StatusScreen.tsx)); `doFetch`'s only
    observable effect is a toast ([remoteStore.ts:104-117](../../src/renderer/store/remoteStore.ts));
    and re-selecting the same repo is identity-equal, so nothing re-fires
    ([appStore.ts:74-89](../../src/renderer/store/appStore.ts)). **Consequence:** Phase 95 adds
    focus revalidation + a shared refresh helper; Phase 96 adds the `.git` watcher.

11. **Startup and profile sync race each other.** `App` fires `load()/loadRepos()/loadSettings()`
    concurrently ([App.tsx:291-300](../../src/renderer/App.tsx)); auto-select runs as soon as
    `repos` lands ([App.tsx:370-376](../../src/renderer/App.tsx)); `syncProfileToRepo` silently
    no-ops while `profiles` is still empty ([appStore.ts:18-27](../../src/renderer/store/appStore.ts));
    `setActiveProfile` `set()`s after an un-guarded await
    ([profilesStore.ts:73-77](../../src/renderer/store/profilesStore.ts)); `JsonStore.write` is
    atomic-rename but callers read-modify-write without a mutex
    ([JsonStore.ts:23-29](../../src/main/storage/JsonStore.ts)). **Consequence:** Phase 90 gates
    the sync on stores-ready, guards profile writes, and serializes settings writes.

12. **Same-repo metadata saves churn object identity.** Repo save and Safety-Center assign both
    call `setActiveRepo(updated)` with a fresh object
    ([RepositoriesScreen.tsx:224-226](../../src/renderer/screens/RepositoriesScreen.tsx),
    [SafetyCenterScreen.tsx:136-139](../../src/renderer/screens/SafetyCenterScreen.tsx)), and the
    header's `loadBranches` effect keys on the object
    ([GlobalHeader.tsx:82-88](../../src/renderer/components/GlobalHeader.tsx)) — every save blanks
    and refetches the picker. **Consequence:** Phase 90 keys effects on `id` (+ the fields they
    actually read) and lets `setActiveRepo` bail on value-equal records.

## Scope

- **In:** all 45 audit findings (`#1–#13`, `W1–W32`) via fix groups A–H; a pure-core request-guard
  contract; compound serialized git jobs with in-queue HEAD verification; safe delete with
  escalated force-confirm; non-reentrant switching with visible errors and a stash-based
  "bring changes & switch" quick-fix; AI action origin-pinning with `before` verification; focus
  revalidation; a main-process `.git` watcher for the active repo; the polish tail (worktree
  prune affordance, connect-return reconcile, create-input preservation) and a regression e2e sweep.
- **Out / Non-goals:** auto-resolving merge or stash-pop conflicts (always route to Status);
  background fetching/polling of remotes; watching more than the active repo; watching working-tree
  _content_ (the watcher observes `.git` state; status refresh is the reaction, not file-level
  diffing); multi-window support; changing the AI chat's cross-repo transcript persistence;
  any visual redesign of screens beyond the new error/confirm/pill affordances.

## New contracts (pure core)

- `src/core/concurrency/requestGuard.ts` — `createRequestTracker()` returning
  `{ begin(): token; isCurrent(token): boolean }` (a monotonic counter, the `headerGuardStore`
  pattern made reusable). Pure, dependency-free, fully unit-tested.
- `GitStatus` gains `detached: boolean` and `upstreamGone: boolean`
  (parser-level, `src/core/parsers/PorcelainParser.ts` + `src/core/types.ts`).
- `getBranches` synthesizes the unborn current branch; `GitBranch` needs no shape change.
- New `GitErrorCode` **`branchNotMerged`** (maps git's "not fully merged" refusal).
- IPC payloads gain an **`expectedHeadBranch`** field on merge / uncommit / pull channels; the
  agentic-execute payload gains an origin stamp (`originRepositoryId` explicit, `originBranch`),
  and `before` becomes verified-when-present.
- New push event **`repo:changed { repoPath, kind: 'head' | 'refs' | 'index' }`** from main
  (Phase 96), following the existing preload event-bridge pattern in
  [preload/index.ts](../../preload/index.ts).

---

## Phase 89 — Stale-request guard + store load hygiene (pure core + renderer stores)

**Goal:** no store ever paints a superseded response, and every `load()` resets exactly the state
that must not survive a repo/branch change.

**Implementation:**

- New pure helper [`src/core/concurrency/requestGuard.ts`](../../src/core/concurrency) (contract
  above) + Vitest. Honors AGENTS.md #1 (pure core, no imports).
- Apply it to all six data stores: every `load()` takes a token at start; **every** subsequent
  `set()` (success, error, `finally` loading-flag, and post-action refreshes like
  `stageFile → loadStatus` in [statusStore.ts:39-53](../../src/renderer/store/statusStore.ts) or
  `doSwitch → refreshBranches` in [branchStore.ts:69-70](../../src/renderer/store/branchStore.ts))
  is dropped unless the token is still current. `loading` becomes owned by the latest request (#12).
- Load hygiene in the same pass: `statusStore.loadStatus` resets `status: null` when the target
  `repoPath` differs from the current one (in-place refresh stays flicker-free) — W7;
  `remoteStore.load` resets `upstream: null` (#9); `branchStore.load` resets
  `deleteConfirmBranch`, `mergeConfirmBranch`, `mergeConflict` (W5, W16);
  `historyStore.loadMore` drops its append when superseded (fixes cross-branch mixed history, #6).
- `commitStore`: the typed `message` becomes per-repo (keyed like
  [`draftsByRepo`](../../src/renderer/store/commitStore.ts), W23), and AI drafts key by repo
  **and branch** (#5).
- Unit tests simulate out-of-order IPC resolutions (two loads, first resolves last) and assert
  the last-issued request always wins, for every store.

**Exit criteria:** `npx tsc --noEmit` clean (both tsconfigs); `npm test` green including the new
requestGuard + per-store race tests; core-purity passes (new core module); `npm run lint` clean.

**Files:** new `src/core/concurrency/requestGuard.ts` (+ test); edit `src/renderer/store/statusStore.ts`,
`branchStore.ts`, `commitStore.ts`, `remoteStore.ts`, `historyStore.ts`, `safetyCenterStore.ts`.

---

## Phase 90 — `currentBranch` single ownership + repo/profile switch hygiene (renderer + small main)

**Goal:** one writer for `currentBranch`; repo switching, startup, and profile sync stop
thrashing or silently disagreeing.

**Implementation:**

- `branchStore` becomes the **sole writer** of `appStore.currentBranch`: `remoteStore.load` /
  `doPull` stop calling `setCurrentBranch`
  ([remoteStore.ts:96](../../src/renderer/store/remoteStore.ts),
  [remoteStore.ts:142-146](../../src/renderer/store/remoteStore.ts)) — when their `getStatus`
  disagrees with the current value they trigger `branchStore.load` (reconcile through the owner).
  A refresh that finds the current branch gone clears it (#4's deleted/renamed pinning).
- Same-repo re-select in the header triggers an explicit `refreshActiveRepo()` (new app-level
  helper; also the seam Phases 95–96 reuse) instead of a silent no-op (W14).
- `setActiveRepo` bails on value-equal records; the header's `loadBranches`/guard effects key on
  `activeRepo?.id` (+ `assignedProfileId`) so metadata saves stop blanking the picker (W30/F4);
  collapse the null-branch double-load on repo change (#10).
- Auto-select stabilization: re-pick `repos[0]` only when the active id truly vanished; a failed
  `repositories.list` becomes an error state, not an empty list (#11, W32).
- Startup: gate auto-select + `syncProfileToRepo` on stores-ready (or re-run the sync once after
  the `Promise.all` in [App.tsx:291-300](../../src/renderer/App.tsx)) — W18.
- Profile writes: request-guard `setActiveProfile`
  ([profilesStore.ts:73-77](../../src/renderer/store/profilesStore.ts)) so a superseded resolution
  never lands, and add a small per-file async mutex around settings writes in main
  ([JsonStore.ts:23-29](../../src/main/storage/JsonStore.ts)) — W19.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green (new ownership/reconcile tests,
startup-order test with stubbed IPC); `npm run lint` clean.

**Files:** edit `src/renderer/store/appStore.ts`, `branchStore.ts`, `remoteStore.ts`,
`profilesStore.ts`, `src/renderer/App.tsx`, `src/renderer/components/GlobalHeader.tsx`,
`src/main/storage/JsonStore.ts` (or a wrapper in its callers).

---

## Phase 91 — Verified-target compound writes (main + IPC)

**Goal:** every history-changing write proves — inside the serialized queue, immediately before
mutating — that HEAD is still the branch the user saw; a moved HEAD refuses with a plain message.

**Implementation:**

- `GitRunner` exposes a public **compound-job API** (`enqueueJob(cwd, fn)`) reusing the private
  queue ([GitRunner.ts:131-138](../../src/main/git/GitRunner.ts)), so read → decide → write holds
  the queue slot atomically. New main helper `verifyHeadBranch(repoPath, expected)`
  (`symbolic-ref --short HEAD`, executed inside the job).
- **Uncommit (W1, critical):** `returnLastCommit`/`returnUnpushed`
  ([uncommitExecutor.ts:50-72](../../src/main/ipc/uncommitExecutor.ts)) run
  eligibility-read + `resetMixed` as one enqueued job; payloads gain `expectedHeadBranch`
  (the History screen knows its branch); mismatch → structured refusal.
- **Merge (W8):** `git:merge` payload gains `expectedTargetBranch`
  ([ipc-schemas.ts:94-97](../../src/main/ipc/ipc-schemas.ts)); `runGitMerge`
  ([gitMergeHandler.ts:15-25](../../src/main/ipc/gitMergeHandler.ts)) becomes a compound job
  (verify HEAD → clean-tree check → merge), killing its clean-tree TOCTOU too. Same treatment for
  `merge-remote-into-local`
  ([remediationExecutor.ts:118-148](../../src/main/ipc/remediationExecutor.ts)) and the pull
  handler (wave-1 #2).
- **Push:** `-u` decision probes the _named_ branch (`rev-parse … ${branch}@{u}`) instead of HEAD
  ([GitService.ts:263-274](../../src/main/services/GitService.ts)) — W10; auth/URL resolution for
  push/pull/fetch moves inside the compound job so a queued `remote set-url` can't stale it — W9;
  `doRemotePush` pins `remote`/`branch` into `lastFailure`
  ([remoteStore.ts:156-178](../../src/renderer/store/remoteStore.ts)) — W21.
- Small atomicity fixes: `commit` returns the hash from inside its own job (W26);
  `getCommitsAhead`'s catch-all narrows to the missing-tracking-ref error, mirroring
  [GitService.ts:394-399](../../src/main/services/GitService.ts) (W29).
- Integration tests (offline fixture repos): enqueue a slow write, then call
  uncommit/merge/pull with a stale `expectedHeadBranch` → assert refusal, repo untouched.
  Honors AGENTS.md #2 (all execution via GitRunner), #3 (array args), #6 (no new unconfirmed
  destructive paths).

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green including the new compound-job +
refusal integration tests; `npm run lint` clean.

**Files:** edit `src/main/git/GitRunner.ts`, `src/main/services/GitService.ts`,
`src/main/ipc/uncommitExecutor.ts`, `gitMergeHandler.ts`, `remediationExecutor.ts`,
`ipc-schemas.ts`, `ipc-handlers.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`,
`src/renderer/store/remoteStore.ts`, `historyStore.ts` (pass the expected branch).

---

## Phase 92 — Branch-state truth + safe delete (core + main + renderer)

**Goal:** the app stops lying about branch state (fresh repo, detached HEAD, gone upstream), and
deleting unmerged work requires a second, visibly stronger confirmation.

**Implementation:**

- Parser/model: `detached` (from `branch.head (detached)`,
  [PorcelainParser.ts:41-43](../../src/core/parsers/PorcelainParser.ts)) and `upstreamGone`
  (`branch.upstream` present, `branch.ab` absent,
  [PorcelainParser.ts:44-51](../../src/core/parsers/PorcelainParser.ts)) on `GitStatus`.
- `getBranches` synthesizes the unborn current branch (from `symbolic-ref HEAD`) so a fresh-init
  repo shows its branch immediately ([GitService.ts:330-363](../../src/main/services/GitService.ts),
  W13); header renders a "detached" pill instead of a stale name.
- **Safe delete (W6, W27):** `deleteBranch` drops the TOCTOU pre-check and runs `branch -d`;
  ErrorMapper classifies "not fully merged" → `branchNotMerged`; a separate
  `forceDeleteBranch` (`-D`) channel is reachable **only** through the escalated second confirm on
  BranchesScreen ("this branch has commits that exist nowhere else — delete anyway?"), honoring
  AGENTS.md #6's distinct-stronger-warning rule. A genuinely missing branch surfaces the real
  error instead of a false success toast.
- Remote tab renders `upstreamGone` honestly ("remote branch is gone") instead of `0/0` (W20).
- Reads get a default `timeoutMs` in GitService's read invocations so a lock-wedged git can't hang
  a spinner forever; the store error path already renders a retry affordance (#7).

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green (parser cases: unborn, detached,
upstream-gone; delete integration: merged deletes, unmerged refuses, force path works);
core-purity passes; `npm run lint` clean.

**Files:** edit `src/core/parsers/PorcelainParser.ts`, `src/core/types.ts`,
`src/main/git/ErrorMapper.ts`, `src/main/services/GitService.ts`, `src/main/ipc/ipc-schemas.ts`,
`ipc-handlers.ts`, `preload/index.ts`, `window.d.ts`, `src/renderer/store/branchStore.ts`,
`src/renderer/screens/BranchesScreen.tsx`, `RemoteScreen.tsx`, `GlobalHeader.tsx`.

---

## Phase 93 — Switch UX: non-reentrant picker, visible failures, stash quick-fix (main + IPC + renderer + e2e)

**Goal:** switching is honest and calm — the picker locks while a switch runs, a failure says so
in plain words right where the user is, and one confirmed click brings uncommitted changes along.

**Implementation:**

- `branchStore.doSwitch` gains `switching` + `switchError` state: re-entrant calls are ignored
  while in flight (fix B — no more queued checkout pile-ups), and failures land in `switchError`
  (with the branch name) instead of the Branches-only `error`
  ([branchStore.ts:60-75](../../src/renderer/store/branchStore.ts)).
- `GlobalHeader` disables the branch picker while `switching` and renders the failure inline next
  to it (W3): plain message + two actions — "Open Status" and **"Bring changes & switch"**.
- The quick-fix is a new **compound main op** `stashSwitchPop` (Phase 91's `enqueueJob`):
  `stash push --include-untracked` → `switch` → `stash pop`; a pop conflict is **never**
  auto-resolved — the stash is kept and the structured result routes the user to Status, same as
  merge conflicts. New Zod payload/channel/bridge method; the action runs behind a confirm
  (AGENTS.md #6).
- Superseded-toast hygiene: success/error messages carry the branch they belong to; only the
  latest switch's outcome renders (#13).
- Dropdown: keyboard highlight keyed by option **value**, re-derived when options change while
  open ([Dropdown.tsx:161](../../src/renderer/components/Dropdown.tsx),
  [Dropdown.tsx:250-264](../../src/renderer/components/Dropdown.tsx)) — W17.
- Playwright spec (fixture repo): dirty-tree switch surfaces the inline error; quick-fix switches
  and preserves the changes; picker is disabled mid-switch; a second rapid pick doesn't queue.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green (store + executor tests);
`npm run e2e` green for the new switch spec; `npm run lint` clean.

**Files:** new stash-switch executor in `src/main/ipc/`; edit `src/main/services/GitService.ts`,
`ipc-schemas.ts`, `ipc-handlers.ts`, `preload/index.ts`, `window.d.ts`,
`src/renderer/store/branchStore.ts`, `GlobalHeader.tsx`, `Dropdown.tsx`, `strings.ts`; new
Playwright spec.

---

## Phase 94 — AI actions pinned to their origin (main + renderer)

**Goal:** an AI-generated action can only run against the repo/branch it was generated for, and
never over content that changed since the AI looked.

**Implementation:**

- Stamp origin at generation: proposals and commit-draft chat blocks carry
  `originRepositoryId` (+ `originBranch`) from send time (types in `src/core/ai/`,
  set in `aiChatStore`'s propose/commit flows).
- `applyProposal` ([aiChatStore.ts:172-203](../../src/renderer/store/aiChatStore.ts)) refuses with
  a plain chat bubble when `activeRepo.id` ≠ origin — and passes the **origin** id, not the
  click-time one (W2).
- `AgenticActionExecutor.executeFileEdits`
  ([AgenticActionExecutor.ts:14-33](../../src/main/ai/AgenticActionExecutor.ts)): when
  `edit.before` is present (the schema already carries it,
  [ipc-schemas.ts:338-347](../../src/main/ipc/ipc-schemas.ts)) read the file first and refuse on
  mismatch ("this file changed since the AI looked at it"); run the whole edit batch inside
  `enqueueJob(repoPath)` so it can't interleave a running checkout.
- CommitDraftCard's Insert routes through `commitStore`'s per-repo draft surfacing (or refuses on
  repo mismatch) instead of the global `setMessage`
  ([CommitDraftCard.tsx:60-63](../../src/renderer/components/chatBlocks/CommitDraftCard.tsx)) — W11.
- After a successful Apply, refresh `statusStore`/`commitStore` for the active repo so the tabs
  beside the chat reflect the writes (W15).

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green (executor `before`-mismatch +
wrong-repo refusal tests, store tests); `npm run lint` clean.

**Files:** edit `src/core/ai/types.ts`, `src/core/ai/chatBlocks.ts`,
`src/main/ai/AgenticActionExecutor.ts`, `src/main/ipc/ipc-schemas.ts`,
`src/renderer/store/aiChatStore.ts`, `commitStore.ts`,
`src/renderer/components/chatBlocks/CommitDraftCard.tsx`, `AiChatPanel.tsx`, `strings.ts`.

---

## Phase 95 — Focus revalidation + refresh wiring (renderer)

**Goal:** coming back to the app always re-reads reality, and in-app actions refresh what they
change — no more "the accidental heal is switching tabs".

**Implementation:**

- Window `focus`/`visibilitychange` listener (App level) calls `refreshActiveRepo()` (Phase 90's
  helper), throttled (≥2 s), revalidating: branch list, the active screen's store, and
  `headerGuardStore` — the always-mounted surfaces finally heal (W4-cheap, W12's badge half).
- `safetyCenterStore.load` success also refreshes `headerGuardStore` so badge and screen can't
  disagree (W12).
- `doFetch` success reloads the Remote store and nudges branch/history stores
  ([remoteStore.ts:104-117](../../src/renderer/store/remoteStore.ts)) — W25.
- Update re-check on focus with a 24 h throttle (W28).
- e2e smoke: commit externally in the fixture repo, refocus the window → Status shows the change.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green; the focus-refresh e2e smoke green;
`npm run lint` clean.

**Files:** edit `src/renderer/App.tsx`, `src/renderer/store/appStore.ts` (helper),
`remoteStore.ts`, `safetyCenterStore.ts`, `updatesStore.ts`; new/extended Playwright spec.

---

## Phase 96 — `.git` watcher: instant external-change detection (main + IPC + renderer)

**Goal:** anything done to the active repo outside GitWarden shows up in the app within about a
second — no window juggling at all.

**Implementation:**

- New main `RepoWatcherService`: `fs.watch` on the active repo's `.git/HEAD`, `.git/refs`
  (fallback to stat-polling where recursive watch is unavailable) and `.git/index`; debounced
  (~400 ms); classifies events as `head` / `refs` / `index`. Watches **only the active repo** —
  the renderer drives it via `repo:watch` / `repo:unwatch` IPC on active-repo change.
- Pushes `repo:changed { repoPath, kind }` over `webContents.send`, exposed through the existing
  preload event-bridge pattern ([preload/index.ts](../../preload/index.ts)).
- Renderer subscribes once (App level) and routes events into `refreshActiveRepo(scope)`:
  `head`/`refs` → branch list + active screen + guard; `index` → status/commit. Self-triggered
  churn is tolerated by the debounce + request guard (Phase 89) — a redundant refresh is cheap
  and always lands on fresh data.
- Integration test (offline): real fixture repo, external `git commit`/`switch` via child
  process → event fires and carries the right kind; unwatch stops events.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green including the watcher integration
test; `npm run lint` clean; no watcher leaks (unwatch verified in test).

**Files:** new `src/main/services/RepoWatcherService.ts` (+ test); edit `src/main/ipc/ipc-handlers.ts`,
`ipc-schemas.ts`, `preload/index.ts`, `window.d.ts`, `src/renderer/App.tsx`.

---

## Phase 97 — Polish + regression sweep (renderer + e2e) — feature-complete stop point

**Goal:** close the low-tier tail and prove the whole track end-to-end against the audit's
scenarios.

**Implementation:**

- Worktree hygiene (W22): when a branch's `worktreePath` no longer exists on disk, offer
  "Clean up stale worktree" (`git worktree prune` behind a confirm) instead of a permanent lock.
- Connect-return reconcile (W24): closing the GitHub connect modal always reloads
  `profilesStore` so a cancel racing the authorization can't leave UI ≠ disk.
- Create-branch failure keeps the typed name (W31): `doCreate` reports success, the screen clears
  the input only then ([branchStore.ts:77-91](../../src/renderer/store/branchStore.ts)).
- Sweep the remaining audit cosmetics and re-verify the fixed list against
  [`docs/investigations/branch-switch-freshness-audit.md`](../investigations/branch-switch-freshness-audit.md);
  update that doc's status header to "implemented by Phases 89–97".
- **Regression e2e sweep** (the track's acceptance run): rapid-switch staleness spec,
  external-change spec, wrong-target refusal spec, AI origin-pin spec, safe-delete escalation
  spec — plus the full existing suites.

**Exit criteria:** full gate — `npx tsc --noEmit` (both), `npm test`, `npm run lint`, and
`npm run e2e` **all green**, including every spec added by Phases 93–97.

**Files:** edit `src/renderer/screens/BranchesScreen.tsx`, `ConnectGitHubModal.tsx`,
`branchStore.ts`, `src/main/services/GitService.ts` (worktree prune), plus new/extended
Playwright specs.

---

## Acceptance criteria (feature)

1. **Rapid switching is truthful:** on the test repo, switching `main → feature → dev` as fast as
   the picker allows always settles with every tab (Status, Commit, Remote, History, Safety
   Center, header, Inspector) showing `dev`'s data — verified by the rapid-switch e2e spec.
2. **External changes appear:** `git switch` / `git commit` in a terminal shows up in the app
   within ~1 s (watcher) — and at latest on window refocus — including the header picker and
   guard badge.
3. **No silent switch failures:** a dirty-tree switch shows a plain-language inline error at the
   picker; "Bring changes & switch" completes the switch with changes intact; a pop conflict
   routes to Status with the stash preserved.
4. **No wrong-target writes:** uncommit, merge (all three channels), and pull refuse with a clear
   message when HEAD is no longer the branch shown at click time; push sets `-u` for the named
   branch; push auth resolves at execution time.
5. **AI actions are pinned:** Apply/Insert refuse when the active repo differs from the origin;
   an edit whose `before` no longer matches disk is refused; a successful Apply refreshes
   Status/Commit.
6. **Deleting is honest:** deleting a merged branch takes one confirm; an unmerged branch
   requires the second, visibly stronger confirm; no false "Deleted" toasts.
7. **Degenerate states render:** fresh-init repo shows its unborn branch immediately; detached
   HEAD shows a pill, not a stale branch name; a gone upstream is labeled, not "0/0".
8. **No regressions:** the complete Vitest + Playwright suites pass at the track's end.

## Decisions (resolved)

- **Scope:** all 45 audit findings in this one track (user-confirmed).
- **External-change detection:** full `.git` watcher in-track (Phase 96), with focus
  revalidation shipping first (Phase 95) as the cheap layer.
- **Delete UX:** safe `-d` first, escalated distinct force-confirm for unmerged branches.
- **Dirty-tree switch:** visible error **plus** the stash-based quick-fix in-track; conflicts
  never auto-resolved.
- **Watcher scope:** active repo only; `.git` state only.
- **`currentBranch` ownership:** `branchStore` is the sole writer; others reconcile through it.
- **Slug / numbering:** `branch-switch-integrity`, Phases 89–97, feature-complete at 97.

## Open questions (resolve at kickoff)

- Phase 96: exact debounce value and whether to suppress self-triggered events within a short
  window after our own write completes (default: don't suppress; the request guard makes the
  redundant refresh harmless). Decide from the integration test's observed churn.
