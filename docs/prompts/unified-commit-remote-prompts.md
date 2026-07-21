# GitWarden — Unified Commit & Remote Phase Prompts

Copy-paste prompts to drive the **Unified Commit & Remote** feature one phase at a time. Each
prompt is self-contained, points at the plan in `docs/plans/unified-commit-remote-plan.md`, and
**ends with the standard progress footer** that records progress in `docs/progress-log.md`. Rules
live in `CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (114 → 116). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Phase 114 is the pure-logic checkpoint;
Phase 116 is the renderer/e2e feature-complete stop point. One commit per phase; the progress-log
entry written **before** the commit.

**Prerequisites / offline note:** no network. Vitest runs pure-core suites; Playwright uses real
git fixture repos in a temp dir with a **local bare repo as the push remote**. The e2e suite is
long — run it chunked per spec file rather than one monolithic run.

**Product boundary (do not cross):** staging/unstaging stays on the Status tab. Push never
executes without the explicit Confirm (AGENTS.md #6). Commit & Push chains the _existing_ commit
and push behaviors only — no `--force`, no auto-pull, no upstream-creation changes, and a failed
push never re-commits or rolls the commit back. Core `NavTarget` / remediation contracts and all
IPC channels stay untouched.

Background facts (already verified against the tree — don't re-litigate):

- `CommitScreen.tsx` and `RemoteScreen.tsx` are parallel siblings: each loads its own store on
  mount keyed to the active repo/branch; `commitStore.load` fetches status + identity + staged
  diffs, `remoteStore.load` fetches remotes + status + identity. Both stores survive the merge
  unchanged — this is a screen merge, not a store rewrite.
- All gates are already pure core: `safetyCheckService.checkCommit` and `checkPush`
  (`src/core/safety/SafetyCheckService.ts`), including the `GitHubPushContext` token checks and
  the Phase-100 outgoing-authorship gate. The push sheet withholds its verdict while the token
  check (`github.getPushContext`) or the outgoing-commits fetch (`git.getOutgoingCommits`) is
  pending, and disables Confirm until both land.
- The renderer owns the nav mapping: core `NavTarget` keeps `'commit'`/`'remote'` and the renderer
  maps them (`src/core/safety/remediation.ts`). Nav seams: `NAV_ORDER` + the screen `switch` in
  `App.tsx`, `NAV_ITEMS` in `Sidebar.tsx` (test ids are `nav-${screen}`), `NavScreen` in
  `appStore.ts`, `NAV_COMMIT`/`NAV_REMOTE` in `strings.ts`, two tour steps in
  `OnboardingTour.tsx`, and `navigate('commit')` callers in `RepositoriesScreen.tsx` (Initialize
  lands on Commit) and `chatBlocks/CommitDraftCard.tsx`.
- Screens unmount on tab switch (plain `switch` in `App.tsx`), so operation outcomes and any
  in-flight flow state must live in Zustand stores — the Phase-102 precedent (`committedHash` in
  commitStore; `successMessage`/`lastFailure` in remoteStore) survives same-repo refreshes.
- Push/pull failures already produce a structured `lastFailure` (code + remediation) rendered as
  the recovery banner with a one-click fix. The partial-failure path reuses it.
- No new IPC: `git.commit/push/pull/fetch/getRemotes/getStatus/getEffectiveIdentity/
getStagedDiffs/getOutgoingCommits` and `github.getPushContext` all exist.
- e2e specs referencing the two tabs: `commit`, `remote`, `github-push-safety`, `push-policy`,
  `wrong-author-push`, `remediation`, `onboarding`, `shell`, `rapid-switch-staleness`,
  `repositories-init`, `ai-commit-assistant`, `ai-change-review`, `ai-chat-panel`, `branches`,
  `safety-center` (all `tests/e2e/*.spec.ts`). Keep `nav-commit`, `screen-commit`, and every inner
  control id stable; only `nav-remote`/`screen-remote` navigation changes.

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

## Phase 114 — Commit & Push core: push target, combined gate, flow model (pure core)

```
Work on Phase 114 of GitWarden (docs/plans/unified-commit-remote-plan.md §"Phase 114 — Commit & Push core: push target, combined gate, flow model (pure core)"). Pure core only — no IPC, no UI, no Electron/fs/child_process/DOM imports (AGENTS.md #1).

Tasks:
- Add src/core/commitAndPush/pickPushTarget.ts exporting PushTarget and pickPushTarget(remotes, upstream) exactly as the plan's contract defines. Parse the remote name from GitStatus.upstream's 'origin/main' form; precedence: upstream's remote → 'origin' → the only remote → {kind:'choice-required', candidates} → {kind:'none'}. An upstream naming a remote absent from `remotes` falls through to the next rule.
- Add src/core/commitAndPush/gate.ts exporting CommitAndPushGateInput, CommitAndPushVerdict, and checkCommitAndPush(input) composing safetyCheckService.checkCommit + checkPush. Build the hypothetical outgoing list as existingOutgoing + [{authorName: identity.userName, authorEmail: identity.userEmail}] so the Phase-100 authorship gate fires BEFORE the commit exists. While existingOutgoing is undefined, the push verdict is null and canCommitAndPush is false (withheld, mirroring the push sheet's pending semantics).
- Add src/core/commitAndPush/flow.ts exporting CommitAndPushFlowState, CommitAndPushFlowEvent, and reduceCommitAndPushFlow per the plan's contract. Invariants: 'pushing' is reachable only through 'committing'; 'cancel' is a no-op outside 'confirming'; 'push-failed' and 'done' both retain committedHash; illegal events leave state unchanged. No timers, randomness, or side effects.
- Add Vitest suites under tests/unit/commitAndPush/: the target-precedence table (zero/one/many remotes, gone upstream, no origin), gate composition (commit blocker blocks all; push blocker blocks all; wrong-identity hypothetical commit blocks; withheld verdict while loading), and the full flow-transition table including every illegal event.

Exit: npx tsc --noEmit clean for both tsconfigs; npm test green including the new suites; npm run lint clean; core-purity passes on src/core/commitAndPush/** (no forbidden imports).

Then run the standard progress footer.
```

---

## Phase 115 — One "Commit & Push" tab replacing Commit and Remote (renderer + e2e)

```
Work on Phase 115 of GitWarden (docs/plans/unified-commit-remote-plan.md §"Phase 115 — One "Commit & Push" tab replacing Commit and Remote (renderer + e2e)"). Renderer + e2e; no core or IPC changes. Begin only after Phase 114's progress-log gate is ✅. This phase merges the screens — it does NOT add the Commit & Push button (that is Phase 116).

Tasks:
- Add src/renderer/screens/CommitPushScreen.tsx merging the two screens' sections in journey order: staged summary → commit message + AI draft → commit safety issues + remediations → Commit button → Remotes section (Fetch/Pull/Push cards) → success/recovery banners → the push confirmation sheet (details rows, GitHub line, BranchAccessBlock, issues, remediations, pending-withheld Confirm). Port the JSX from CommitScreen.tsx and RemoteScreen.tsx faithfully, then delete both old files.
- Keep ALL existing inner data-testids (commit-btn, commit-message, commit-staged-summary, commit-safety-issues, remote-op-fetch/pull/push, remote-push-sheet, remote-push-confirm-btn, remote-push-cancel-btn, remote-recovery-banner, remote-success, …) and keep the section test id screen-commit. One mount effect fires useCommitStore.load and useRemoteStore.load in parallel; both stores stay unchanged.
- Merge the remediation filters: the unified screen skips a navigate-remediation targeting 'commit' OR 'remote' (replacing the two per-screen skips).
- Nav consolidation: canonical id stays 'commit'. In appStore's navigate(), normalize 'remote' → 'commit' (NavScreen keeps both members so core NavTarget mapping stays valid). Remove 'remote' from NAV_ORDER in App.tsx; make both switch cases render CommitPushScreen; collapse Sidebar NAV_ITEMS to one item {screen:'commit', icon:'commit', label: STR.NAV_COMMIT_PUSH}.
- Strings: add NAV_COMMIT_PUSH: 'Commit & Push'; retire NAV_COMMIT/NAV_REMOTE usages; merge the onboarding tour's commit + remote steps (OnboardingTour.tsx) into one step on the unified tab with merged title/body strings; keep all user-facing strings externalized in strings.ts.
- Update the e2e specs that navigate via nav-remote/screen-remote (remote, github-push-safety, push-policy, wrong-author-push, remediation, rapid-switch-staleness, plus any other hit) to navigate via nav-commit/screen-commit; adjust shell.spec.ts nav-count/shortcut expectations and onboarding.spec.ts step expectations. Remote-flow behavioral assertions stay identical.

Exit: npx tsc --noEmit clean for both tsconfigs; npm test green; npm run lint clean; npm run e2e green across the updated specs (run chunked per spec file); the commit path AND the fetch/pull/push path are each proven reachable on the single tab by a passing spec.

Then run the standard progress footer.
```

---

## Phase 116 — The Commit & Push button with one confirmation (renderer + e2e) — feature-complete stop point

```
Work on Phase 116 of GitWarden (docs/plans/unified-commit-remote-plan.md §"Phase 116 — The Commit & Push button with one confirmation (renderer + e2e)"). Renderer + e2e; feature-complete stop point. Begin only after Phase 115's progress-log gate is ✅.

Tasks:
- Add src/renderer/store/commitAndPushStore.ts holding CommitAndPushFlowState in the store (screens unmount on tab switch — flow state must survive) and driving it exclusively through reduceCommitAndPushFlow. On 'confirm': run useCommitStore.getState().doCommit(message); only on success run useRemoteStore.getState().doRemotePush(remoteName, branch). Reuse both stores' outcome machinery untouched; never roll back or re-create a commit.
- Add the Commit & Push button next to Commit Changes on CommitPushScreen. Resolve its target with pickPushTarget(remotes, upstream); disable with a plain tooltip when kind is 'none' or there is no current branch. Clicking opens the pre-flight sheet, which kicks off the same verification the push sheet does (github.getPushContext for HTTPS GitHub remotes + git.getOutgoingCommits) and renders the Phase-114 combined verdict: details rows, GitHub line, Branch Access block, the UNION of commit and push issues with their remediations, and a Confirm disabled until canCommitAndPush is true and nothing is pending.
- For {kind:'choice-required'}, render a remote picker inside the sheet with nothing preselected; Confirm stays disabled until a remote is chosen.
- Execution UX: Confirm closes the sheet and shows per-stage progress ('Committing…' → 'Pushing…'). 'done' shows one success confirmation naming the short hash and remote. 'commit-failed' shows the commit error and states nothing was pushed. 'push-failed' keeps the '✓ Committed <hash>' confirmation visible AND routes the failure through remoteStore.lastFailure so the existing recovery banner offers the one-click fix; any retry from there pushes only.
- Externalize every new user-facing string in strings.ts (button label, sheet title, per-stage progress, combined-success, partial-failure copy). Never log tokens or secrets (AGENTS.md #5).
- Add tests/e2e/commit-and-push.spec.ts (offline, temp git fixture with a local bare repo as the remote): happy path (one Confirm → the commit exists in the bare remote); blocked path (identity mismatch disables Confirm and shows the union verdict); partial-failure path (make the bare remote non-fast-forward first → commit exists locally, recovery banner appears, '✓ Committed' survives); cancel path (Cancel leaves the working repo and remote untouched).

Exit: npx tsc --noEmit clean for both tsconfigs; npm test green; npm run lint clean; npm run e2e green including tests/e2e/commit-and-push.spec.ts (run chunked); the push runs only after the explicit Confirm (AGENTS.md #6).

Then run the standard progress footer.
```
