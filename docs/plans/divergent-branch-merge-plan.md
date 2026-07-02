# Plan — Diverged-Branch Merge: resolve a fork between local and remote without the terminal

**Status:** ⬜ not started — Phases 68–71 — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 68 → 71.
**Feature-complete stop point:** Phase 71.
**Prompts:** [`docs/prompts/divergent-branch-merge-prompts.md`](../prompts/divergent-branch-merge-prompts.md).

## Goal

Today, when a repo's local branch and its remote have genuinely **diverged** — each side has a
commit the other doesn't — GitWarden does the safe thing and **refuses to guess**: `Pull` uses
`--ff-only` and reports the divergence as explain-only, so the only way forward is to open a
terminal and run `git merge`/`git rebase` by hand. A non-technical user is stuck.

This feature gives that user a **one-click "Bring in the remote changes" button** right on the
existing failed-pull recovery banner. Clicking it runs a plain **merge** of the remote-tracking
branch into the local branch, entirely in-app. If the merge is clean, the banner clears and the
user pushes with the normal Push button. If the merge hits a **real content conflict**, GitWarden
does **not** try to guess a resolution — it leaves the repository in git's standard mid-merge state
(conflict markers, unmerged index, `MERGE_HEAD` present) and re-diagnoses to the **existing**
`resolve-conflicts` remediation, sending the user to the Status screen where the current
stage-then-commit flow already finishes a merge commit.

**Product boundary (decided — "local merge only, no network, no auto-resolve"):** the action is
purely **local**. It merges the remote-tracking ref that the failed `Pull` already fetched — it
does **not** fetch, does **not** push, and never needs a token or the network. It offers **merge
only** (no rebase — rebase rewrites local commit SHAs, which is hard to explain and risky in a
GUI). It **never** auto-resolves a content conflict. It never touches global/system state (honors
the AGENTS.md rule _"Don't change global git config — only `--local`"_). It reuses Push's existing
safety checks/confirmation by stopping at the local merge and letting the user click Push
separately.

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a claim with real
`file:line` links and the **consequence** for this feature:

1. **Pull already refuses divergence — explain-only, and that boundary stays.** `GitService.pull()`
   uses `--ff-only` with a comment that _"A merge/rebase is a deliberate action, not a silent side
   effect of Pull"_ ([GitService.ts:175-189](../../src/main/services/GitService.ts)); `ErrorMapper`
   maps the divergence to `divergentBranches` with a deliberately **explain-only** `userMessage`
   ([ErrorMapper.ts:160-172](../../src/main/git/ErrorMapper.ts)). **Consequence:** this feature adds
   an **opt-in** merge action layered on top; it does not loosen Pull's `--ff-only` safety.

2. **The remediation model already exists and is the single extension point.**
   `RemediableGitErrorCode` is `pushRejectedWrongAccount | authenticationFailed | dubiousOwnership`
   ([remediation.ts:22-25](../../src/core/safety/remediation.ts)); `GIT_ERROR_ACTION` maps each to
   a `SafetySuggestedAction` ([remediation.ts:111-115](../../src/core/safety/remediation.ts)); and
   `isRemediableGitErrorCode` derives the remediable set from that map's keys — the linchpin the IPC
   layer uses to decide when to attach a remediation
   ([remediation.ts:126-128](../../src/core/safety/remediation.ts)). `divergentBranches` and
   `mergeConflict` are **absent** from `RemediableGitErrorCode`. **Consequence:** add them to this
   existing model, don't fork a second one.

3. **`mergeConflict` is a known `GitErrorCode`, just not remediable yet.** `GitErrorCode` already
   lists `mergeConflict` ([types.ts:217](../../src/core/types.ts)) and `divergentBranches`
   ([types.ts:222](../../src/core/types.ts)); ErrorMapper classifies a conflict via
   `/merge conflict|CONFLICT \(|automatic merge failed/i`
   ([ErrorMapper.ts:110-117](../../src/main/git/ErrorMapper.ts)). **Consequence:** the conflict
   fallback reuses this existing code — no new error code is invented.

4. **The conflict fallback UI already exists — `resolve-conflicts` → Status.**
   `SAFETY_ACTION_BY_CODE.HAS_CONFLICTS = 'resolve-conflicts'` and its `ACTION_HINTS` entry is
   _"Open Status, resolve conflict markers in each file, then stage the fixes."_
   ([safetyCopilotMessages.ts:75,102](../../src/core/ai/safetyCopilotMessages.ts)); the remediation
   model routes `resolve-conflicts` → `status`
   ([remediation.ts:74-83](../../src/core/safety/remediation.ts)). **Consequence:** a real merge
   conflict re-diagnoses to this navigate remediation — **no new conflict-resolution UI is built.**

5. **CRITICAL BUG TO FIX FIRST — `GitRunner` classifies only stderr, but `git merge` writes
   `CONFLICT (…)` to stdout.** `execute()` accumulates stdout as a `Buffer` and stderr as a
   `string`, and on a non-zero exit calls `ErrorMapper.map(stderr, exitCode)` — **stdout is never
   fed into classification** ([GitRunner.ts:105-117](../../src/main/git/GitRunner.ts)).
   **Consequence:** a real merge conflict (exit 1, empty stderr, `CONFLICT` text on stdout) would
   misclassify as `unknown` ("An unexpected Git error occurred.") unless `GitRunner` feeds stdout
   into classification too. This must be fixed before the merge action can reliably detect
   conflicts.

6. **No `merge` method exists; Pull's shape is the exact template.** `GitService` has
   `pull`/`push`/`fetch`, each built as `[...credentialIsolationArgs(auth), <verb>, remote, branch]`
   with `readOnly: false` and a `timeoutMs`
   ([GitService.ts:165-199](../../src/main/services/GitService.ts)), but **no `merge`**.
   **Consequence:** add `mergeRemoteBranch(repoPath, remote, branch)` running
   `git merge --no-edit <remote>/<branch>` against the **already-fetched** tracking ref — no `auth`
   argument, no network, no credential env.

7. **The clean-tree pre-check has a cheap existing primitive.** `getStatus` returns
   `GitStatus { files: FileChange[]; branch?; upstream?; ahead; behind }`
   ([GitService.ts:60-67](../../src/main/services/GitService.ts),
   [types.ts:135-141](../../src/core/types.ts)). **Consequence:** `files.length === 0` is the
   clean-working-tree guard to run before merging, so we refuse with a clear message instead of
   letting git fail with a confusing "local changes would be overwritten."

8. **The executor is a typed switch with an exhaustive `default: never`.** `executeRemediation`
   dispatches on `ExecutableAction` and closes with `const _exhaustive: never = action`; its deps
   are a narrow `Pick<GitService, 'setLocalIdentity' | 'push' | 'getRemotes'>`
   ([remediationExecutor.ts:31-38,64-119](../../src/main/ipc/remediationExecutor.ts)).
   **Consequence:** adding `merge-remote-into-local` to `ExecutableAction` **forces** a new case
   (the code won't compile otherwise); extend the `git` Pick with `getStatus` + `mergeRemoteBranch`.

9. **The IPC action enum + structured envelope already carry everything.**
   `RemediationExecutePayload.action` is a four-value `z.enum`
   ([ipc-schemas.ts:344-355](../../src/main/ipc/ipc-schemas.ts)); the `remediation:execute` handler
   parses it and calls `executeRemediation`
   ([ipc-handlers.ts:363-368](../../src/main/ipc/ipc-handlers.ts)); `IpcResult`'s error arm already
   carries `code?`/`remediation?` ([window.d.ts:56](../../src/renderer/types/window.d.ts)), and
   `git:pull` returns that envelope ([ipc-handlers.ts:343-349](../../src/main/ipc/ipc-handlers.ts),
   [window.d.ts:147](../../src/renderer/types/window.d.ts)). **Consequence:** once `divergentBranches`
   is remediable, `wrap()` **already** attaches `code` + `remediation` to a failed **pull** — the
   transport needs no change; only the renderer store discards them today.

10. **`doPull` throws away the structured failure; `doRemotePush` keeps it.** `doPull` does
    `if (!res.ok) throw new Error(res.error)` and sets only a plain `error` string
    ([remoteStore.ts:109-128](../../src/renderer/store/remoteStore.ts)), whereas `doRemotePush`
    retains `lastFailure: { message, code, remediation }`
    ([remoteStore.ts:130-152](../../src/renderer/store/remoteStore.ts)). The `lastFailure` type has
    **no** `remote`/`branch` fields ([remoteStore.ts:28](../../src/renderer/store/remoteStore.ts)).
    **Consequence:** `doPull` must populate `lastFailure`, and `lastFailure` must additionally carry
    its own `remote`/`branch` — see finding 11 for why.

11. **The recovery banner + `RemediationButton` are the reused UI, but they read push-only
    context.** The banner renders off `lastFailure` and passes `remote={selectedRemote?.name}` /
    `branch={currentBranch}` to `RemediationButton`
    ([RemoteScreen.tsx:377-412](../../src/renderer/screens/RemoteScreen.tsx)); `selectedRemote` is
    set only by the **push** sheet (`handleOpenPushSheet`), so on a **pull** failure it is `null`.
    `RemediationButton`'s executable branch runs
    `window.api.remediation.execute({ action, repoPath, profileId, remote, branch })` and maps each
    `ExecutableAction` to a label via a `switch`
    ([RemediationButton.tsx:100-176](../../src/renderer/components/RemediationButton.tsx)).
    **Consequence:** the banner must source `remote`/`branch` from `lastFailure` for a pull failure;
    add a `merge-remote-into-local` label case (+ `STR` entry); and a conflict re-diagnosis returned
    via `onFailure` → `setLastFailure` re-renders the banner as a "Go to Status" link (the model
    already routes `resolve-conflicts` → `status`).

12. **Pull has a single call site.** `doPull` is invoked only by the Pull button in
    `RemoteScreen` ([RemoteScreen.tsx:311-331](../../src/renderer/screens/RemoteScreen.tsx)).
    **Consequence:** no other screen needs touching.

## Scope

- **In:** a new **executable** remediation `merge-remote-into-local` added to the existing
  remediation model; a `GitRunner` fix so stdout-only failures (merge conflicts) are classified; a
  local `GitService.mergeRemoteBranch`; a clean-tree pre-check; a `remediation:execute` executor
  case; `doPull` populating a `lastFailure` that carries `remote`/`branch`; the one-click merge
  button wired into the **existing** failed-pull recovery banner; a real-conflict path that falls
  back to the **existing** `resolve-conflicts` → Status flow.
- **Out / Non-goals:**
  - **No rebase** — merge only (rebase rewrites local SHAs; explicit non-goal).
  - **No fetch and no push inside this action** — it merges the already-fetched tracking ref and
    stops; the user clicks the existing Push button separately (reuses Push's safety checks as-is).
  - **No auto-resolution of content conflicts** — a real conflict is left in git's standard
    mid-merge state and handed to the existing `resolve-conflicts` → Status flow.
  - **No new conflict-resolution UI** — the Status stage-then-commit flow already finishes a merge.
  - **No proactive divergence detection** — the button appears on the failed-pull recovery banner,
    not as an ambient "you have diverged" prompt.
  - **No new safety verdicts/severities** and **no global/system-state mutation.**

## Contract changes (extending the existing pure-core remediation model)

No new module — this **extends** `src/core/safety/remediation.ts` and the `SafetySuggestedAction`
union it derives from:

```ts
// src/core/ai/types.ts — add to the SafetySuggestedAction union:
//   | 'merge-remote-into-local'

// src/core/safety/remediation.ts
export type RemediableGitErrorCode =
  | 'pushRejectedWrongAccount'
  | 'authenticationFailed'
  | 'dubiousOwnership'
  | 'divergentBranches' // NEW → merge-remote-into-local (executable)
  | 'mergeConflict' // NEW → resolve-conflicts (navigate → status)

// EXECUTABLE_ACTION_LIST gains 'merge-remote-into-local' (a local, network-free, auth-free fix).
// GIT_ERROR_ACTION gains:
//   divergentBranches: 'merge-remote-into-local'
//   mergeConflict:     'resolve-conflicts'   // reuses the existing navigate→status remediation
```

`ACTION_HINTS` (`Record<SafetySuggestedAction, string>`) and the `RemediationExecutePayload` Zod
enum both **force** a new entry at compile/validation time when the action is added — the type
system is the safety net that keeps the layers in sync.

---

## Phase 68 — Remediation model: make divergence & conflict remediable (pure core)

**Goal:** the deterministic contract the later phases consume — divergence maps to a new executable
merge action; a real conflict maps to the existing navigate-to-Status action. Logic-first; no IPC,
no UI. Honors AGENTS.md rule #1 (pure core).

**Implementation:**

- Add `'merge-remote-into-local'` to the `SafetySuggestedAction` union in
  [src/core/ai/types.ts](../../src/core/ai/types.ts).
- In [remediation.ts](../../src/core/safety/remediation.ts):
  - Extend `RemediableGitErrorCode` with `'divergentBranches'` and `'mergeConflict'`.
  - Add `'merge-remote-into-local'` to `EXECUTABLE_ACTION_LIST` (it's a local, in-app fix). This
    keeps `NAVIGATE_TARGETS` total over the remaining `NavigateAction`s (no new navigate target).
  - Extend `GIT_ERROR_ACTION`: `divergentBranches: 'merge-remote-into-local'`,
    `mergeConflict: 'resolve-conflicts'`. (This automatically makes both codes report
    `true` from `isRemediableGitErrorCode`.)
- Add the `ACTION_HINTS['merge-remote-into-local']` entry in
  [safetyCopilotMessages.ts](../../src/core/ai/safetyCopilotMessages.ts) — an in-app,
  plain-language description, e.g. _"Bring the remote's changes into your branch with a merge, then
  push."_ (Adding to the union forces this entry — the `Record<SafetySuggestedAction, string>` will
  not compile without it.)
- Extend [tests/unit/remediation.test.ts](../../tests/unit/remediation.test.ts): `merge-remote-into-local`
  ∈ `EXECUTABLE_ACTIONS`; `remediationForGitError('divergentBranches')` is `{ action:
'merge-remote-into-local', kind: 'executable' }`; `remediationForGitError('mergeConflict')` is
  `{ action: 'resolve-conflicts', kind: 'navigate', navigateTo: 'status' }`; the
  `maps every RemediableGitErrorCode` list is extended with both new codes; `EXECUTABLE_ACTIONS.size`
  assertion updated.

**Exit criteria:** `npx tsc --noEmit` clean on both tsconfigs; `npm test` green for the extended
`remediation.test.ts`; `src/core/` stays pure (core-purity reviewer/hook passes); `npm run lint`
clean; no IPC/UI changes.

**Files:** edit `src/core/ai/types.ts`, `src/core/safety/remediation.ts`,
`src/core/ai/safetyCopilotMessages.ts`, `tests/unit/remediation.test.ts`.

---

## Phase 69 — GitRunner conflict classification + local merge (main)

**Goal:** merge conflicts are correctly classified (fixing the stdout blind spot), and a purely
local `mergeRemoteBranch` exists. Honors AGENTS.md rules #2 (GitRunner is the only executor), #3
(args arrays), #5 (no secrets logged).

**Implementation:**

- **Fix `GitRunner` classification** ([GitRunner.ts:105-117](../../src/main/git/GitRunner.ts)):
  feed stdout into `ErrorMapper` on a non-zero exit so stdout-only failures (git merge's
  `CONFLICT (…)`) are classified instead of falling through to `unknown`. Combine the streams for
  classification (e.g. classify against `stderr` plus the decoded stdout) while keeping the existing
  secret-safe logging behavior — the token lives only in `GIT_ASKPASS` env, never in argv/stdout, so
  neither stream can leak it. Do not change the success path or the `GitResult` shape.
- **Add `GitService.mergeRemoteBranch(repoPath, remote, branch)`**
  ([GitService.ts](../../src/main/services/GitService.ts)): run
  `git merge --no-edit <remote>/<branch>` (`readOnly: false`, args array, a `timeoutMs` mirroring
  pull/push). **No `auth` param** — it merges the local remote-tracking ref that the failed
  `pull --ff-only` already fetched, so there is no network call and no credential env. `--no-edit`
  uses git's default merge message (no editor prompt for a GUI user).
- Reconcile the ErrorMapper matcher if needed so the merge-conflict message on stdout maps to
  `mergeConflict` ([ErrorMapper.ts:110-117](../../src/main/git/ErrorMapper.ts)); it already matches
  `CONFLICT (`, so the change is primarily in `GitRunner` feeding it the right text.

**Exit criteria:** `npx tsc --noEmit` clean; **integration test (Vitest, offline real temp repo)**
that reproduces a **real** conflicting merge — two branches editing the same line — drives
`mergeRemoteBranch` through `GitRunner`, and asserts the thrown error is a `GitError` with code
`mergeConflict` (this is the regression proof for the stdout fix); a clean, non-conflicting merge
succeeds; `npm test` green; `npm run lint` clean; the **safety-reviewer** subagent passes (args
arrays, no secret logging, no global/system state). No UI.

**Files:** edit `src/main/git/GitRunner.ts`, `src/main/services/GitService.ts` (and
`src/main/git/ErrorMapper.ts` only if the matcher needs reconciling); new/extended
`tests/unit/git-runner.test.ts` and/or an integration spec exercising a real merge conflict.

---

## Phase 70 — Executable merge remediation (IPC)

**Goal:** `merge-remote-into-local` actually runs behind the typed + Zod-validated
`remediation:execute` channel: clean-tree pre-check → local merge → success, or a real conflict →
the existing `resolve-conflicts` remediation carrying git's own conflict `userMessage`. Honors
AGENTS.md rules #3 (args arrays), #6 (the explicit button click is the confirmation — no second
modal, consistent with `switch-profile-and-retry-push`).

**Implementation:**

- Add `'merge-remote-into-local'` to the `RemediationExecutePayload.action` `z.enum`
  ([ipc-schemas.ts:344-355](../../src/main/ipc/ipc-schemas.ts)). (`ExecutableAction` already flows
  from core, so `RemediationExecuteInput` widens automatically.)
- Add the executor case in
  [remediationExecutor.ts](../../src/main/ipc/remediationExecutor.ts) (the `default: never` forces
  it):
  - Require `input.branch` (refuse with a clear message if missing); `remote = input.remote ??
'origin'`.
  - **Clean-tree pre-check** via `getStatus`: if `status.files.length > 0`, return a refusal
    `RemediationResult` (`ok: false`, a plain-language message like _"Commit or stash your changes
    before merging in the remote's changes."_) — do **not** attempt the merge.
  - Otherwise call `mergeRemoteBranch(repoPath, remote, branch)`. On success return `{ ok: true }`.
  - Catch a `GitError` with `code === 'mergeConflict'` → return `{ ok: false, remediation:
remediationForGitError('mergeConflict'), message: error.userMessage }` (the repo is left in the
    standard mid-merge state; the navigate remediation routes to Status). Re-throw any other error
    so `wrap()` classifies it through the structured envelope.
- Extend `RemediationExecutorDeps.git` from `Pick<GitService, 'setLocalIdentity' | 'push' |
'getRemotes'>` to also include `'getStatus'` and `'mergeRemoteBranch'`
  ([remediationExecutor.ts:31-38](../../src/main/ipc/remediationExecutor.ts)).

**Exit criteria:** `npx tsc --noEmit` clean; **integration tests (Vitest, offline real temp repo)**:
a clean divergent merge returns `ok: true` and the repo is merged (a merge commit exists); a real
conflicting merge returns `ok: false` with `remediation.action === 'resolve-conflicts'` and the repo
is left mid-merge (unmerged path present / `MERGE_HEAD` exists); a dirty working tree returns the
pre-check refusal **without** attempting the merge; `npm test` green; `npm run lint` clean; the
**safety-reviewer** subagent passes (no global state, args arrays, no secret logging). No UI.

**Files:** edit `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/remediationExecutor.ts`; new/extended
integration spec (e.g. `tests/unit/remediation-actions.test.ts` or a dedicated merge spec).

---

## Phase 71 — Merge button in the failed-pull recovery banner (renderer + e2e)

**Goal:** the user resolves a diverged branch with one click on the existing recovery banner —
feature-complete stop point.

**Implementation:**

- **`doPull` populates a structured failure** ([remoteStore.ts:109-128](../../src/renderer/store/remoteStore.ts)):
  on `!res.ok`, set `lastFailure: { message: res.error, code: res.code, remediation: res.remediation,
remote, branch }` instead of throwing away the structured fields. Extend the `lastFailure` type
  ([remoteStore.ts:28](../../src/renderer/store/remoteStore.ts)) to carry `remote?: string` and
  `branch?: string` (needed because the banner's push path reads them from `selectedRemote`, which
  is `null` on a pull). Clear `lastFailure` at the start of a pull (as `doRemotePush` already does).
- **Wire the merge button into the recovery banner**
  ([RemoteScreen.tsx:377-412](../../src/renderer/screens/RemoteScreen.tsx)): source the button's
  `remote`/`branch` from `lastFailure.remote ?? selectedRemote?.name` and `lastFailure.branch ??
currentBranch` so it works for a pull-triggered failure. The existing `RemediationButton` already
  renders the executable fix and calls `window.api.remediation.execute(...)`; the
  `divergentBranches` remediation (executable) produces the merge button.
- **Add the `merge-remote-into-local` label case** to `RemediationButton`'s executable `switch`
  ([RemediationButton.tsx:100-176](../../src/renderer/components/RemediationButton.tsx)) — a
  `STR.REMEDIATION_MERGE_REMOTE(remote, branch)`-style label (e.g. _"Bring in origin/main"_); ensure
  the `missingTarget` guard requires `repoPath` + `remote` + `branch` for this action.
- **Conflict re-diagnosis:** the executor's conflict result flows through `onFailure` →
  `setLastFailure`, which re-renders the banner with the `resolve-conflicts` **navigate** link ("Go
  to Status"). On a **clean** merge, `onSuccess` clears messages and reloads; the user then clicks
  the existing Push button (no auto-push).
- **Strings:** externalize all new copy in [strings.ts](../../src/renderer/strings.ts)
  (`REMEDIATION_MERGE_REMOTE`, any merge-banner labels). No hard-coded user-facing strings.

**Exit criteria (Playwright e2e, offline fixtures + local bare remote):**

- A repo whose local branch and `origin/<branch>` have genuinely diverged, **clean tree** → Pull
  shows the recovery banner with a merge button; clicking it merges cleanly, the banner clears, and
  a subsequent Push succeeds to the bare remote.
- A **conflicting** divergence (both sides edit the same line) → clicking the merge button
  re-diagnoses to a "Go to Status" link; following it lands on Status with the file shown as
  **unmerged/conflicted**, where the existing stage-then-commit flow can finish the merge.
- (If cheap to assert) a **dirty** working tree → the fix refuses with the clean-tree message and
  does not merge.
- `npm test`, `npm run e2e`, `npm run lint` all green; no hard-coded user-facing strings.

**Files:** edit `src/renderer/store/remoteStore.ts`, `src/renderer/screens/RemoteScreen.tsx`,
`src/renderer/components/RemediationButton.tsx`, `src/renderer/strings.ts`; new/extended
`tests/e2e/remote.spec.ts` (or `tests/e2e/remediation.spec.ts`).

---

## Acceptance criteria (feature)

- A genuinely diverged branch (each side has a unique commit) is resolvable **in-app** — the user
  clicks one button in the failed-pull recovery banner instead of opening a terminal.
- A **clean** divergence merges locally and the banner clears; the user pushes with the existing
  Push button (the action itself never pushes and never fetches — it is network-free and
  auth-free).
- A **real content conflict** is **never** auto-resolved: the repo is left in git's standard
  mid-merge state and the user is routed to the **existing** Status stage-then-commit flow via the
  `resolve-conflicts` navigate remediation.
- A dirty working tree is refused up front with a clear message (no confusing raw git error).
- The stdout-classification bug is fixed: a real merge conflict maps to `mergeConflict`, never to
  "An unexpected Git error occurred."
- Pull's `--ff-only` safety boundary is unchanged; no rebase; no global/system-state mutation; git
  args stay arrays; no secrets logged.
- Logic-first honored: Phases 68–70 ship green Vitest before the UI; Phase 71 has green Playwright.
  One commit per phase; the progress-log entry written **before** each commit; not pushed.

## Decisions (resolved)

1. **Merge only for the MVP — no rebase.** Rebase rewrites local commit SHAs and is harder to
   explain and riskier for a non-technical user; explicit non-goal.
2. **No auto-push after a successful merge.** The action stops at the local merge; the user clicks
   the existing Push button, reusing its safety checks/confirmation unchanged. Keeps this action's
   blast radius to "local only, no network."
3. **No fetch inside the action.** It merges the remote-tracking ref (`<remote>/<branch>`) that the
   failed `pull --ff-only` already fetched — so the action is network-free and needs no token.
4. **A real content conflict is never auto-resolved.** The executor leaves the standard git
   mid-merge state and returns the **existing** `resolve-conflicts` navigate remediation → Status,
   where the current stage-then-commit flow finishes the merge commit. Mirrors the
   `switch-profile-and-retry-push` precedent of "attempt the real action, re-diagnose into a
   different remediation on a specific failure."
5. **The button click is the confirmation.** No second modal (same precedent as
   `switch-profile-and-retry-push`).
6. **Clean-tree pre-check.** Refuse with a clear message when the working tree isn't clean before
   attempting the merge (via `getStatus`), rather than letting git fail with a confusing "local
   changes would be overwritten."
7. **Fix `GitRunner` stdout classification first.** `git merge` writes `CONFLICT` to stdout; the
   fix is a prerequisite for reliable conflict detection and is done in Phase 69.

## Open questions (resolve at kickoff)

- **Dirty-tree refusal affordance:** message-only refusal (proposed) vs. also offering a "Go to
  Status" navigate so the user can stage/commit first. Lean: message-only for the MVP; upgrade to a
  navigate if it reads better in the banner.
- **Banner reuse for pull failures:** the recovery banner currently renders only for push failures
  (its push-specific `retryingWouldReuseAssignedHttpsCredential` path keys off
  `pushRejectedWrongAccount`, so it won't collide with `divergentBranches`). Confirm at kickoff that
  surfacing pull failures in the same banner is desired (it is the plan's intent) rather than a
  separate pull banner.
