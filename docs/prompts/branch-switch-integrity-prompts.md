# GitWarden — Branch-Switch Data Integrity Phase Prompts

Copy-paste prompts to drive the **Branch-Switch Data Integrity** feature one phase at a time. Each
prompt is self-contained, points at the plan in `docs/plans/branch-switch-integrity-plan.md`, and
**ends with the standard progress footer** that records progress in `docs/progress-log.md`. Rules
live in `CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (89 → 97). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Phases 89–92 are logic/infra (Vitest only);
Phase 93 is the first with a Playwright spec; Phase 97 is the feature-complete stop point with the
regression e2e sweep. One commit per phase; the progress-log entry written **before** the commit.

**Prerequisites / offline note:** No network. All tests use real git fixture repos created in a
temp dir (local bare repo as the "remote" where needed) — same conventions as the existing
integration/e2e suites. The source audit with all 45 finding IDs (`#1–#13`, `W1–W32`) is
`docs/investigations/branch-switch-freshness-audit.md`; the plan maps every ID to its phase.

Background facts (already verified against the tree — don't re-litigate):

- `GitRunner.run` executes read-only ops immediately and concurrently; only writes are per-cwd
  FIFO-serialized (`src/main/git/GitRunner.ts:33-40`, `:131-138`). Reads have no timeout unless
  `timeoutMs` is passed.
- Only `headerGuardStore` drops superseded results via a monotonic `reqId`
  (`src/renderer/store/headerGuardStore.ts:31-53`); the six data stores (status, branch, commit,
  remote, history, safetyCenter) have no such guard — last `set()` wins.
- `appStore.currentBranch` has five writers (branchStore load/doSwitch/doCreate,
  remoteStore load/doPull); `setActiveRepo` nulls it only on a repo-id change
  (`src/renderer/store/appStore.ts:74-90`).
- The merge IPC payload carries only the source branch (`src/main/ipc/ipc-schemas.ts:94-97`);
  merges/uncommit/pull act on whatever HEAD is when the queued write runs
  (`src/main/ipc/gitMergeHandler.ts:15-25`, `src/main/ipc/uncommitExecutor.ts:50-72`,
  `src/main/ipc/remediationExecutor.ts:118-148`).
- `deleteBranch` runs `branch -D` behind a TOCTOU exists pre-check
  (`src/main/services/GitService.ts:373-386`).
- The agentic executor writes `edit.after` without checking `edit.before` or the git queue
  (`src/main/ai/AgenticActionExecutor.ts:14-33`); the payload already carries `before`
  (`src/main/ipc/ipc-schemas.ts:338-347`).
- There are no refresh triggers besides React effect deps: no fs-watcher, no polling, no
  focus/visibility revalidation anywhere; the only manual Refresh button is on Status.

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

## Phase 89 — Stale-request guard + store load hygiene

```
Work on Phase 89 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 89"). Pure core + renderer stores only — no IPC changes, no UI changes.

Tasks:
- Create src/core/concurrency/requestGuard.ts: createRequestTracker() returning { begin(): number; isCurrent(token: number): boolean } — a reusable, dependency-free version of headerGuardStore's monotonic reqId pattern (src/renderer/store/headerGuardStore.ts:31-53). Vitest for it. src/core stays pure (AGENTS.md #1).
- Apply the tracker to all six data stores (statusStore, branchStore, commitStore, remoteStore, historyStore, safetyCenterStore): every load() takes a token at start; EVERY subsequent set() — success, error, finally-loading, and post-action refreshes (stageFile/unstageFile/stageAll/unstageAll → loadStatus; doSwitch/doCreate/doDelete/doMerge → refreshBranches; doCommit's status refresh; doPull's status refresh) — is dropped unless the token is still current. The loading flag is owned by the latest request (audit #12).
- Load hygiene in the same pass: statusStore.loadStatus resets status:null when the target repoPath differs from the stored one (in-place refresh stays flicker-free) — W7; remoteStore.load resets upstream:null (#9); branchStore.load resets deleteConfirmBranch, mergeConfirmBranch, mergeConflict (W5, W16); historyStore.loadMore drops its append when superseded (#6).
- commitStore: make the typed message per-repo (keyed like draftsByRepo; restore on return) — W23; key AI drafts by repo AND branch (#5).
- Unit tests per store simulating out-of-order IPC resolutions (issue load A, then load B; resolve A last) asserting the last-ISSUED request always wins, plus tests for each reset above.

Exit: npx tsc --noEmit clean (both tsconfigs); npm test green including the new requestGuard + per-store race tests; core-purity passes; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 90 — `currentBranch` single ownership + repo/profile switch hygiene

```
Work on Phase 90 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 90"). Renderer stores/App + one small main-process change. No new UI surfaces.

Tasks:
- Make branchStore the SOLE writer of appStore.currentBranch: remove the setCurrentBranch calls from remoteStore.load (src/renderer/store/remoteStore.ts:96) and doPull (:142-146); when their getStatus disagrees with the current value they trigger branchStore.load (reconcile through the owner). A branch refresh that finds the current branch gone clears currentBranch (audit #4).
- Add an app-level refreshActiveRepo() helper (appStore or a small module) that reloads: branch list, the active screen's store, headerGuardStore. Wire the header repo picker so re-selecting the SAME repo calls it instead of silently no-opping (W14). (Phases 95–96 reuse this seam.)
- setActiveRepo bails on value-equal records; key GlobalHeader's loadBranches/refreshGuard effects on activeRepo?.id (+ assignedProfileId for the guard) so same-repo metadata saves (RepositoriesScreen.tsx:224-226, SafetyCenterScreen.tsx:136-139) stop blanking the picker (W30); collapse the null-branch double-load on repo change (#10).
- Auto-select stabilization in App.tsx:370-376: re-pick repos[0] only when the active id truly vanished from the list; a failed repositories.list result becomes an error state, not repos:[] (#11, W32).
- Startup: gate auto-select + syncProfileToRepo on stores-ready (or re-run syncProfileToRepo(activeRepo) once inside the Promise.all .then in App.tsx:291-300) — W18.
- Profile writes: request-guard setActiveProfile (src/renderer/store/profilesStore.ts:73-77) so a superseded resolution never lands; add a per-file async mutex around JsonStore write callers in main (src/main/storage/JsonStore.ts:23-29) so concurrent settings read-modify-writes can't drop fields — W19.
- Unit tests: ownership/reconcile tests; startup-order test with stubbed IPC resolving in both orders; mutex test.

Exit: npx tsc --noEmit clean; npm test green; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 91 — Verified-target compound writes

```
Work on Phase 91 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 91"). Main + IPC. Every history-changing write must verify — INSIDE the serialized queue, immediately before mutating — that HEAD is still the branch the user saw (audit fix C; kills W1 critical, W8, W9, W10, W21, W26, W29).

Tasks:
- GitRunner: expose a public compound-job API enqueueJob(cwd, fn) reusing the private per-cwd queue (src/main/git/GitRunner.ts:131-138), so read → decide → write holds the queue slot atomically. Add a main helper verifyHeadBranch(repoPath, expected) via `git symbolic-ref --short HEAD` executed inside the job.
- Uncommit (W1): returnLastCommit/returnUnpushed (src/main/ipc/uncommitExecutor.ts:50-72) run eligibility-read + resetMixed as ONE enqueued job; history:* payloads gain expectedHeadBranch (historyStore passes its branch); mismatch → structured refusal with a plain message, repo untouched.
- Merge (W8): git:merge payload gains expectedTargetBranch (src/main/ipc/ipc-schemas.ts:94-97); runGitMerge (src/main/ipc/gitMergeHandler.ts:15-25) becomes a compound job (verify HEAD → clean-tree check → merge), removing its clean-tree TOCTOU. Apply the same to merge-remote-into-local (src/main/ipc/remediationExecutor.ts:118-148) and the pull handler (#2).
- Push: hasUpstream probes the NAMED branch (`rev-parse --abbrev-ref --symbolic-full-name <branch>@{u}`) instead of HEAD (src/main/services/GitService.ts:263-274) — W10. Resolve the remote URL/auth INSIDE the compound job so a queued `remote set-url` can't stale the credential-isolation decision — W9. doRemotePush pins remote/branch into lastFailure (src/renderer/store/remoteStore.ts:156-178) — W21.
- Atomicity: commit returns its hash from inside one enqueued job (W26); getCommitsAhead narrows its catch-all to the missing-tracking-ref error, mirroring getCommitHistory's pattern at GitService.ts:394-399 (W29).
- Integration tests (offline fixture repos): enqueue a slow write (a queued switch), then call uncommit/merge/pull with a stale expectedHeadBranch → assert refusal and an untouched repo; assert the happy path still works. AGENTS.md #2/#3/#6 honored throughout.

Exit: npx tsc --noEmit clean; npm test green including the new compound-job + refusal integration tests; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 92 — Branch-state truth + safe delete

```
Work on Phase 92 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 92"). Core parser + main + the minimal renderer wiring for the escalated delete confirm.

Tasks:
- PorcelainParser: add detached (branch.head "(detached)", src/core/parsers/PorcelainParser.ts:41-43) and upstreamGone (branch.upstream present but branch.ab absent, :44-51) to GitStatus (src/core/types.ts). Parser unit tests: unborn, detached, upstream-gone.
- getBranches synthesizes the unborn current branch (from `git symbolic-ref --short HEAD`) so a fresh-init repo shows its branch immediately with isCurrent:true (src/main/services/GitService.ts:330-363) — W13. GlobalHeader renders a "detached" pill instead of a stale branch name when status.detached.
- Safe delete (W6 + W27): deleteBranch drops the TOCTOU exists pre-check and runs `branch -d`; ErrorMapper classifies git's "not fully merged" refusal into a new GitErrorCode branchNotMerged; add forceDeleteBranch (`branch -D`) behind its own channel, reachable ONLY through a second, visibly stronger confirm on BranchesScreen ("this branch has commits that exist nowhere else — delete anyway?"), honoring AGENTS.md #6. A genuinely missing branch surfaces the real error instead of a false "Deleted" toast.
- Remote tab renders upstreamGone honestly ("remote branch is gone") instead of ahead/behind 0/0 — W20.
- Reads get a default timeoutMs in GitService's readOnly invocations so a lock-wedged git can't hang a spinner forever (#7); keep the store error path's retry affordance working.
- Integration tests: merged branch deletes on first confirm; unmerged branch refuses with branchNotMerged then force-deletes via the new channel; unborn fixture shows the synthesized branch; new strings externalized.

Exit: npx tsc --noEmit clean; npm test green (parser + delete + unborn integration); core-purity passes; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 93 — Switch UX: non-reentrant picker, visible failures, stash quick-fix

```
Work on Phase 93 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 93"). Main + IPC + renderer + e2e. First UI phase of the track.

Tasks:
- branchStore.doSwitch: add switching + switchError state; ignore re-entrant calls while a switch is in flight (fix B — no queued checkout pile-ups); failures land in switchError with the branch name instead of the Branches-only error field (src/renderer/store/branchStore.ts:60-75) — W3.
- GlobalHeader: disable the branch picker while switching; render the failure inline next to the picker in plain language with two actions: "Open Status" and "Bring changes & switch".
- Quick-fix: new compound main op stashSwitchPop using Phase 91's enqueueJob — `stash push --include-untracked` → `switch <branch>` → `stash pop`. A pop conflict is NEVER auto-resolved: keep the stash, return a structured result that routes the user to Status (same pattern as merge conflicts). New Zod payload + IPC channel + preload bridge + window.d.ts; the action runs behind a confirm (AGENTS.md #6).
- Toast hygiene: success/error messages carry the branch they belong to; only the latest switch's outcome renders (#13).
- Dropdown: key the keyboard highlight by option VALUE and re-derive the index when options change while the popup is open (src/renderer/components/Dropdown.tsx:161, :250-264) — W17.
- Playwright spec (fixture repo): dirty-tree switch surfaces the inline error; "Bring changes & switch" completes the switch with changes intact; the picker is disabled mid-switch; a rapid second pick does not queue a second checkout. New strings externalized.

Exit: npx tsc --noEmit clean; npm test green; npm run e2e green for the new switch spec; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 94 — AI actions pinned to their origin

```
Work on Phase 94 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 94"). Main + renderer. An AI-generated action may only run against the repo/branch it was generated for, and never over content that changed since the AI looked (W2, W11, W15). The chat transcript's cross-repo persistence is intentional — do NOT change it; only the actions get pinned.

Tasks:
- Stamp origin at generation: proposals and commit-draft chat blocks carry originRepositoryId (+ originBranch) captured at send time (types in src/core/ai/, populated in aiChatStore's propose/commit flows).
- applyProposal (src/renderer/store/aiChatStore.ts:172-203): refuse with a plain chat bubble when activeRepo.id ≠ origin; pass the ORIGIN repositoryId to the executor, not the click-time one — W2.
- AgenticActionExecutor.executeFileEdits (src/main/ai/AgenticActionExecutor.ts:14-33): when edit.before is present (schema already carries it, src/main/ipc/ipc-schemas.ts:338-347), read the file and refuse on mismatch with "this file changed since the AI looked at it"; run the whole edit batch inside enqueueJob(repoPath) so it cannot interleave a running checkout.
- CommitDraftCard Insert (src/renderer/components/chatBlocks/CommitDraftCard.tsx:60-63): route through commitStore's per-repo draft surfacing (draftsByRepo) or refuse on repo mismatch — never the global setMessage — W11.
- After a successful Apply, refresh statusStore + commitStore for the active repo so the tabs beside the chat reflect the writes — W15.
- Tests: executor before-mismatch + wrong-repo refusal; store tests for the origin stamp and refusal bubbles. New strings externalized.

Exit: npx tsc --noEmit clean; npm test green; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 95 — Focus revalidation + refresh wiring

```
Work on Phase 95 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 95"). Renderer. Coming back to the app always re-reads reality; in-app actions refresh what they change (W4-cheap layer, W12, W25, W28).

Tasks:
- App-level window focus + visibilitychange listener calling Phase 90's refreshActiveRepo(), throttled (≥2 s between runs), revalidating: branch list, the active screen's store, and headerGuardStore — the always-mounted header surfaces finally heal.
- safetyCenterStore.load success also refreshes headerGuardStore so the badge and the Safety Center screen can never disagree on screen — W12.
- doFetch success reloads the Remote store and nudges branch/history stores (src/renderer/store/remoteStore.ts:104-117) — W25.
- Update re-check on window focus with a 24 h throttle (updatesStore) — W28; keep the Playwright/webdriver guard so e2e never makes a network call.
- Tests: unit tests for the throttle + refresh routing; e2e smoke: commit externally in the fixture repo, refocus the window → Status shows the change.

Exit: npx tsc --noEmit clean; npm test green; the focus-refresh e2e smoke green; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 96 — `.git` watcher: instant external-change detection

```
Work on Phase 96 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 96"). Main + IPC + renderer. External changes to the ACTIVE repo appear in the app within ~a second (W4 full).

Tasks:
- New src/main/services/RepoWatcherService.ts: fs.watch on the active repo's .git/HEAD, .git/refs (stat-polling fallback where recursive watch is unavailable) and .git/index; debounce ~400 ms; classify events as head | refs | index. Watch ONLY the active repo; the renderer drives it via new repo:watch / repo:unwatch IPC on active-repo change.
- Push repo:changed { repoPath, kind } via webContents.send, exposed through the existing preload event-bridge pattern (preload/index.ts); type it in window.d.ts.
- Renderer subscribes once (App level) and routes events into refreshActiveRepo(scope): head/refs → branch list + active screen + guard; index → status/commit. Self-triggered churn is tolerated: the debounce plus Phase 89's request guard make a redundant refresh harmless (decide the final debounce value from the integration test's observed churn — plan §Open questions).
- Integration test (offline): real fixture repo; external `git commit` / `git switch` via child process → the event fires with the right kind; unwatch stops events; no watcher leak (switching repos closes the old watcher).

Exit: npx tsc --noEmit clean; npm test green including the watcher integration test; npm run lint clean; unwatch/no-leak verified in test.

Then run the standard progress footer.
```

---

## Phase 97 — Polish + regression sweep (feature-complete stop point)

```
Work on Phase 97 of GitWarden (docs/plans/branch-switch-integrity-plan.md §"Phase 97"). Renderer + e2e. Close the low-tier tail and prove the whole track end-to-end. This is the feature-complete stop point.

Tasks:
- Worktree hygiene (W22): when a branch's worktreePath no longer exists on disk, offer "Clean up stale worktree" running `git worktree prune` behind a confirm, instead of a permanently locked branch.
- Connect-return reconcile (W24): closing the GitHub connect modal always reloads profilesStore so a cancel racing the authorization can't leave the UI disagreeing with disk.
- Create-branch failure keeps the typed name (W31): doCreate reports success; BranchesScreen clears the input only on success (src/renderer/store/branchStore.ts:77-91).
- Sweep the remaining audit cosmetics; re-verify the full finding list in docs/investigations/branch-switch-freshness-audit.md and update that doc's status header to "implemented by Phases 89–97" with a per-finding fixed/deferred map (be honest about anything deferred).
- Regression e2e sweep — the track's acceptance run per plan §"Acceptance criteria (feature)": rapid-switch staleness spec, external-change spec, wrong-target refusal spec (as far as e2e can drive it), AI origin-pin spec, safe-delete escalation spec — plus the full existing suites. Chunk the e2e run (it exceeds 10 min as one block).

Exit: full gate — npx tsc --noEmit (both tsconfigs), npm test, npm run lint, and npm run e2e ALL green, including every spec added by Phases 93–97.

Then run the standard progress footer.
```
