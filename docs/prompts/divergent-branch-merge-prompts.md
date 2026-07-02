# GitWarden — Diverged-Branch Merge Phase Prompts

Copy-paste prompts to drive the **Diverged-Branch Merge** feature (in-app, one-click merge to
resolve a fork between the local branch and its remote) one phase at a time. Each prompt is
self-contained, points at the plan in `docs/plans/divergent-branch-merge-plan.md`, and **ends with
the standard progress footer** that records progress in `docs/progress-log.md`. Rules live in
`CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (68 → 71). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Treat **Phases 68–70** as the logic-complete
checkpoints (every step is verified headlessly against offline fixtures) and **Phase 71** as the UI
that ships the feature. This is a numbered feature: **one commit per phase**, the progress-log entry
written **before** the commit.

**Prerequisites / offline note:** No network, no real GitHub account, no token. The merge action is
**purely local** — it merges the remote-tracking ref that a failed `pull --ff-only` already fetched,
so it never touches the network or a credential. Integration/e2e tests use real git fixtures in a
temp dir with a **local bare repo as the "remote"** to create a genuine divergence (a commit on each
side).

**Product boundary (do not cross):** merge **only** (no rebase); **no fetch and no push** inside the
action (the user clicks the existing Push button separately); a real content conflict is **never**
auto-resolved — leave git's standard mid-merge state and fall back to the **existing**
`resolve-conflicts` → Status flow; **no** global/system-state mutation; git args stay arrays; no
secrets logged.

Background facts (already verified against the tree — don't re-litigate):

- **Pull already refuses divergence, explain-only.** `GitService.pull()` is `--ff-only`
  (`GitService.ts:175-189`); `ErrorMapper` maps divergence to `divergentBranches` with an
  explain-only message (`ErrorMapper.ts:160-172`). This feature adds an opt-in merge on top — it
  does not loosen Pull.
- **The remediation model is the extension point.** `RemediableGitErrorCode` +
  `GIT_ERROR_ACTION` + `isRemediableGitErrorCode` (`src/core/safety/remediation.ts:22-25,111-115,126-128`).
  `divergentBranches`/`mergeConflict` are absent → not remediable yet. Add them here; don't fork.
- **The conflict fallback already exists.** `resolve-conflicts` → Status
  (`safetyCopilotMessages.ts:75,102`; `remediation.ts:74-83`). No new conflict UI is built.
- **CRITICAL BUG:** `GitRunner.execute()` classifies only stderr, but `git merge` writes
  `CONFLICT (…)` to **stdout** (`GitRunner.ts:105-117`) — a real conflict misclassifies as
  `unknown` until stdout is fed into classification. Fix this in Phase 69 first.
- **No `merge` method exists** — `GitService` has `pull`/`push`/`fetch` only (`GitService.ts:165-199`).
  `getStatus` returns `GitStatus { files; ahead; behind }` (`GitService.ts:60-67`, `types.ts:135-141`)
  — `files.length === 0` is the clean-tree pre-check.
- **The executor forces a new case.** `executeRemediation` switches on `ExecutableAction` with a
  `default: never`; deps are `Pick<GitService, 'setLocalIdentity'|'push'|'getRemotes'>`
  (`remediationExecutor.ts:31-38,64-119`). The action enum is a `z.enum` (`ipc-schemas.ts:344-355`).
- **The transport already carries structured errors.** `IpcResult`'s error arm has
  `code?`/`remediation?` and `git:pull` returns it (`window.d.ts:56,147`; `ipc-handlers.ts:343-349`).
  `wrap()` already attaches `code`/`remediation` for a thrown `GitError` — so a failed **pull**
  already returns them; only `doPull` discards them today (`remoteStore.ts:109-128`).
- **The banner + `RemediationButton` are the reused UI.** The recovery banner renders off
  `lastFailure` and passes `remote`/`branch` from the **push** sheet's `selectedRemote` (null on a
  pull) (`RemoteScreen.tsx:377-412`); `RemediationButton` runs `remediation:execute` and labels each
  action via a switch (`RemediationButton.tsx:100-176`). Pull is invoked only from `RemoteScreen`
  (`RemoteScreen.tsx:311-331`).

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

## Phase 68 — Remediation model: make divergence & conflict remediable (pure core)

```
Work on Phase 68 of GitWarden (docs/plans/divergent-branch-merge-plan.md §"Contract changes" and §"Phase 68"). Pure core only — no IPC, no UI. Honors AGENTS.md rule #1 (pure core).

Tasks:
- Add 'merge-remote-into-local' to the SafetySuggestedAction union in src/core/ai/types.ts.
- In src/core/safety/remediation.ts:
    - Extend RemediableGitErrorCode with 'divergentBranches' and 'mergeConflict'.
    - Add 'merge-remote-into-local' to EXECUTABLE_ACTION_LIST (a local, in-app fix). This keeps NAVIGATE_TARGETS total over the remaining NavigateActions — do NOT add a navigate target for it.
    - Extend GIT_ERROR_ACTION: divergentBranches: 'merge-remote-into-local'; mergeConflict: 'resolve-conflicts'. (This makes isRemediableGitErrorCode return true for both.)
- Add ACTION_HINTS['merge-remote-into-local'] in src/core/ai/safetyCopilotMessages.ts — an in-app, plain-language description (e.g. "Bring the remote's changes into your branch with a merge, then push."). The Record<SafetySuggestedAction, string> will not compile without it.
- Extend tests/unit/remediation.test.ts: 'merge-remote-into-local' ∈ EXECUTABLE_ACTIONS; remediationForGitError('divergentBranches') === { action: 'merge-remote-into-local', kind: 'executable' }; remediationForGitError('mergeConflict') === { action: 'resolve-conflicts', kind: 'navigate', navigateTo: 'status' }; add both new codes to the "maps every RemediableGitErrorCode" list; update the EXECUTABLE_ACTIONS.size assertion.

Exit: `npx tsc --noEmit` clean on both tsconfigs; `npm test` green for the extended remediation.test.ts; src/core/ stays pure (core-purity passes); `npm run lint` clean; no IPC/UI changes.

Then run the standard progress footer.
```

---

## Phase 69 — GitRunner conflict classification + local merge (main)

```
Work on Phase 69 of GitWarden (docs/plans/divergent-branch-merge-plan.md §"Phase 69"). Main only — NO UI. Honors AGENTS.md rules #2 (GitRunner is the only executor), #3 (args arrays), #5 (no secrets logged).

Tasks:
- Fix GitRunner classification (src/main/git/GitRunner.ts:105-117): on a non-zero exit, feed stdout INTO ErrorMapper classification too (not just stderr), so stdout-only failures like git merge's "CONFLICT (…)" are classified instead of falling through to 'unknown'. Combine the streams for classification (e.g. classify against stderr plus the decoded stdout). Keep the existing secret-safe logging (the token lives only in GIT_ASKPASS env, never argv/stdout). Do NOT change the success path or the GitResult shape.
- Add GitService.mergeRemoteBranch(repoPath, remote, branch) in src/main/services/GitService.ts: run `git merge --no-edit <remote>/<branch>` (readOnly:false, args array, a timeoutMs mirroring pull/push). NO auth param — it merges the already-fetched local remote-tracking ref, so no network and no credential env. --no-edit avoids an editor prompt.
- Reconcile src/main/git/ErrorMapper.ts only if needed (it already matches /CONFLICT \(/ for mergeConflict at :110-117); the fix is primarily GitRunner feeding it the right text.

Exit: `npx tsc --noEmit` clean; an integration test (Vitest, offline real temp repo) reproduces a REAL conflicting merge (two branches editing the same line) driving mergeRemoteBranch through GitRunner and asserts the thrown error is a GitError with code 'mergeConflict' (regression proof for the stdout fix); a clean non-conflicting merge succeeds; `npm test` green; `npm run lint` clean; the safety-reviewer subagent passes (args arrays, no secret logging, no global/system state). No UI.

Then run the standard progress footer.
```

---

## Phase 70 — Executable merge remediation (IPC)

```
Work on Phase 70 of GitWarden (docs/plans/divergent-branch-merge-plan.md §"Phase 70"). Make 'merge-remote-into-local' run behind the typed + Zod-validated remediation:execute channel. Honors AGENTS.md rules #3 (args arrays), #6 (the button click IS the confirmation — no second modal, per the switch-profile-and-retry-push precedent).

Tasks:
- Add 'merge-remote-into-local' to the RemediationExecutePayload.action z.enum in src/main/ipc/ipc-schemas.ts:344-355. (ExecutableAction flows from core, so RemediationExecuteInput widens automatically.)
- Add the executor case in src/main/ipc/remediationExecutor.ts (the default: never forces it):
    - Require input.branch (refuse with a clear message if missing); remote = input.remote ?? 'origin'.
    - Clean-tree pre-check via getStatus: if status.files.length > 0, return { ok:false, message: "Commit or stash your changes before merging in the remote's changes." } WITHOUT attempting the merge.
    - Otherwise call mergeRemoteBranch(repoPath, remote, branch). On success return { ok: true }.
    - Catch a GitError with code === 'mergeConflict' → return { ok:false, remediation: remediationForGitError('mergeConflict'), message: error.userMessage } (the repo is left in the standard mid-merge state; the navigate remediation routes to Status). Re-throw any other error so wrap() classifies it.
- Extend RemediationExecutorDeps.git (remediationExecutor.ts:31-38) from Pick<GitService,'setLocalIdentity'|'push'|'getRemotes'> to also include 'getStatus' and 'mergeRemoteBranch'.

Exit: `npx tsc --noEmit` clean; integration tests (Vitest, offline real temp repo): a clean divergent merge returns ok:true and a merge commit exists; a real conflicting merge returns ok:false with remediation.action === 'resolve-conflicts' and the repo is left mid-merge (unmerged path / MERGE_HEAD present); a dirty tree returns the pre-check refusal WITHOUT attempting the merge; `npm test` green; `npm run lint` clean; the safety-reviewer subagent passes (no global state, args arrays, no secret logging). No UI.

Then run the standard progress footer.
```

---

## Phase 71 — Merge button in the failed-pull recovery banner (renderer + e2e)

```
Work on Phase 71 of GitWarden (docs/plans/divergent-branch-merge-plan.md §"Phase 71", §"Acceptance criteria"). Feature-complete stop point. This phase ends with the per-phase commit.

Tasks:
- doPull populates a structured failure (src/renderer/store/remoteStore.ts:109-128): on !res.ok, set lastFailure: { message: res.error, code: res.code, remediation: res.remediation, remote, branch } instead of throwing away the structured fields. Extend the lastFailure type (remoteStore.ts:28) to carry remote?: string and branch?: string (the banner's push path reads them from selectedRemote, which is null on a pull). Clear lastFailure at the start of a pull (as doRemotePush already does).
- Wire the merge button into the recovery banner (src/renderer/screens/RemoteScreen.tsx:377-412): source the RemediationButton's remote/branch from lastFailure.remote ?? selectedRemote?.name and lastFailure.branch ?? currentBranch so it works for a pull-triggered failure. The divergentBranches remediation (executable) produces the merge button.
- Add the 'merge-remote-into-local' label case to RemediationButton's executable switch (src/renderer/components/RemediationButton.tsx:100-176) — a STR.REMEDIATION_MERGE_REMOTE(remote, branch)-style label; make the missingTarget guard require repoPath + remote + branch for this action.
- Conflict re-diagnosis: the executor's conflict result flows through onFailure → setLastFailure, re-rendering the banner as a "Go to Status" navigate link. On a clean merge, onSuccess clears messages and reloads; the user then clicks the existing Push button (no auto-push).
- Externalize all new copy in src/renderer/strings.ts (REMEDIATION_MERGE_REMOTE, any merge-banner labels). No hard-coded user-facing strings.

Exit (Playwright e2e, offline fixtures + local bare remote, reuse the remote.spec harness):
- a genuinely diverged branch with a clean tree → Pull shows the recovery banner with a merge button; clicking it merges cleanly, the banner clears, and a subsequent Push succeeds to the bare remote
- a conflicting divergence (both sides edit the same line) → clicking the merge button re-diagnoses to a "Go to Status" link; following it lands on Status with the file shown as unmerged/conflicted
- (if cheap) a dirty working tree → the fix refuses with the clean-tree message and does not merge
- `npm test`, `npm run e2e`, `npm run lint` all green; no hard-coded user-facing strings.

Then run the standard progress footer. This is the feature-complete stop point for Diverged-Branch Merge (68–71).
```
