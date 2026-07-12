# GitWarden — QA Fixes Phase Prompts

Copy-paste prompts to drive the **QA Fixes** feature one phase at a time. Each prompt is
self-contained, points at the plan in `docs/plans/qa-fixes-plan.md`, and **ends with the standard
progress footer** that records progress in `docs/progress-log.md`. Rules live in `CLAUDE.md` /
`AGENTS.md`.

**How to use:** run prompts in order (98 → 105). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Phases 98–99 are core/gate logic (Vitest
only); Phase 100 adds the first Playwright spec; Phase 105 is the feature-complete stop point with
the full regression sweep. One commit per phase; the progress-log entry written **before** the
commit.

**Prerequisites / offline note:** No network. All tests use real git fixture repos created in a
temp dir (local bare repo as the "remote" where needed) — same conventions as the existing
integration/e2e suites. Run e2e in chunks (the full suite exceeds 10 minutes). The source findings
are the three July-2026 QA reports; the in-repo technical record is
`docs/investigations/qa-run-2026-07-12.md` — the plan maps every finding to its phase.

Background facts (already verified against the tree — don't re-litigate):

- `EMAIL_MISMATCH` is `'warning'` (`src/core/safety/safetyMessages.ts:9`); `collectIdentityIssues`
  compares only `userEmail` (`src/core/safety/SafetyCheckService.ts:75-84`); there is no
  `NAME_MISMATCH` in the `SafetyCode` union (`:17-42`). `checkCommit`/`checkPush` run **in the
  renderer** (pure core client-side: `src/renderer/screens/CommitScreen.tsx:64`,
  `src/renderer/screens/RemoteScreen.tsx:78`).
- `STAGED_SECRET_DETECTED` is catalogued as a blocker with a per-file message helper
  (`safetyMessages.ts:21`, `:66-71`) but nothing emits it. The deterministic scanner exists in
  pure core: `scanDeterministicFindings`/`findSecretMatches` (`src/core/ai/changeReview.ts:161-172`,
  `:127-155`). A per-file staged diff IPC exists: `git:getDiff` (`preload/index.ts:170-171`,
  `src/main/ipc/ipc-handlers.ts:318-321`).
- `GitService.getCommitsAhead` already returns `authorName`/`authorEmail` per commit
  (`src/main/services/GitService.ts:548`, `:587-588`; `src/core/types.ts:177-178`) but **no IPC
  channel exposes it**. The push sheet renders "✓ Identity check passed — safe to push."
  (`RemoteScreen.tsx:590`) without ever looking at outgoing commits.
- `RepoWatcherService` watches the FILES `.git/HEAD` and `.git/index` via `fs.watch(file)`
  (`src/main/services/RepoWatcherService.ts:105-112`, `:148-152`) — git rename-replaces them, so
  each watcher dies after its first event. The recursive `refs/` watch (`:94-101`) survives and
  masks it. `.git/config` is not watched.
- Watcher events route into `refreshActiveRepo` (`src/renderer/App.tsx:377` →
  `src/renderer/store/refreshActiveRepo.ts:32-81`), whose store `load()`s hard-reset transient
  outcome state: `remoteStore.load` resets `successMessage`/`lastFailure`
  (`src/renderer/store/remoteStore.ts:72-87`), `branchStore.load` resets
  `successMessage`/`mergeConflict`/`switchError` (`src/renderer/store/branchStore.ts:82-94`).
  A failed pull's own fetch phase fires the watcher → its banner is ALWAYS wiped on attempt one.
  `doFetch` already hand-works around this same wipe (`remoteStore.ts:131-144`).
- `GitRunner.buildEnv` sets `GIT_CONFIG_NOSYSTEM: '1'` + `GIT_TERMINAL_PROMPT: '0'`
  (`src/main/git/GitRunner.ts:174-180`), hiding the system-scoped macOS keychain helper;
  the resulting `could not read Username` is lumped into `authenticationFailed` whose copy blames
  an expired/revoked token (`src/main/git/ErrorMapper.ts:49-61`). No pattern exists for "Your
  local changes … would be overwritten" → falls to `unknown` (`:213-218`).
- The reconnect remediation returns a device code (`src/main/ipc/remediationExecutor.ts:87-91`)
  and `RemediationButton` renders it (`src/renderer/components/RemediationButton.tsx:174`,
  `:206-210`) but fires `onSuccess` immediately after (`:175`), which can unmount the panel.
  `ConnectGitHubModal` is mounted by `ProfilesScreen.tsx` and `App.tsx`.
- The `/push-brief` chat command builds its payload WITHOUT the `github` block
  (`src/renderer/store/aiChatStore.ts:456-471`); `PushBriefService` defaults
  `hasToken: input.github?.hasToken ?? false` (`src/main/ai/PushBriefService.ts:62-70`). Token
  facts are resolvable in main (`src/main/ipc/GitHubAuthCoordinator.ts:164-177`).
- `applyProposal` sends `fileEdits` unchecked and reports
  `Applied ${writtenFiles.length} file edit(s)` — "Applied 0 file edit(s)" is a real observed
  output (`aiChatStore.ts:174-228`).
- Polish anchors: the chat suggestion popup consumes Enter (`AiChatPanel.tsx:471`); profile
  validation has one catch-all "… are required." message (`ProfilesScreen.tsx:170`); the
  "Merge commits …" and "Unrestricted" strings live in `src/renderer/strings.ts`; tooltips render
  through `TooltipLayer.tsx`; main has a `Logger` service (`src/main/services/Logger.ts`).

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

## Phase 98 — Identity gate: name check + mismatch blocks commit

```
Work on Phase 98 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 98"). Pure core + renderer strings only — no IPC changes, no new UI surfaces.

Context: QA proved a commit authored eleken-git <marketing@eleken.co> sails through with a soft ⚠ and reaches GitHub (evidence commit 97a09a9). The author NAME is never checked at all.

Tasks:
- Add NAME_MISMATCH to the SafetyCode union (src/core/safety/SafetyCheckService.ts:17-42) with a plain-language message and 'blocker' severity in src/core/safety/safetyMessages.ts; in collectIdentityIssues (SafetyCheckService.ts:75-84) compare identity.userName !== activeProfile.gitAuthorName alongside the email check.
- Promote EMAIL_MISMATCH from 'warning' to 'blocker' (safetyMessages.ts:9). EMAIL_FROM_GLOBAL_ONLY stays a warning.
- Extend the remediation mapping (src/core/safety/remediation.ts) so NAME_MISMATCH resolves to set-local-identity, same as EMAIL_MISMATCH/IDENTITY_UNSET — the executor already writes both name and email with --local only (AGENTS.md #4).
- No new UI: CommitScreen, Safety Center, and the header Guard badge already render blockers and the one-click fix; add any new user-facing strings to src/renderer/strings.ts. Verify the badge flips to Blocked on a name-only mismatch (its check now returns a blocker).
- Vitest: name-only mismatch → NAME_MISMATCH blocker; email-only → EMAIL_MISMATCH blocker; both → both issues; matching identity → clean; remediation mapping covers the new code; canCommit false on mismatch. Update any existing tests that assumed warning-severity mismatches (there will be several — fix their expectations, not the gate).

Exit: npx tsc --noEmit clean (both tsconfigs); npm test green including new + updated safety tests; core-purity passes; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 99 — Secret scan runs at the commit gate

```
Work on Phase 99 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 99"). Core + main + IPC + renderer wiring. Gate: Phase 98's progress-log entry shows Exit criteria ✅.

Context: STAGED_SECRET_DETECTED is catalogued as a blocker (safetyMessages.ts:21) but nothing emits it — QA committed an AWS key pair + GitHub PAT with zero objections. The deterministic scanner already exists and works inside AI /review.

Tasks:
- Pure core: checkCommit (src/core/safety/SafetyCheckService.ts:252-266) gains an optional stagedDiffs: { path: string; diff: string }[] input. When present, scan ADDED lines per file with findSecretMatches — reuse the exact mechanics of scanDiffContent (src/core/ai/changeReview.ts:127-155); one ruleset, no parallel pattern table — and emit one STAGED_SECRET_DETECTED blocker per offending file using stagedSecretMessage(file) (safetyMessages.ts:66-71). The issue carries file + rule label only — never the matched content (AGENTS.md #5).
- Main + IPC: new git:getStagedDiffs(repoPath) bulk channel returning { path, diff }[] for staged files, built on the same GitService.getDiff internals as the per-file channel (src/main/ipc/ipc-handlers.ts:318-321); Zod payload/result in ipc-schemas.ts; preload bridge method + window.d.ts.
- Renderer: CommitScreen fetches staged diffs when the staged file set changes and passes them into checkCommit (CommitScreen.tsx:64). The blocker renders in the existing issues list — no new UI surface.
- Vitest: planted AWS key pair + GitHub PAT fixtures → blocker naming the right file; clean staged diff → no issue; secret only in an UNSTAGED file → no issue; integration test for the new channel on a fixture repo.

Exit: npx tsc --noEmit clean; npm test green including the new gate + channel tests; core-purity passes; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 100 — Push verifies outgoing authorship + truthful push-identity copy

```
Work on Phase 100 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 100"). Core + main + IPC + renderer + e2e. Gate: Phase 99 ✅.

Context: the push sheet says "✓ Identity check passed — safe to push." (RemoteScreen.tsx:590) while never inspecting the commits being pushed — an already-wrong commit passes even after the config is fixed. GitService.getCommitsAhead already parses authorName/authorEmail (GitService.ts:548, :587-588) but no IPC exposes it.

Tasks:
- Pure core: checkPush (src/core/safety/SafetyCheckService.ts:268-313) gains an optional outgoingCommits: { authorName: string; authorEmail: string }[] input; any commit whose author doesn't match the ASSIGNED profile's gitAuthorName/gitAuthorEmail emits a new OUTGOING_WRONG_AUTHOR blocker. Message names the offending author + count. Remediation is explain-only (return the commit via History's uncommit, fix identity, re-commit) — NEVER an automatic history rewrite.
- Main + IPC: new git:getOutgoingCommits(repoPath, remote, branch) channel exposing getCommitsAhead (Zod schemas, preload, window.d.ts).
- Renderer: the push confirmation sheet fetches the outgoing range for the selected remote/branch and passes it into checkPush (RemoteScreen.tsx:78); Confirm stays disabled on the blocker. Reword the passed-verdict line (:590) to state what was actually verified (config identity, token account, outgoing authors). Give aiChatStore's pre-push check the same input where it already runs checkPush (aiChatStore.ts:405).
- Copy truth: GITHUB_ACCOUNT_MISMATCH's message (safetyMessages.ts:43-44) must name the actual source of the expected login (linked profile vs policy expectation) instead of always blaming the assigned profile.
- Playwright spec (fixture repo + local bare remote): commit authored by a wrong identity → push sheet shows the OUTGOING_WRONG_AUTHOR blocker with Confirm disabled; return the commit, re-commit with the right identity → push passes.
- Vitest: wrong author in range → blocker; all authors match → clean; empty range → clean; mixed → blocker naming the wrong one.

Exit: npx tsc --noEmit clean; npm test green; npm run e2e green for the new wrong-author spec (run e2e chunked); core-purity passes; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 101 — Rename-proof `.git` watching + `config` coverage

```
Work on Phase 101 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 101"). Main + small renderer routing. Gate: Phase 100 ✅.

Context: fs.watch on the FILES .git/HEAD and .git/index follows the inode; git rename-replaces them, so each watcher dies after its first event (QA repro: 3 rename-rewrites → exactly 1 event; plain `git checkout <existing>` invisible from the second switch on). .git/config — the identity-guard app's most important file — isn't watched at all.

Tasks:
- In src/main/services/RepoWatcherService.ts, replace the two watchFileIfExists calls for HEAD and index (:105-112, :148-152) with ONE non-recursive fs.watch on the .git DIRECTORY, filtering the event filename: 'HEAD' → 'head', 'index' → 'index', 'config' → new 'config' kind, 'packed-refs' → 'refs'. A directory watch reports rename-replaced entries by name — git's *.lock + rename() pattern can no longer kill it. Keep the recursive refs/ watch + stat-poll fallback (:94-101) unchanged. Keep the 400 ms debounce and one-repo-at-a-time contract.
- Extend RepoChangeKind with 'config' end-to-end: RepoChangedEventPayload in ipc-schemas.ts, preload event bridge, window.d.ts.
- Renderer routing: in App.tsx's repo:changed subscription (App.tsx:377), route 'config' to a refresh of the header guard + the active screen's identity-bearing store (reuse refreshActiveRepo — a 'full' is acceptable if a narrower path adds complexity; the request guard makes redundant refreshes harmless).
- Integration tests (offline fixture repo): (a) the QA minimal repro becomes the regression test — three atomic rename-rewrites of .git/HEAD produce THREE events (the old file-watch produced one); (b) three real `git switch`es between existing branches each fire 'head'; (c) `git config user.email x@y.z` fires 'config'; (d) unwatch stops events; no watcher leaks.

Exit: npx tsc --noEmit clean; npm test green including the rename-proof watcher tests; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 102 — Operation outcomes survive refreshes + success confirmations

```
Work on Phase 102 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 102"). Renderer only. Gate: Phase 101 ✅.

Context: any operation that touches .git fires the watcher; ~400 ms later refreshActiveRepo runs the stores' load()s, which hard-reset successMessage/lastFailure (remoteStore.ts:72-87) and successMessage/mergeConflict/switchError (branchStore.ts:82-94) — wiping the very banner the operation just posted. Deterministic worst case: a failed pull's banner ALWAYS dies on the first attempt (its own fetch phase fires the refs event) and survives only on retry. The same wipe silently discards the "Bring changes & switch" pop-conflict outcome (leaving an invisible orphaned stash) and usually eats push/merge success toasts. Commit, merge and uncommit currently confirm nothing at all.

Tasks:
- Split "operation outcome" state from "loaded data" state: successMessage, lastFailure, switchError, mergeConflict, and the stash-pop-conflict outcome are NO LONGER reset by load() when it refreshes the SAME repo — they reset only on a repo-path change, an explicit user dismiss, or the start of a new operation. Touch points: remoteStore.load (remoteStore.ts:72-87), branchStore.load (branchStore.ts:82-94). Preserve Phase 89's repo-switch hygiene: outcomes still clear when the repo changes. Pick the lighter design (per-store fields with repo-keyed reset vs one shared outcome slice) and note the choice in the progress log.
- Delete doFetch's now-unneeded ordering workaround for its own success message (remoteStore.ts:131-144) once outcomes survive — its comment documents the exact wipe being fixed.
- Surface the "Bring changes & switch" pop-conflict outcome persistently: landing on Status shows a banner explaining the conflict AND naming the kept stash entry (no more bare "!" rows with invisible leftover state).
- Success confirmations: commit, merge, and uncommit set a visible "✓ done" outcome through the same surviving mechanism, consistent with the existing "Fetched from origin." style. Strings in strings.ts.
- Vitest (the QA scenario as a test): post a pull failure into the store, then run the same-repo load() a watcher event would trigger → the failure banner SURVIVES; switch repo → it clears. Same-shape tests for switch/merge/uncommit/commit outcomes and the stash banner.

Exit: npx tsc --noEmit clean; npm test green including the banner-survival tests; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 103 — Honest failure copy + reconnect shows its code

```
Work on Phase 103 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 103"). Main + renderer. Gate: Phase 102 ✅.

Context: GIT_CONFIG_NOSYSTEM=1 + GIT_TERMINAL_PROMPT=0 (GitRunner.ts:174-180) hide the system keychain helper on stock macOS, so an HTTPS push with no stored token fails with `could not read Username` — which ErrorMapper lumps into authenticationFailed, whose copy claims "the token may be … expired, or revoked" (ErrorMapper.ts:49-61). A dirty-tree branch switch falls to `unknown` → "An unexpected Git error occurred." And the push-sheet "Reconnect GitHub" opens the browser while its device code renders in a panel that can unmount immediately (RemediationButton.tsx:174-175, :206-210) — the user faces GitHub's "enter your code" page with nothing to enter.

Decision already made: keep GIT_CONFIG_NOSYSTEM=1 (no system-keychain fallback) — fix the message and the path to Connect GitHub.

Tasks:
- ErrorMapper: add a `could not read Username` pattern BEFORE the authenticationFailed bucket → new GitErrorCode 'noCredentialsAvailable' with honest copy ("GitWarden has no saved login for this HTTPS remote — connect GitHub for this profile to push with its token") and a reconnect/connect remediation mapping (src/core/safety/remediation.ts). Remove that phrase from the authenticationFailed regex so the two cases stay distinct.
- ErrorMapper: add a pattern for git's "Your local changes to the following files would be overwritten by (checkout|switch|merge)" → new GitErrorCode 'localChangesWouldBeOverwritten' with plain copy; the switch-failure banner already offers "Bring changes & switch" beside it.
- Reconnect visibility: from the push-sheet path, the device code (remediationExecutor.ts:87-91) must stay readable on screen from click until "Authorized as @…". Choose the lighter of: (a) keep the failed-push panel + inline code hint mounted through the authorization wait instead of dismissing on the immediate ok; (b) route the action into the global ConnectGitHubModal (mounted in App.tsx). State the choice in the progress log.
- Vitest: ErrorMapper cases from real git stderr fixtures for both new codes (and authenticationFailed still catches 401/403/token cases); component/store test that the reconnect flow keeps the code visible until authorization resolves.
- Strings externalized in strings.ts; core GitErrorCode union updated in src/core/types.ts.

Exit: npx tsc --noEmit clean; npm test green including the new mapper + reconnect tests; core-purity passes (types touched); npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 104 — AI tells the truth: /push-brief token facts + /propose empty-proposal guard

```
Work on Phase 104 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 104"). Renderer + main. Gate: Phase 103 ✅.

Context: /push-brief appends a trust-critical identity note that is wrong — "GitHub HTTPS: no stored token for the assigned profile" printed minutes after successful token pushes. The chat command omits the github block (aiChatStore.ts:456-471) and PushBriefService defaults hasToken:false (PushBriefService.ts:62-70). Separately, /propose accepts a proposal with ZERO file edits and reports "Applied 0 file edit(s)" as success (aiChatStore.ts:174-228).

Tasks:
- /push-brief: make the brief's github facts come from the SAME main-side token resolution the push sheet uses (GitHubAuthCoordinator.ts:164-177). Prefer resolving in main when the payload's github block is absent (single source by construction); alternatively fetch the facts in aiChatStore and pass them through — pick one, don't duplicate logic. The identityNote must then report hasToken/effectiveLogin truthfully.
- /propose rendering: a proposal whose fileEdits is empty renders NO Apply button — the card explains the model produced no usable edits (try rephrasing). String in strings.ts.
- /propose applying: applyProposal refuses an empty fileEdits list defensively (no IPC call, explanatory chat bubble); the agentic executor treats an empty batch as an error, not a zero-write success; the success bubble renders only for ≥1 written file and proposalApplied is set only then.
- Vitest: brief payload/service carries real hasToken + effectiveLogin when a token is stored and false when not; empty proposal → no Apply, refusal message, proposalApplied stays false; non-empty proposal path unchanged.

Exit: npx tsc --noEmit clean; npm test green including the new chat/store/service tests; npm run lint clean.

Then run the standard progress footer.
```

---

## Phase 105 — Polish batch + crash telemetry + regression sweep (feature-complete stop point)

```
Work on Phase 105 of GitWarden (docs/plans/qa-fixes-plan.md §"Phase 105"). Renderer + main + e2e. Gate: Phase 104 ✅. This is the track's feature-complete stop point — it ends with the full regression sweep.

Tasks:
- Live theme preview: selecting System/Light/Dark in Settings applies immediately; Save still persists (revert-on-leave without Save is fine) — src/renderer/screens/SettingsScreen.tsx.
- Enter sends a fully-typed slash command: the suggestion popup stops swallowing the send Enter (AiChatPanel.tsx:471) — when the typed text exactly matches a command, Enter sends; Tab/click still complete from the popup.
- Tooltips can't linger detached after their anchor is clicked or unmounts (TooltipLayer.tsx; QA saw the Pull button's tooltip stuck mid-screen).
- Staged deletions get their own prefix/icon on the Commit screen instead of the green "+" used for additions (CommitScreen.tsx).
- History's uncommit refusal ("Merge commits can't be returned this way", strings.ts) clears as soon as the newest commit becomes returnable, and the panel is visibly labeled as the uncommit/return feature (HistoryScreen.tsx).
- Profile email validation reports "invalid email" distinctly from the empty-required catch-all (ProfilesScreen.tsx:170).
- De-jargon the push-policy mode label "Unrestricted (blocked patterns only)" in strings.ts — plain words, same semantics.
- Crash telemetry: main subscribes to render-process-gone and child-process-gone and logs reason/exitCode via the existing Logger (src/main/services/Logger.ts) — QA saw one unexplained app exit and one silent renderer replacement that currently leave no trace. No secrets in logs (AGENTS.md #5).
- Regression sweep (the track's acceptance run): full Vitest suite + FULL Playwright suite in chunks (>10 min), including the specs added in Phases 100–102. Re-verify each of the 9 QA bugs against its original repro from docs/investigations/qa-run-2026-07-12.md and append a "fixed by Phase NN" status note per item in that file.

Exit: full gate — npx tsc --noEmit (both tsconfigs), npm test, npm run lint, and npm run e2e ALL green, including every spec added by this track.

Then run the standard progress footer.
```
