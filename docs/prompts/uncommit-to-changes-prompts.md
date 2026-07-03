# GitWarden — Uncommit to Working Changes Phase Prompts

Copy-paste prompts to drive the **Uncommit to Working Changes** feature one phase at a time. Each
prompt is self-contained, points at the plan in `docs/plans/uncommit-to-changes-plan.md`, and **ends
with the standard progress footer** that records progress in `docs/progress-log.md`. Rules live in
`CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (76 → 79). Don't start a phase until the previous phase's entry
in `docs/progress-log.md` shows Exit criteria ✅. Phases 76–78 are the logic-complete checkpoint
(green Vitest, no UI); Phase 79 is the feature-complete stop point (renderer + Playwright). One
commit per phase; the progress-log entry written **before** the commit.

**Prerequisites / offline note:** No network. Tests use real git fixtures in a temp dir with a local
**bare** repo as the remote, so the pushed/unpushed distinction is real.

Background facts (already verified against the tree — don't re-litigate):

- `GitService.getCommitsAhead` runs `git log <remote>/<branch>..HEAD` and falls back to full history
  when the tracking ref doesn't exist (GitService.ts:309-321) — reuse its range for the unpushed
  count; its fallback is why "return all unpushed" is disabled with no upstream.
- **No `reset` method exists** in `GitService` today; add one narrow `resetMixed`.
- The reset target is **`HEAD~N`** (N=1 for "last", N=ahead for "all") — not the upstream ref — so
  it stays correct under divergence and never crosses a pushed commit.
- `git reset --mixed` returns the commit's content as **unstaged** working-tree changes, which the
  existing Status screen renders via `getStatus` (GitService.ts:60-67, types.ts:135-141).
- The clean-tree refusal has an exact precedent: the merge executor refuses when
  `getStatus(...).files.length > 0` (remediationExecutor.ts:118-130).
- This is **user-initiated**, so it gets **dedicated `history:*` channels** shaped like the plain
  `git:commit` handler (ipc-handlers.ts:314-319, ipc-schemas.ts:65-68, preload/index.ts:163-164,
  window.d.ts:143) — it does **not** extend the `remediation.ts` `ExecutableAction` model.
- The inline two-step confirm is the house pattern and distinguishes reversible from irreversible via
  `extraAction.danger` (StatusScreen.tsx:107-113, 239-254; strings.ts:153-167). This op is
  reversible → use the **plain** (non-`danger`) confirm.
- `appStore` has `navigate('status')` and a `NavScreen` union with `'status'`/`'history'`
  (appStore.ts:29-35, 54, 73).

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

## Phase 76 — Uncommit eligibility model (pure core)

```
Work on Phase 76 of GitWarden (docs/plans/uncommit-to-changes-plan.md §"Phase 76"). Pure core only — no IPC, no UI, no child_process/fs/electron/DOM.

Tasks:
- Add src/core/history/uncommit.ts with the types UncommitContext, UncommitRefusal, UncommitEligibility and the pure function evaluateUncommit(ctx) exactly as sketched in the plan's "The new contract (pure core)" section.
- Encode the decision matrix: global refusals (detachedHead / inProgressOp / dirty tree) block BOTH actions; canReturnLast requires unpushedCount ≥ 1 && !headIsMerge && !headIsRoot; canReturnAllUnpushed additionally requires hasUpstream && !rangeHasMerge; set refusals.last / refusals.all to the matching enum when blocked; returnAllCount = unpushedCount.
- Keep human copy OUT of core — the function returns the UncommitRefusal enum; the renderer maps it to a string later.
- Add tests/unit/uncommit.test.ts covering the full matrix (see the phase's Exit criteria for the exact cases: single unpushed, 3 unpushed, 0 unpushed, dirty tree, root, merge HEAD, no-upstream → last-only, merge-in-range, detached, in-progress).

Exit: npx tsc --noEmit clean on both tsconfigs; npm test green for uncommit.test.ts; src/core/ stays pure (core-purity reviewer/hook passes); npm run lint clean; no IPC/UI changes.

Then run the standard progress footer.
```

---

## Phase 77 — GitService: reset + unpushed/state gathering (main)

```
Work on Phase 77 of GitWarden (docs/plans/uncommit-to-changes-plan.md §"Phase 77"). Main/service layer only — no UI. Honor AGENTS.md rules #2 (GitRunner is the only executor), #3 (args arrays), #5 (no secrets logged).

Tasks:
- Add GitService.getUnpushedCount(repoPath, remote, branch): reuse the getCommitsAhead <remote>/<branch>..HEAD range (GitService.ts:309-321) to return the count, and reuse its no-tracking-ref detection to also report hasUpstream=false.
- Add GitService.getUncommitContext(repoPath): assemble an UncommitContext with READ-ONLY GitRunner calls — getStatus (clean-tree flag), rev-list --parents -n 1 HEAD (headIsMerge), HEAD~1 resolution (headIsRoot), symbolic-ref -q HEAD (detachedHead), rev-parse --verify -q MERGE_HEAD + rebase/cherry-pick refs (inProgressOp), getUnpushedCount (unpushedCount/hasUpstream), rev-list --merges HEAD~<n>..HEAD (rangeHasMerge).
- Add GitService.resetMixed(repoPath, target): run ['reset', '--mixed', target] with readOnly:false. Callers pass `HEAD~${n}` where n is a validated positive integer — never free-form text; args stay an array.
- Do not change commit/push/pull behavior.

Exit: npx tsc --noEmit clean; integration tests (Vitest, offline real temp repo + a local bare repo as the "remote") — getUnpushedCount correct before/after a push; resetMixed('HEAD~1') returns the commit's content as UNSTAGED changes (status shows files, ahead drops by 1); resetMixed('HEAD~3') collapses three unpushed commits; getUncommitContext booleans correct for merge HEAD / root / no-upstream repos; npm test green; npm run lint clean; the safety-reviewer subagent passes (args arrays, no secrets logged, no global/system state). No UI.

Then run the standard progress footer.
```

---

## Phase 78 — Return-commit executor + IPC (main + IPC)

```
Work on Phase 78 of GitWarden (docs/plans/uncommit-to-changes-plan.md §"Phase 78"). Main + IPC only — no UI. Honor AGENTS.md rules #3 (args arrays) and #6 (the explicit click + inline confirm is the confirmation; the op is reversible so no extra irreversible gate).

Tasks:
- Add src/main/ipc/uncommitExecutor.ts, injectable and unit-testable like remediationExecutor.ts (remediationExecutor.ts:31-52), with a narrow Pick<GitService, 'getUncommitContext' | 'getUnpushedCount' | 'resetMixed' | 'getRemotes'> dep. Expose:
  - getReturnState(deps, {repoPath, remote?, branch?}) → { eligibility, unpushedCount } (getUncommitContext + evaluateUncommit).
  - returnLastCommit(...) → eligibility/clean-tree guard, then resetMixed('HEAD~1').
  - returnUnpushed(...) → guard, then resetMixed('HEAD~'+count).
  Refusals return { ok:false, message } (map the UncommitRefusal enum to a plain string); a genuine git error re-throws so wrap() classifies it.
- Add Zod payloads in ipc-schemas.ts: UncommitReturnPayload = z.object({ repoPath, remote?, branch? }); reuse the GitRepoPathPayload shape (ipc-schemas.ts:55) for the read.
- Register three wrap(...) handlers in ipc-handlers.ts alongside the git block, copying the git:commit shape (ipc-handlers.ts:314-319): history:getReturnState, history:returnLastCommit, history:returnUnpushed.
- Add the bridge methods in preload/index.ts (mirror preload/index.ts:163-187) under a `history` namespace, and their types in src/renderer/types/window.d.ts.

Exit: npx tsc --noEmit clean; integration tests (Vitest, offline real temp repo + local bare remote) — returnLastCommit on a clean single-unpushed repo → ok:true + files unstaged + getReturnState then reports nothing unpushed; returnUnpushed with 3 ahead → one unstaged set; a pushed HEAD (ahead 0) → getReturnState disables both AND the executor refuses 'nothing-unpushed' WITHOUT resetting; dirty tree → refusal without reset; root + merge HEAD → their refusals; no-upstream → last allowed, all refused; npm test green; npm run lint clean; the safety-reviewer subagent passes. No UI.

Then run the standard progress footer.
```

---

## Phase 79 — History screen: markers + return actions (renderer + e2e)

```
Work on Phase 79 of GitWarden (docs/plans/uncommit-to-changes-plan.md §"Phase 79"). Renderer + e2e — the feature-complete stop point.

Tasks:
- historyStore (historyStore.ts:1-60): after loading commits, call window.api.history.getReturnState(...) and keep eligibility + unpushedCount (and which top commits are unpushed) in state; add returnLast() / returnAllUnpushed() actions that call the bridge and, on success, clear state, reload, and trigger navigation to Status.
- HistoryScreen (HistoryScreen.tsx:113-160): render an "unpushed" marker on commits not yet on the remote; show "Return last commit" on the top commit when eligibility.canReturnLast, and "Return all N unpushed commits" when canReturnAllUnpushed && N > 1; when refused, show the mapped plain-language reason instead of the button. Use the PLAIN inline two-step confirm (the non-danger path, StatusScreen.tsx:107-113, 239-254) with reassuring copy ("Your changes stay in your working area — nothing is deleted"). On success show a brief success note and navigate('status') (appStore.ts:54, 73).
- Strings: externalize ALL new copy in src/renderer/strings.ts — action labels, confirm prompt/confirm/cancel, the reassurance line, the success line, and one string per UncommitRefusal. Copy is English (consistent with the existing STR table). No hard-coded user-facing strings.

Exit (Playwright e2e, offline fixtures + local bare remote): a repo with one unpushed commit + clean tree → marked unpushed + "Return last commit"; click → confirm → lands on Status with the commit's files shown as UNSTAGED, and History no longer marks it unpushed; a repo with three unpushed commits → "Return all 3 unpushed commits" collapses them; a pushed commit → no action offered; a dirty tree → refused with the clean-tree message (no reset). npm test, npm run e2e, npm run lint all green; no hard-coded user-facing strings.

Then run the standard progress footer.
```
