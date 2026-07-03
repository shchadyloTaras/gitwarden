# GitWarden — Merge a Branch Phase Prompts

Copy-paste prompts to drive the **Merge a Branch** feature one phase at a time. Each prompt is
self-contained, points at the plan in `docs/plans/merge-branch-plan.md`, and **ends with the
standard progress footer** that records progress in `docs/progress-log.md`. Rules live in
`CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (82 → 84). Don't start a phase until the previous phase's entry
in `docs/progress-log.md` shows Exit criteria ✅. Phases 82–83 are the logic-complete checkpoint
(green Vitest, no UI); Phase 84 is the feature-complete stop point (renderer + Playwright). One
commit per phase; the progress-log entry written **before** the commit.

**Prerequisites / offline note:** No network. Tests use real git fixtures in a temp dir (a source
branch ahead of the current branch for the clean case; two branches editing the same line for the
conflict case), and a local **bare** repo as the remote only where a push is exercised.

Background facts (already verified against the tree — don't re-litigate):

- A local merge primitive is 90% built: `GitService.mergeRemoteBranch` runs `git merge --no-edit
  <remote>/<branch>` — purely local, no auth, `--no-edit`, and a real conflict rejects with a
  `GitError` code `mergeConflict` (GitService.ts:201-218). Add a sibling `mergeBranch(repoPath, ref)`
  and make `mergeRemoteBranch` delegate to it.
- The branch IPC pattern is a thin Zod-validated `wrap()` per channel: `git:switchBranch` /
  `git:deleteBranch` parse `GitBranchOpPayload = {repoPath, branch}` then call the service
  (ipc-handlers.ts:377-396, ipc-schemas.ts:87-90); surfaced on the preload bridge
  (preload/index.ts:177-182) and typed in window.d.ts (window.d.ts:150-152). `git:merge` reuses
  `GitBranchOpPayload` — no new schema — and does NOT extend the `remediation.ts` `ExecutableAction`
  model (this is user-initiated).
- The conflict→Status path is free: `mergeConflict` is already a `RemediableGitErrorCode` →
  `resolve-conflicts` → navigate `status` (remediation.ts:26-27,79-81,116-125), and `wrap()`'s
  `toIpcFailure` attaches `code` + `remediation` to any remediable thrown `GitError`
  (ipc-handlers.ts:140-149, ipcFailure.ts:25-35). Let the conflict propagate; don't catch it.
- `RemediationButton` renders a navigate remediation as a "Go to <target>" button
  (RemediationButton.tsx:87-92), reused by RemoteScreen (RemoteScreen.tsx:397-402); `appStore` has
  `navigate(screen)` + a `NavScreen` union incl. `'status'`/`'branches'` (appStore.ts:29-73).
- The clean-tree refusal has an exact precedent: the diverged-merge executor refuses when
  `getStatus(...).files.length > 0` (remediationExecutor.ts:118-142); `getStatus` returns
  `GitStatus{files,...}` (GitService.ts:60-67).
- The Branches screen lists local branches with Switch/Delete + an inline two-step Delete confirm
  keyed on `deleteConfirmBranch`, and a worktree guard swaps actions for an "In worktree" badge
  (BranchesScreen.tsx:51-357); `branchStore` has doSwitch/doCreate/doDelete but no doMerge
  (branchStore.ts:28-114). All row copy is externalized in `STR` (strings.ts).

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

## Phase 82 — Local branch merge in GitService (main)

```
Work on Phase 82 of GitWarden (docs/plans/merge-branch-plan.md §"Phase 82"). Main/service layer only — no IPC, no UI. Honor AGENTS.md rules #2 (GitRunner is the only executor), #3 (args arrays), #5 (no secrets logged).

Tasks:
- Add GitService.mergeBranch(repoPath, ref): run ['merge', '--no-edit', ref] with readOnly:false and a timeoutMs mirroring mergeRemoteBranch's 60_000 (GitService.ts:201-218 is the template). No auth param, no network, no credential env. `ref` is a single array element — never string-interpolated into a shell.
- Refactor mergeRemoteBranch to delegate: return this.mergeBranch(repoPath, `${remote}/${branch}`). Behaviour and doc unchanged — one merge code path so the GitRunner stdout-conflict classification (Phase 69) covers both.
- Do NOT add a clean-tree pre-check here — that is the orchestration layer's job in Phase 83; this is the raw primitive.

Exit: npx tsc --noEmit clean on both tsconfigs; integration tests (Vitest, offline real temp repo) — a fast-forwardable merge succeeds and advances the branch; a true 3-way merge creates a merge commit; a conflicting merge (both branches edit the same line) rejects with a GitError code 'mergeConflict' (regression-proofs the Phase 69 stdout fix); an "already up to date" merge is a successful no-op; mergeRemoteBranch's existing tests stay green (delegation preserves behaviour); npm test green; npm run lint clean; the safety-reviewer subagent passes (args arrays, no secrets logged, no global/system state). No IPC/UI.

Then run the standard progress footer.
```

---

## Phase 83 — `git:merge` channel + clean-tree pre-check (main + IPC)

```
Work on Phase 83 of GitWarden (docs/plans/merge-branch-plan.md §"Phase 83"). Main + IPC only — no UI. Honor AGENTS.md rules #3 (args arrays) and #6 (the explicit button click + inline confirm is the confirmation — no second modal).

Tasks:
- Register ipcMain.handle('git:merge', ...) alongside the branch block, copying the git:switchBranch shape (ipc-handlers.ts:377-382), reusing GitBranchOpPayload = {repoPath, branch} (ipc-schemas.ts:87-90) — no new schema.
- In the handler: run getStatus (GitService.ts:60-67); if status.files.length > 0, refuse the merge with a plain-language message (mirror the diverged-merge executor's clean-tree pre-check, remediationExecutor.ts:118-142) WITHOUT attempting the merge. Otherwise call services.git.mergeBranch(repoPath, branch).
- On a mergeConflict GitError, do NOT catch it — let it propagate so wrap()'s toIpcFailure (ipc-handlers.ts:140-149, ipcFailure.ts:25-35) attaches code 'mergeConflict' AND the resolve-conflicts → status remediation automatically (remediation.ts:116-125). Any other git error also flows through wrap() unchanged.
- Add the bridge method git.merge(repoPath, branch) in preload/index.ts (mirror switchBranch, preload/index.ts:177-178) and its type in src/renderer/types/window.d.ts (mirror window.d.ts:150-152).

Exit: npx tsc --noEmit clean; integration tests (Vitest, offline real temp repo) — a clean / fast-forwardable divergent merge returns ok:true and the repo is merged; a real conflicting merge surfaces code === 'mergeConflict' with remediation.action === 'resolve-conflicts' (navigate → status) and the repo is left mid-merge (MERGE_HEAD present); a dirty working tree returns the pre-check refusal WITHOUT attempting the merge; npm test green; npm run lint clean; the safety-reviewer subagent passes (args arrays, no secrets logged, no global/system state). No UI.

Then run the standard progress footer.
```

---

## Phase 84 — Merge action on the Branches screen (renderer + e2e)

```
Work on Phase 84 of GitWarden (docs/plans/merge-branch-plan.md §"Phase 84"). Renderer + e2e — the feature-complete stop point.

Tasks:
- branchStore (branchStore.ts:28-114): add doMerge(branch) mirroring doSwitch/doDelete — clear messages, call window.api.git.merge(repoPath, branch); on ok set a success message ("Merged <branch> into <current>.") and refreshBranches; on failure, if res.remediation is present (the conflict case) keep it in state so the screen can render the navigate, otherwise set the error string (dirty-tree refusal). Add a mergeConfirmBranch state + setMergeConfirm (mirror deleteConfirmBranch/setDeleteConfirm).
- BranchesScreen (BranchesScreen.tsx:311-357): on each non-current local branch row add a "Merge into <current>" button; clicking sets mergeConfirmBranch and the row swaps to "Merge <branch> into <current>? [Yes, merge] [Cancel]" (mirror the inline Delete confirm at BranchesScreen.tsx:322-353). Show the Merge button even on worktree rows (merging its ref is safe) while leaving Switch/Delete hidden there. HIDE the Merge action entirely when there is no current branch (detached HEAD → currentBranch === null). On a conflict result, render the returned remediation via <RemediationButton remediation={…} /> in the banner area (RemediationButton.tsx:87-92; reused as in RemoteScreen.tsx:397-402) — a "Go to Status" navigate; on a dirty-tree refusal, show the plain message in the existing branches-error banner.
- Strings: externalize ALL new copy in src/renderer/strings.ts — the merge button label (e.g. MERGE_INTO(current)), its tooltip, the inline confirm prompt/confirm/cancel, and the success line. Copy is English (consistent with the existing STR table). No hard-coded user-facing strings.

Exit (Playwright e2e, offline fixtures + local bare remote): a repo with a feature branch ahead of the current branch + clean tree → Branches shows "Merge into <current>" on the feature row; click → confirm → the merge folds the feature branch into the current branch, a success message shows, the list refreshes; a conflicting merge (both branches edit the same line) → click merge → a "Go to Status" button appears; following it lands on Status with the file shown as unmerged/conflicted; a dirty working tree → the action is refused with the clean-tree message (no merge); (if cheap) the Merge action is hidden on a detached HEAD. npm test, npm run e2e, npm run lint all green; no hard-coded user-facing strings.

Then run the standard progress footer.
```
