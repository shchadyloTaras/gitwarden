# Plan — QA Fixes: the identity gate actually gates, freshness stops undermining itself, and every message tells the truth

**Status:** ⬜ not started — Phases 98–105 — **derived view**; the authoritative state is the Phase
Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 98 → 105.
**Feature-complete stop point:** Phase 105.
**Prompts:** [`docs/prompts/qa-fixes-prompts.md`](../prompts/qa-fixes-prompts.md).
**Source reports:** the three July-2026 QA runs — `~/Downloads/gitwarden-rapport-01.html` (8 Jul,
first-look UA), `gitwarden-rapport-02.html` (8 Jul, root-caused), `gitwarden-rapport-03.html`
(12 Jul, re-run with real pushes) — and the in-repo technical record
[`docs/investigations/qa-run-2026-07-12.md`](../investigations/qa-run-2026-07-12.md). The 12 Jul
run tested HEAD `a4d1f1a` (post-Phase-97), so every finding below is live on current `main`.

## Goal

The 12 Jul QA run proved the one failure GitWarden exists to prevent: a commit authored
`eleken-git <marketing@eleken.co>` was created in the UI and **pushed to the real GitHub repo**
with nothing but a soft yellow warning (evidence commit `97a09a9` on `shchadyloTaras/test`).
Alongside that, two safety checks exist only on paper (author _name_ is never compared; the
staged-secret blocker is never emitted), the `.git` file-watchers die after their first event, the
app's own watcher-triggered refresh erases the very banners operations just posted, and a handful
of messages lie (HTTPS push blames an "expired token" when there are simply no credentials,
`/push-brief` denies a token it is pushing with, `/propose` reports success for zero applied edits).

This track closes all nine confirmed bugs plus the agreed minor batches: **(1)** an identity
mismatch (email _or_ name) becomes a commit **blocker** with the existing one-click fix beside it;
**(2)** the deterministic secret scanner runs at the commit gate; **(3)** push verifies the
**authorship of the outgoing commits**, not just the current config; **(4)** `.git` watching
becomes rename-proof and covers `config`; **(5)** operation outcomes survive refreshes, and
commit/merge/uncommit finally confirm success; **(6)** failure copy tells the truth and the
push-sheet "Reconnect GitHub" visibly shows its device code; **(7)** the AI surfaces report real
facts; **(8)** a polish batch plus renderer-crash telemetry and a full regression sweep.

**Product boundary (decided — block commit AND push):** identity mismatch blocks committing (not
just warns), and pushing additionally scans the outgoing range's authors so an already-wrong commit
cannot reach GitHub even after the config is fixed. The app never rewrites history to "fix"
wrong-author commits — the remediation is explain-only (uncommit / fix identity / re-commit).
HTTPS pushes without a stored token get an honest error and a "Connect GitHub" path — GitWarden
does **not** fall back to the system keychain (`GIT_CONFIG_NOSYSTEM=1` stays; pushing with the
profile's verified token remains the product's main path).

## Codebase findings (grounding)

Verified against the current tree (HEAD `a4d1f1a`) before writing this plan:

1. **`EMAIL_MISMATCH` is a warning; no name check exists.** The severity map has
   `EMAIL_MISMATCH: 'warning'` ([safetyMessages.ts:9](../../src/core/safety/safetyMessages.ts));
   `collectIdentityIssues` compares only `identity.userEmail !== activeProfile.gitAuthorEmail`
   ([SafetyCheckService.ts:75-84](../../src/core/safety/SafetyCheckService.ts)) and the
   `SafetyCode` union ([SafetyCheckService.ts:17-42](../../src/core/safety/SafetyCheckService.ts))
   has no `NAME_MISMATCH`. **Consequence:** Phase 98 adds the name check and promotes the mismatch
   to blocker — the Commit screen already renders blockers and the one-click fix
   ([CommitScreen.tsx:64](../../src/renderer/screens/CommitScreen.tsx) runs `checkCommit` in the
   renderer; pure core runs client-side).

2. **The secret blocker is catalogued but never emitted.** `STAGED_SECRET_DETECTED: 'blocker'`
   and a ready per-file message helper exist
   ([safetyMessages.ts:21](../../src/core/safety/safetyMessages.ts),
   [safetyMessages.ts:66-71](../../src/core/safety/safetyMessages.ts)), but `checkCommit`
   ([SafetyCheckService.ts:252-266](../../src/core/safety/SafetyCheckService.ts)) never sees diff
   content. The deterministic scanner already exists in pure core:
   `scanDeterministicFindings` / `findSecretMatches`
   ([changeReview.ts:161-172](../../src/core/ai/changeReview.ts),
   [changeReview.ts:127-155](../../src/core/ai/changeReview.ts)) — today it only runs inside AI
   `/review`. A per-file staged diff IPC already exists: `git:getDiff(repoPath, filePath, staged)`
   ([preload/index.ts:170-171](../../preload/index.ts),
   [ipc-handlers.ts:318-321](../../src/main/ipc/ipc-handlers.ts)). **Consequence:** Phase 99 wires
   the existing scanner into the commit gate via a bulk staged-diffs channel.

3. **`checkPush` never inspects outgoing authorship.** It checks identity config, remotes,
   GitHub token facts and policy
   ([SafetyCheckService.ts:268-313](../../src/core/safety/SafetyCheckService.ts)); the sheet then
   renders "✓ Identity check passed — safe to push."
   ([RemoteScreen.tsx:590](../../src/renderer/screens/RemoteScreen.tsx)). The data needed already
   exists: `GitService.getCommitsAhead` returns `authorName`/`authorEmail` per commit
   ([GitService.ts:548](../../src/main/services/GitService.ts),
   [GitService.ts:587-588](../../src/main/services/GitService.ts);
   [types.ts:177-178](../../src/core/types.ts)) — but no IPC channel exposes it (verified: no
   `getCommitsAhead` in [preload/index.ts](../../preload/index.ts) or
   [ipc-handlers.ts](../../src/main/ipc/ipc-handlers.ts)). **Consequence:** Phase 100 adds the
   channel and the authorship check.

4. **The HEAD/index watchers die on the first git write.** `watchFileIfExists` attaches
   `fs.watch` to the _files_ `.git/HEAD` and `.git/index`
   ([RepoWatcherService.ts:105-112](../../src/main/services/RepoWatcherService.ts),
   [RepoWatcherService.ts:148-152](../../src/main/services/RepoWatcherService.ts)); git rewrites
   them via `*.lock` + `rename()`, so the watcher follows a deleted inode after the first event.
   The recursive `refs/` _directory_ watch
   ([RepoWatcherService.ts:94-101](../../src/main/services/RepoWatcherService.ts)) survives and
   masks the death for branch-creating switches. `.git/config` is not watched at all.
   **Consequence:** Phase 101 watches the `.git` directory (rename-proof) and adds a `config` kind.

5. **The watcher's own refresh wipes operation banners.** Watcher events route into
   `refreshActiveRepo` ([App.tsx:377](../../src/renderer/App.tsx)), which calls the stores'
   `load()`s ([refreshActiveRepo.ts:32-81](../../src/renderer/store/refreshActiveRepo.ts));
   `remoteStore.load` resets `successMessage`/`lastFailure`
   ([remoteStore.ts:72-87](../../src/renderer/store/remoteStore.ts)) and `branchStore.load` resets
   `successMessage`/`mergeConflict`/`switchError`
   ([branchStore.ts:82-94](../../src/renderer/store/branchStore.ts)). A failed pull's own fetch
   phase updates `refs/` → event → wipe, so **the first attempt's banner always dies**; `doFetch`
   already hand-works around this exact wipe for its success message
   ([remoteStore.ts:131-144](../../src/renderer/store/remoteStore.ts)). **Consequence:** Phase 102
   moves operation outcomes out of the loaders' reset set (reset on repo _change_ only).

6. **The "no credentials" failure is mapped to a lie.** `GitRunner.buildEnv` sets
   `GIT_CONFIG_NOSYSTEM: '1'` and `GIT_TERMINAL_PROMPT: '0'`
   ([GitRunner.ts:174-180](../../src/main/git/GitRunner.ts)), which hides the system-level
   `osxkeychain` helper on stock macOS; the resulting `could not read Username` lands in the same
   `authenticationFailed` bucket as a rejected token, whose copy says "the token may be … expired,
   or revoked" ([ErrorMapper.ts:49-61](../../src/main/git/ErrorMapper.ts)). There is also no
   pattern for git's "Your local changes … would be overwritten by checkout" — it falls through to
   `unknown` → "An unexpected Git error occurred."
   ([ErrorMapper.ts:213-218](../../src/main/git/ErrorMapper.ts)). **Consequence:** Phase 103 adds
   two honest mappings.

7. **The reconnect device code renders — in a panel that disappears.** The executor returns the
   fresh device code ([remediationExecutor.ts:87-91](../../src/main/ipc/remediationExecutor.ts));
   `RemediationButton` stores and renders it
   ([RemediationButton.tsx:174](../../src/renderer/components/RemediationButton.tsx),
   [RemediationButton.tsx:206-210](../../src/renderer/components/RemediationButton.tsx)) but fires
   `onSuccess` immediately after ([RemediationButton.tsx:175](../../src/renderer/components/RemediationButton.tsx)),
   which can dismiss the failed-push panel and unmount the hint. The code-display modal
   (`ConnectGitHubModal`) is mounted by [ProfilesScreen.tsx](../../src/renderer/screens/ProfilesScreen.tsx)
   and [App.tsx](../../src/renderer/App.tsx). **Consequence:** Phase 103 keeps the code on screen
   from the push-sheet path until authorization completes.

8. **`/push-brief` omits the GitHub block; the service defaults to "no token".** The chat command
   builds its payload without `github`
   ([aiChatStore.ts:456-471](../../src/renderer/store/aiChatStore.ts)) and
   `PushBriefService` defaults `hasToken: input.github?.hasToken ?? false`
   ([PushBriefService.ts:62-70](../../src/main/ai/PushBriefService.ts)). The real token facts are
   already resolvable in main ([GitHubAuthCoordinator.ts:41](../../src/main/ipc/GitHubAuthCoordinator.ts),
   [GitHubAuthCoordinator.ts:164-177](../../src/main/ipc/GitHubAuthCoordinator.ts)) — the push
   sheet computes the same fact correctly. **Consequence:** Phase 104 feeds the real facts in.

9. **`/propose` accepts an empty edit set as success.** `applyProposal` sends
   `message.proposal.fileEdits` unchecked and reports
   `Applied ${result.data.writtenFiles.length} file edit(s)` — rendering "Applied 0 file edit(s)"
   and marking the proposal applied
   ([aiChatStore.ts:174-228](../../src/renderer/store/aiChatStore.ts)). **Consequence:** Phase 104
   refuses empty proposals at render and at execute.

10. **Polish-batch anchors are real.** The chat suggestion popup consumes Enter
    (`e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)`,
    [AiChatPanel.tsx:471](../../src/renderer/components/AiChatPanel.tsx)); profile validation
    reports one catch-all "… are required." message
    ([ProfilesScreen.tsx:170](../../src/renderer/screens/ProfilesScreen.tsx)); the
    "Merge commits …" refusal string and the "Unrestricted" policy label live in
    [strings.ts](../../src/renderer/strings.ts); tooltips render through
    [TooltipLayer.tsx](../../src/renderer/components/TooltipLayer.tsx); a `Logger` service exists
    in main ([src/main/services/Logger.ts](../../src/main/services/Logger.ts)).

## Scope

- **In:** all 9 confirmed bugs from the three reports (identity gate email+name, secret gate,
  outgoing-authorship gate, rename-proof `.git`+`config` watching, outcome-banner survival,
  no-credentials + dirty-switch error mapping, reconnect device-code visibility, `/push-brief`
  token truth, `/propose` empty-proposal guard) **plus** the agreed minor batches: honest copy
  (wrong-actor blocker wording, email validation, policy-mode label), success confirmations for
  commit/merge/uncommit, the small-polish batch (live theme preview, Enter sends a slash command,
  lingering tooltip, staged-deletion prefix, stale uncommit refusal), and renderer-crash telemetry
  (`render-process-gone` / `child-process-gone` logging).
- **Out / Non-goals:** clone-from-URL (a separate future feature); any conflict-presentation
  redesign on Status; auto-rewriting history to fix wrong-author commits (explain-only
  remediation); a system-keychain credential fallback for HTTPS push (decided against); making the
  header Guard badge aware of merge-conflict state (it reflects identity/commit readiness; the
  real gates block correctly); post-Initialize landing-screen change (Phase 88's deliberate
  choice stands); watching repos other than the active one.

## New contracts (pure core)

- `SafetyCode` gains **`NAME_MISMATCH`** (blocker) and **`OUTGOING_WRONG_AUTHOR`** (blocker);
  `EMAIL_MISMATCH` is promoted `'warning'` → `'blocker'`.
- `checkCommit` input gains optional **`stagedDiffs: { path: string; diff: string }[]`** — when
  present, the existing secret scanner runs over added lines and emits per-file
  `STAGED_SECRET_DETECTED` blockers.
- `checkPush` input gains optional **`outgoingCommits: { authorName: string; authorEmail: string }[]`**
  — any author not matching the assigned profile's identity emits `OUTGOING_WRONG_AUTHOR`.
- `RepoChangeKind` gains **`'config'`**; the watcher contract stays `repo:changed { repoPath, kind }`.
- New IPC channel **`git:getOutgoingCommits`** exposing `GitService.getCommitsAhead` to the
  renderer (Zod-validated like every channel).

---

## Phase 98 — Identity gate: name check + mismatch blocks commit (pure core + renderer strings)

**Goal:** committing with a wrong author email _or name_ is blocked, with the existing one-click
fix right beside the blocker.

**Implementation:**

- Add `NAME_MISMATCH` to the `SafetyCode` union
  ([SafetyCheckService.ts:17-42](../../src/core/safety/SafetyCheckService.ts)) with message +
  blocker severity in [safetyMessages.ts](../../src/core/safety/safetyMessages.ts); compare
  `identity.userName !== activeProfile.gitAuthorName` in `collectIdentityIssues`
  ([SafetyCheckService.ts:75-84](../../src/core/safety/SafetyCheckService.ts)).
- Promote `EMAIL_MISMATCH` to `'blocker'`
  ([safetyMessages.ts:9](../../src/core/safety/safetyMessages.ts)). `EMAIL_FROM_GLOBAL_ONLY`
  stays a warning.
- Extend the remediation mapping so `NAME_MISMATCH` (like `EMAIL_MISMATCH`/`IDENTITY_UNSET`)
  resolves to `set-local-identity` ([remediation.ts](../../src/core/safety/remediation.ts)) — the
  executor already writes both name and email locally (AGENTS.md #4: `--local` only).
- Renderer needs no new UI: the Commit screen and Safety Center render blockers and the quick-fix
  already; add the new user-facing strings. The header Guard badge flips to Blocked automatically
  (its check now returns a blocker), closing the "badge says Ready during a mismatch" complaint.
- Vitest: name-only mismatch → blocker; email-only → blocker; both → both issues; matching
  identity → clean; remediation mapping covers the new code. Update any tests that assumed
  warning-severity mismatches.

**Exit criteria:** `npx tsc --noEmit` clean (both tsconfigs); `npm test` green including new and
updated safety tests; core-purity passes; `npm run lint` clean.

**Files:** edit `src/core/safety/SafetyCheckService.ts`, `src/core/safety/safetyMessages.ts`,
`src/core/safety/remediation.ts` (+ their tests), `src/renderer/strings.ts` if the new message
needs UI wording.

---

## Phase 99 — Secret scan runs at the commit gate (core + main + IPC + renderer)

**Goal:** committing a staged API key is blocked deterministically — no AI connection, no manual
`/review` required.

**Implementation:**

- Pure core: `checkCommit` gains the optional `stagedDiffs` input; when present, reuse
  `findSecretMatches` over added lines (the exact mechanics of
  [changeReview.ts:127-155](../../src/core/ai/changeReview.ts)) and emit one
  `STAGED_SECRET_DETECTED` blocker per offending file using `stagedSecretMessage(file)`
  ([safetyMessages.ts:66-71](../../src/core/safety/safetyMessages.ts)). One ruleset — no parallel
  pattern table (the redaction rules stay the single source).
- Main + IPC: new `git:getStagedDiffs(repoPath)` bulk channel returning `{ path, diff }[]` for
  staged files, built on the same `GitService.getDiff` internals the per-file channel uses
  ([ipc-handlers.ts:318-321](../../src/main/ipc/ipc-handlers.ts)); Zod payload/result schemas;
  preload bridge method.
- Renderer: `CommitScreen` fetches staged diffs when the staged set changes and passes them into
  `checkCommit` ([CommitScreen.tsx:64](../../src/renderer/screens/CommitScreen.tsx)); the blocker
  renders in the existing issues list. Never log the matched content (AGENTS.md #5) — the issue
  carries file + rule label only.
- Vitest: planted AWS key pair + GitHub PAT fixtures → blocker with the right file named; clean
  diff → no issue; unstaged-only secret → no issue. Integration test for the new channel on a
  fixture repo.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green including the new gate + channel
tests; core-purity passes; `npm run lint` clean.

**Files:** edit `src/core/safety/SafetyCheckService.ts` (+ test), `src/main/services/GitService.ts`,
`src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`,
`src/renderer/types/window.d.ts`, `src/renderer/screens/CommitScreen.tsx`.

---

## Phase 100 — Push verifies outgoing authorship + truthful push-identity copy (core + main + IPC + renderer + e2e)

**Goal:** a commit authored by the wrong person cannot be pushed — even after the config is fixed —
and the push sheet's verdict says exactly what it checked.

**Implementation:**

- Pure core: `checkPush` gains the optional `outgoingCommits` input; any commit whose
  `authorName`/`authorEmail` doesn't match the **assigned profile's** identity emits the new
  `OUTGOING_WRONG_AUTHOR` blocker
  ([SafetyCheckService.ts:268-313](../../src/core/safety/SafetyCheckService.ts)). The message
  names the offending author and counts, and the remediation is explain-only: return the commit
  (uncommit), fix the identity, re-commit — never a history rewrite.
- Main + IPC: new `git:getOutgoingCommits(repoPath, remote, branch)` channel exposing
  `getCommitsAhead` ([GitService.ts:548](../../src/main/services/GitService.ts) — `authorName`/
  `authorEmail` already parsed at
  [GitService.ts:587-588](../../src/main/services/GitService.ts)).
- Renderer: the push sheet fetches the outgoing range for the selected remote/branch and passes it
  into `checkPush` ([RemoteScreen.tsx:78](../../src/renderer/screens/RemoteScreen.tsx));
  `aiChatStore`'s pre-push check gets the same input where available
  ([aiChatStore.ts:405](../../src/renderer/store/aiChatStore.ts)). Reword
  "✓ Identity check passed — safe to push."
  ([RemoteScreen.tsx:590](../../src/renderer/screens/RemoteScreen.tsx)) to state what was
  verified (config identity, token account, outgoing authors).
- Copy truth: `GITHUB_ACCOUNT_MISMATCH`'s message
  ([safetyMessages.ts:43-44](../../src/core/safety/safetyMessages.ts)) names the actual source of
  the expected login (linked profile vs policy field) instead of always blaming the assigned
  profile.
- Playwright: fixture repo with a local bare remote — commit as a wrong author → push sheet shows
  the blocker with Confirm disabled; uncommit + re-commit with the right identity → push passes.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green (core + channel tests);
`npm run e2e` green for the new wrong-author spec; core-purity passes; `npm run lint` clean.

**Files:** edit `src/core/safety/SafetyCheckService.ts`, `safetyMessages.ts`,
`src/core/safety/remediation.ts`, `src/main/ipc/ipc-schemas.ts`, `ipc-handlers.ts`,
`preload/index.ts`, `window.d.ts`, `src/renderer/screens/RemoteScreen.tsx`,
`src/renderer/store/aiChatStore.ts`, `strings.ts`; new Playwright spec.

---

## Phase 101 — Rename-proof `.git` watching + `config` coverage (main + renderer)

**Goal:** the third external branch switch is detected exactly like the first, and an external
identity edit (`.git/config`) surfaces without refocusing the window.

**Implementation:**

- Replace the per-file watches on `.git/HEAD` and `.git/index`
  ([RepoWatcherService.ts:105-112](../../src/main/services/RepoWatcherService.ts),
  [RepoWatcherService.ts:148-152](../../src/main/services/RepoWatcherService.ts)) with **one
  non-recursive `fs.watch` on the `.git` directory**, filtering the event filename:
  `HEAD` → `head`, `index` → `index`, `config` → new `config` kind, `packed-refs` → `refs`.
  A directory watch reports rename-replaced entries by name, so git's `*.lock` + `rename()`
  pattern can no longer kill it. Keep the recursive `refs/` watch + stat-poll fallback
  ([RepoWatcherService.ts:94-101](../../src/main/services/RepoWatcherService.ts)) as is.
- Extend `RepoChangeKind` with `'config'` end-to-end (schema, preload event bridge, renderer).
- Renderer routing: `config` events refresh the header guard and the active screen's
  identity-bearing store through the existing seam
  ([App.tsx:377](../../src/renderer/App.tsx),
  [refreshActiveRepo.ts:32-81](../../src/renderer/store/refreshActiveRepo.ts)).
- Integration tests (offline, fixture repo): **the QA minimal repro becomes the regression test** —
  three atomic rename-rewrites of `HEAD` produce three events (the old file-watch produced one);
  three real `git switch`es between existing branches each fire `head`; a `git config user.email`
  edit fires `config`; unwatch stops events.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green including the rename-proof watcher
tests; `npm run lint` clean; no watcher leaks (unwatch verified in test).

**Files:** edit `src/main/services/RepoWatcherService.ts` (+ test), `src/main/ipc/ipc-schemas.ts`,
`preload/index.ts`, `src/renderer/types/window.d.ts`, `src/renderer/App.tsx`,
`src/renderer/store/refreshActiveRepo.ts`.

---

## Phase 102 — Operation outcomes survive refreshes + success confirmations (renderer)

**Goal:** the outcome of every operation stays on screen until the user moves on — a failed pull
explains itself on the **first** attempt, and commit/merge/uncommit visibly confirm success.

**Implementation:**

- Split "operation outcome" state from "loaded data" state: `successMessage`, `lastFailure`,
  `switchError`, `mergeConflict` (and the stash-pop-conflict outcome) are no longer reset by
  `load()` when it refreshes the **same repo** — they reset only on a repo-path change or an
  explicit user dismiss/new operation. Touch points:
  [remoteStore.ts:72-87](../../src/renderer/store/remoteStore.ts),
  [branchStore.ts:82-94](../../src/renderer/store/branchStore.ts). Repo-switch hygiene from
  Phase 89 is preserved (outcomes still clear when the repo changes).
- Delete `doFetch`'s now-unneeded ordering workaround for its own success message
  ([remoteStore.ts:131-144](../../src/renderer/store/remoteStore.ts)) once outcomes survive.
- Surface the "Bring changes & switch" pop-conflict outcome persistently: the Status routing keeps
  a visible banner naming the conflict **and the kept stash entry** (no more bare `!` rows with an
  invisible leftover stash).
- Success confirmations (agreed scope): commit, merge, and uncommit set a visible "✓ done" outcome
  through the same surviving-outcome mechanism, consistent with the existing "Fetched from origin"
  toast style.
- Vitest: the deterministic QA scenario as a test — post a pull failure, then run the same-repo
  `load()` a watcher event would trigger 400 ms later → the failure banner survives; repo switch →
  it clears. Same-shape tests for switch/merge/uncommit outcomes.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green including the banner-survival tests;
`npm run lint` clean.

**Files:** edit `src/renderer/store/remoteStore.ts`, `branchStore.ts`, `commitStore.ts`,
`historyStore.ts` (uncommit outcome), the screens that render the new confirmations
(`RemoteScreen.tsx`, `BranchesScreen.tsx`, `CommitScreen.tsx`, `HistoryScreen.tsx`,
`StatusScreen.tsx` for the stash banner), `strings.ts`.

---

## Phase 103 — Honest failure copy + reconnect shows its code (main + renderer)

**Goal:** every failure names its real cause and next step: "no saved login → Connect GitHub",
"your changes would be overwritten → bring them along", and the push-sheet "Reconnect GitHub"
visibly shows the device code until authorization completes.

**Implementation:**

- ErrorMapper: add a `could not read Username` pattern **before** the `authenticationFailed`
  bucket ([ErrorMapper.ts:49-61](../../src/main/git/ErrorMapper.ts)) → new code
  `noCredentialsAvailable` with honest copy ("GitWarden has no saved login for this HTTPS remote —
  connect GitHub for this profile to push with its token") and a `reconnect-github`-family
  remediation. Rationale documented: `GIT_CONFIG_NOSYSTEM=1` + `GIT_TERMINAL_PROMPT=0`
  ([GitRunner.ts:174-180](../../src/main/git/GitRunner.ts)) hide the system keychain helper by
  design (decided: keep isolation; fix the message, not the env).
- ErrorMapper: add a "Your local changes … would be overwritten by (checkout|switch|merge)"
  pattern → new code `localChangesWouldBeOverwritten` with plain copy; the switch-failure banner
  already offers the right "Bring changes & switch" fix next to it.
- Reconnect visibility: from the push-sheet path, the device code returned by the executor
  ([remediationExecutor.ts:87-91](../../src/main/ipc/remediationExecutor.ts)) must stay on screen
  until authorization completes — either keep the failed-push panel (and its inline code hint,
  [RemediationButton.tsx:174-210](../../src/renderer/components/RemediationButton.tsx)) mounted
  through the wait instead of dismissing on the immediate `ok`, or route the action into the
  global `ConnectGitHubModal` mounted at [App.tsx](../../src/renderer/App.tsx). Decide by which
  needs fewer moving parts at phase time; acceptance is behavioral: the code is readable on screen
  from click until "Authorized as @…".
- Vitest: ErrorMapper cases for both new codes (real git stderr fixtures); component/store test
  that the reconnect flow keeps the code visible.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green including the new mapper + reconnect
tests; `npm run lint` clean.

**Files:** edit `src/main/git/ErrorMapper.ts` (+ test), `src/core/types.ts` (new `GitErrorCode`s),
`src/core/safety/remediation.ts` (map the new codes), `src/renderer/components/RemediationButton.tsx`
and/or `src/renderer/App.tsx` + `ConnectGitHubModal.tsx`, `src/renderer/screens/RemoteScreen.tsx`,
`strings.ts`.

---

## Phase 104 — AI tells the truth: `/push-brief` token facts + `/propose` empty-proposal guard (renderer + main)

**Goal:** the AI never contradicts the app about trust-critical facts and never reports success for
work it didn't do.

**Implementation:**

- `/push-brief`: the chat command builds the `github` block from the same main-side token facts
  the push sheet uses ([GitHubAuthCoordinator.ts:164-177](../../src/main/ipc/GitHubAuthCoordinator.ts))
  instead of omitting it ([aiChatStore.ts:456-471](../../src/renderer/store/aiChatStore.ts)), so
  `PushBriefService`'s `hasToken: … ?? false` default
  ([PushBriefService.ts:62-70](../../src/main/ai/PushBriefService.ts)) stops fabricating
  "no stored token". Whether the resolution happens renderer-side (fetch facts, pass through) or
  main-side (service resolves when the block is absent) — pick the one that keeps a single
  source; the push sheet and the brief must agree by construction.
- `/propose`: a proposal whose `fileEdits` is empty renders **no Apply button** — the card says
  the model produced no usable edits (try rephrasing); `applyProposal`
  ([aiChatStore.ts:174-228](../../src/renderer/store/aiChatStore.ts)) refuses an empty list
  defensively, and the success bubble renders only for ≥1 written file. Belt-and-braces: the
  agentic executor treats an empty batch as an error, not a no-op success.
- Vitest: brief payload carries real `hasToken`/`effectiveLogin` when a token is stored; empty
  proposal → no Apply, refusal message, `proposalApplied` stays false; non-empty path unchanged.

**Exit criteria:** `npx tsc --noEmit` clean; `npm test` green including the new chat/store tests;
`npm run lint` clean.

**Files:** edit `src/renderer/store/aiChatStore.ts`, `src/main/ai/PushBriefService.ts` (or the
brief IPC handler), `src/main/ai/AgenticActionExecutor.ts`, the propose card in
`src/renderer/components/chatBlocks/`, `strings.ts`.

---

## Phase 105 — Polish batch + crash telemetry + regression sweep (renderer + main + e2e) — feature-complete stop point

**Goal:** close the agreed small-UX tail, make silent renderer crashes observable, and prove the
whole track against the QA scenarios.

**Implementation:**

- **Live theme preview:** selecting System/Light/Dark in Settings applies immediately; Save still
  persists (revert-on-leave without Save is acceptable and simplest)
  ([SettingsScreen.tsx](../../src/renderer/screens/SettingsScreen.tsx)).
- **Enter sends a fully-typed slash command:** the suggestion popup stops swallowing the send
  Enter ([AiChatPanel.tsx:471](../../src/renderer/components/AiChatPanel.tsx)) — Enter with an
  exact command match sends; Tab/click still complete.
- **Tooltip can't linger** after its anchor is clicked/unmounted
  ([TooltipLayer.tsx](../../src/renderer/components/TooltipLayer.tsx)).
- **Staged deletions get their own prefix/icon** on the Commit screen (no more green `+` for a
  deleted file) ([CommitScreen.tsx](../../src/renderer/screens/CommitScreen.tsx)).
- **Stale uncommit refusal clears** when the newest commit becomes returnable, and the panel is
  labeled as the uncommit feature ([HistoryScreen.tsx](../../src/renderer/screens/HistoryScreen.tsx),
  strings in [strings.ts](../../src/renderer/strings.ts)).
- **Email validation says "invalid email"** distinctly from empty-required
  ([ProfilesScreen.tsx:170](../../src/renderer/screens/ProfilesScreen.tsx)).
- **De-jargon the policy mode label** "Unrestricted (blocked patterns only)" in
  [strings.ts](../../src/renderer/strings.ts) (plain words, same semantics).
- **Crash telemetry:** main subscribes to `render-process-gone` and `child-process-gone` and logs
  reason/exit code via the existing [Logger](../../src/main/services/Logger.ts) — the QA run saw
  one unexplained app exit and one renderer replacement that currently leave no trace. No secrets
  in logs (AGENTS.md #5).
- **Regression sweep (the track's acceptance run):** full Vitest + full Playwright suites,
  including the new specs from Phases 100–102; run e2e in chunks (the suite exceeds 10 minutes).
  Re-verify each fixed bug against its QA repro and update
  [`docs/investigations/qa-run-2026-07-12.md`](../investigations/qa-run-2026-07-12.md) with a
  "fixed by Phases 98–105" status note per item.

**Exit criteria:** full gate — `npx tsc --noEmit` (both), `npm test`, `npm run lint`, and
`npm run e2e` **all green**, including every spec added by this track.

**Files:** edit `src/renderer/screens/SettingsScreen.tsx`, `CommitScreen.tsx`, `HistoryScreen.tsx`,
`ProfilesScreen.tsx`, `src/renderer/components/AiChatPanel.tsx`, `TooltipLayer.tsx`,
`src/renderer/strings.ts`, `electron/main` entry (crash listeners) or
`src/main/services/Logger.ts` callers, `docs/investigations/qa-run-2026-07-12.md`; new/extended
Playwright specs.

---

## Acceptance criteria (feature)

Each mirrors a QA repro from the reports:

1. **Wrong identity can't ship:** `git config user.email marketing@eleken.co` (or a wrong
   `user.name`) → Commit is blocked with the one-click fix; a wrong-author commit already in the
   outgoing range blocks Push even after the config is fixed — the `97a09a9` scenario is
   impossible end-to-end (e2e spec).
2. **Secrets can't ship silently:** staging a file with an AWS key pair / GitHub PAT blocks the
   commit, naming the file — with AI disconnected.
3. **Three external switches, three detections:** plain `git checkout` between existing branches
   in a terminal is detected every time (~1 s), not just the first; an external
   `git config user.email` edit updates the guard without refocusing.
4. **First-attempt failures explain themselves:** a diverged pull shows the "branches have
   diverged" banner + merge fix on the **first** click; a stash-pop conflict lands on Status with
   a persistent explanation naming the kept stash.
5. **Success is visible:** commit, merge, and uncommit each show a "✓" confirmation that survives
   the watcher's refresh.
6. **HTTPS without a token is honest:** the push failure says there's no saved login and offers
   Connect GitHub; the device code from the push-sheet "Reconnect GitHub" stays readable on screen
   until "Authorized as @…".
7. **A blocked dirty switch speaks plainly:** "your local changes would be overwritten" copy (not
   "An unexpected Git error occurred"), with the existing quick-fix beside it.
8. **AI facts match app facts:** `/push-brief` reports the stored token correctly;
   `/propose` with zero edits shows no Apply button and never reports "Applied 0 file edit(s)".
9. **No regressions:** the complete Vitest + Playwright suites pass at the track's end.

## Decisions (resolved)

- **Slug / numbering:** `qa-fixes`, Phases 98–105, feature-complete at 105.
- **Identity gate:** block **commit and push** (blocker severity + outgoing-authorship scan) —
  the one-click local-identity fix is the paved path.
- **Wrong-author commits:** explain-only remediation (uncommit → fix identity → re-commit);
  never rewrite history automatically.
- **HTTPS credentials:** keep `GIT_CONFIG_NOSYSTEM=1`; fix the error copy + "Connect GitHub" CTA;
  no system-keychain fallback.
- **Minor scope:** all four agreed groups in-track (honest copy, success confirmations, polish
  batch, crash telemetry).
- **Watcher design:** non-recursive `.git` directory watch with filename filtering (+ existing
  recursive `refs/` watch); `config` becomes a first-class change kind.

## Open questions (resolve at kickoff)

- Phase 103: inline persistent device-code hint vs routing to the global `ConnectGitHubModal` —
  pick whichever needs fewer moving parts once the push-sheet lifecycle is inspected.
- Phase 102: exact home for the surviving outcome state (per-store fields with repo-keyed reset
  vs one shared outcome slice) — decide from how many stores need it after Phase 101 lands.
