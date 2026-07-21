# Plan — Unified Commit & Remote: one tab for the whole commit → push journey

**Status:** ⬜ not started — Phases 114–116 — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 114 → 116.
**Feature-complete stop point:** Phase 116.
**Prompts:** [`docs/prompts/unified-commit-remote-prompts.md`](../prompts/unified-commit-remote-prompts.md).

## Goal

Today finishing a change takes two sidebar stops: write the message and commit on **Commit**, then
switch to **Remote** to pull/push. This feature merges both tabs into a single **"Commit & Push"**
tab that does everything the two do separately — staged summary, commit message with the AI draft,
the commit safety gate, per-remote Fetch / Pull / Push with the confirmation sheet and recovery
banners — and adds one new button: **Commit & Push**, which runs every safety check up front, asks
for a single confirmation, and then commits and pushes in one go.

**Product boundary (decided — merge only, staging stays put):** staging/unstaging files remains on
the Status tab; the unified tab consumes the staged set exactly as CommitScreen does today.
**Product boundary (decided — one confirmation, push stays confirmed):** Commit & Push shows one
pre-flight sheet covering both actions; a single Confirm executes commit → push. Push never runs
without that explicit confirmation (AGENTS.md #6: remote actions stay behind confirmation).

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **The two screens are parallel siblings with the same lifecycle.** Both load on mount keyed to
   the active repo and branch ([CommitScreen.tsx:43-45](../../src/renderer/screens/CommitScreen.tsx),
   [RemoteScreen.tsx:65-67](../../src/renderer/screens/RemoteScreen.tsx)) from two independent
   stores whose `load()`s fetch disjoint-but-overlapping data in parallel
   ([commitStore.ts:133-137](../../src/renderer/store/commitStore.ts),
   [remoteStore.ts:94-98](../../src/renderer/store/remoteStore.ts)). **Consequence:** the merged
   screen mounts one effect that fires both loads in parallel; both stores survive unchanged —
   this is a screen merge, not a store rewrite.

2. **Every gate the new button needs is already pure core.** `checkCommit` takes repository,
   profile, identity, status, message, and staged diffs; `checkPush` takes remotes, branch,
   upstream, the GitHub token context, and outgoing commits
   ([SafetyCheckService.ts:264-285](../../src/core/safety/SafetyCheckService.ts)); the
   outgoing-authorship gate compares each about-to-be-pushed commit against the active profile
   ([SafetyCheckService.ts:187-199](../../src/core/safety/SafetyCheckService.ts)). **Consequence:**
   the combined pre-flight verdict is pure composition — the only new logic is projecting the
   _hypothetical_ commit (authored by the current effective identity) into `outgoingCommits` so the
   push verdict is truthful before the commit exists.

3. **The renderer owns the nav mapping; core stays untouched.** `NavTarget` deliberately keeps
   `'commit'` and `'remote'` as stable renderer-agnostic ids that "the renderer maps to its own
   `NavScreen` enum" ([remediation.ts:36-48](../../src/core/safety/remediation.ts));
   `NAVIGATE_TARGETS` routes `configure-remote → 'remote'` and `write-commit-message` /
   `review-staged-changes → 'commit'`
   ([remediation.ts:87-97](../../src/core/safety/remediation.ts)). **Consequence:** normalize
   `'remote' → 'commit'` once in the renderer's `navigate()` and every existing remediation keeps
   working with **zero core changes** (core-purity untouched).

4. **The nav seams are few and enumerable.** The `NavScreen` union lists both ids
   ([appStore.ts:45-46](../../src/renderer/store/appStore.ts)); the Cmd/Ctrl+1–9 order
   ([App.tsx:32-42](../../src/renderer/App.tsx)) and the screen switch
   ([App.tsx:220-242](../../src/renderer/App.tsx)) render them; the sidebar defines one item per
   tab ([Sidebar.tsx:26-27](../../src/renderer/components/Sidebar.tsx)) with test ids derived as
   `nav-${screen}` ([Sidebar.tsx:134](../../src/renderer/components/Sidebar.tsx)); labels live in
   strings ([strings.ts:46-47](../../src/renderer/strings.ts)); the onboarding tour has one step
   per tab ([OnboardingTour.tsx:73-86](../../src/renderer/components/OnboardingTour.tsx)). Direct
   `navigate('commit')` callers: the Initialize-repo flow
   ([RepositoriesScreen.tsx:151](../../src/renderer/screens/RepositoriesScreen.tsx)) and the AI
   commit-draft card ([CommitDraftCard.tsx:78](../../src/renderer/components/chatBlocks/CommitDraftCard.tsx)).
   **Consequence:** Phase 115 touches exactly these seams; keeping `'commit'` as the canonical id
   leaves `nav-commit` and both callers working unchanged.

5. **The push sheet already models async pre-verification honestly.** Opening it kicks off the
   token check ([RemoteScreen.tsx:123-133](../../src/renderer/screens/RemoteScreen.tsx)) and the
   outgoing-commits fetch ([RemoteScreen.tsx:138-149](../../src/renderer/screens/RemoteScreen.tsx)),
   and the verdict is _withheld_ while either is pending
   ([RemoteScreen.tsx:87-112](../../src/renderer/screens/RemoteScreen.tsx)), with Confirm disabled
   until both land ([RemoteScreen.tsx:503-516](../../src/renderer/screens/RemoteScreen.tsx)).
   **Consequence:** the Commit & Push sheet reuses this exact pattern (and the details rows, GitHub
   line, and `BranchAccessBlock` at
   [RemoteScreen.tsx:400-440](../../src/renderer/screens/RemoteScreen.tsx)) — no new verification
   plumbing, only a wider verdict.

6. **Screens unmount on tab switch, and operation outcomes already live in stores.** The main
   content is a plain `switch` ([App.tsx:220-242](../../src/renderer/App.tsx)), so navigating away
   destroys component state; that is why `committedHash`
   ([commitStore.ts:101-118](../../src/renderer/store/commitStore.ts)) and
   `successMessage`/`lastFailure`
   ([remoteStore.ts:74-91](../../src/renderer/store/remoteStore.ts)) survive same-repo refreshes in
   their stores (Phase 102). **Consequence:** the chained commit→push flow state must live in a
   store, not component `useState` — a mid-flight tab switch must not orphan a running push.

7. **No new IPC is needed.** Everything the feature calls already has a channel:
   `git.commit` ([commitStore.ts:197](../../src/renderer/store/commitStore.ts)), `git.push`
   ([remoteStore.ts:210](../../src/renderer/store/remoteStore.ts)), `git.pull`
   ([remoteStore.ts:167](../../src/renderer/store/remoteStore.ts)), `git.fetch`
   ([remoteStore.ts:133](../../src/renderer/store/remoteStore.ts)), `git.getOutgoingCommits`
   ([RemoteScreen.tsx:141-142](../../src/renderer/screens/RemoteScreen.tsx)), and
   `github.getPushContext` ([RemoteScreen.tsx:125-126](../../src/renderer/screens/RemoteScreen.tsx)).
   **Consequence:** the track has no main/IPC phase — pure core, then renderer.

8. **Push/pull failure recovery is already structured and reusable.** `lastFailure` retains the
   diagnosis code and remediation for the recovery banner
   ([remoteStore.ts:40-46](../../src/renderer/store/remoteStore.ts),
   [RemoteScreen.tsx:344-380](../../src/renderer/screens/RemoteScreen.tsx)). **Consequence:** when
   push fails _after_ a successful commit, the flow lands in the same banner (one-click fix +
   retry pushes only — it never re-commits), with the "✓ Committed" confirmation kept visible so
   the user knows the commit is safe.

9. **The e2e surface is broad but mostly navigation-level.** These specs reference
   `nav-commit`/`nav-remote`/`screen-commit`/`screen-remote`: `commit.spec.ts`, `remote.spec.ts`,
   `github-push-safety.spec.ts`, `push-policy.spec.ts`, `wrong-author-push.spec.ts`,
   `remediation.spec.ts`, `onboarding.spec.ts`, `shell.spec.ts`, `rapid-switch-staleness.spec.ts`,
   `repositories-init.spec.ts`, `ai-commit-assistant.spec.ts`, `ai-change-review.spec.ts`,
   `ai-chat-panel.spec.ts`, `branches.spec.ts`, `safety-center.spec.ts` (all under `tests/e2e/`).
   **Consequence:** keep `nav-commit`, `screen-commit`, and every inner control id
   (`commit-btn`, `commit-message`, `remote-op-fetch/pull/push`, `remote-push-sheet`,
   `remote-push-confirm-btn`, …) stable; only `nav-remote`/`screen-remote` navigation lines change.

10. **The landing live demo still shows both old tabs.** Its mock sidebar copy has `commit:
'Commit'` and `remote: 'Remote'` ([copy.ts:81-82](../../landing/src/content/copy.ts)).
    **Consequence:** out of scope here (see Non-goals) — flagged as a follow-up so the app-faithful
    demo and screenshots get realigned in their own track once this ships.

## Scope

- **In:**
  - One sidebar tab **"Commit & Push"** replacing the Commit and Remote tabs, containing everything
    both do today: staged-changes summary, commit message + AI draft, commit safety issues +
    remediations, Commit button; per-remote Fetch / Pull / Push cards, the push confirmation sheet
    (details, GitHub line, Branch Access, issues, remediations), success messages, and the
    failed-push/pull recovery banner.
  - A new **Commit & Push** button: one pre-flight sheet showing the _combined_ verdict (commit
    gate + push gate incl. token, branch access, and the would-be commit's authorship), a single
    Confirm that runs commit → push, and honest per-stage progress and failure states.
  - A pure-core push-target default: upstream's remote → `origin` → the only remote; anything
    ambiguous requires an explicit pick in the sheet.
  - Nav/shortcut/onboarding consolidation and the e2e updates that follow from it.
- **Out / Non-goals:**
  - No staging/unstaging controls on the new tab — staging stays on Status.
  - No new git capabilities: no `--force`, no multi-branch push, no auto-pull-before-push, no
    upstream creation changes — the button chains the _existing_ commit and push exactly.
  - No push without confirmation, ever (AGENTS.md #6); Commit & Push never retries by re-committing.
  - No core `NavTarget`/remediation contract changes (finding 3 makes them unnecessary).
  - No main-process or IPC changes (finding 7).
  - No landing update in this track — the live demo/screenshot realignment (finding 10) is an
    explicitly flagged follow-up.

## The new pure-core contract (Phase 114)

One new feature folder `src/core/commitAndPush/` (pure — no fs/child_process/Electron/DOM,
AGENTS.md #1), consumed by Phase 116:

```ts
// pickPushTarget.ts — where Commit & Push will push, decided deterministically.
export type PushTarget =
  | { kind: 'remote'; remoteName: string; reason: 'upstream' | 'origin' | 'only-remote' }
  | { kind: 'choice-required'; candidates: string[] } // sheet demands an explicit pick
  | { kind: 'none' } // no remotes: the button is disabled with a plain hint
export function pickPushTarget(remotes: GitRemote[], upstream: string | undefined): PushTarget

// gate.ts — the combined pre-flight verdict, composing the existing pure gates.
export interface CommitAndPushGateInput {
  commit: Parameters<SafetyCheckService['checkCommit']>[0]
  push: Omit<Parameters<SafetyCheckService['checkPush']>[0], 'outgoingCommits'>
  /** Already-outgoing commits; undefined = still loading → push verdict withheld (finding 5). */
  existingOutgoing?: { authorName: string; authorEmail: string }[]
}
export interface CommitAndPushVerdict {
  commit: SafetyCheckResult
  /** Evaluated with outgoing = existing + the hypothetical new commit authored by the
   *  effective identity; null while existingOutgoing is withheld. */
  push: SafetyCheckResult | null
  canCommitAndPush: boolean // commit.canCommit && push?.canPush === true
}
export function checkCommitAndPush(input: CommitAndPushGateInput): CommitAndPushVerdict

// flow.ts — the chained execution as a pure reducer (renderer store consumes it).
export type CommitAndPushFlowState =
  | { stage: 'idle' }
  | { stage: 'confirming'; remoteName: string }
  | { stage: 'committing'; remoteName: string }
  | { stage: 'pushing'; remoteName: string; committedHash: string }
  | { stage: 'done'; remoteName: string; committedHash: string }
  | { stage: 'commit-failed'; message: string }
  | { stage: 'push-failed'; remoteName: string; committedHash: string; message: string }
export type CommitAndPushFlowEvent =
  | { type: 'open'; remoteName: string }
  | { type: 'cancel' } // only from 'confirming' — never mid-execution
  | { type: 'confirm' }
  | { type: 'commit-succeeded'; hash: string }
  | { type: 'commit-failed'; message: string }
  | { type: 'push-succeeded' }
  | { type: 'push-failed'; message: string }
  | { type: 'dismiss' } // from terminal stages back to idle
export function reduceCommitAndPushFlow(
  state: CommitAndPushFlowState,
  event: CommitAndPushFlowEvent
): CommitAndPushFlowState
```

Flow invariants (all Vitest-encoded): `pushing` is reachable only through `committing`; `cancel`
is a no-op outside `confirming`; `push-failed` and `done` both retain `committedHash` (the commit
is real and is never rolled back); illegal events leave the state unchanged.

## Phase 114 — Commit & Push core: push target, combined gate, flow model (pure core)

**Goal:** the three pure modules above, fully tested, before any UI exists.

**Implementation:**

- New `src/core/commitAndPush/pickPushTarget.ts`: parse the remote name from
  `GitStatus.upstream`'s `'origin/main'` form ([types.ts:141-152](../../src/core/types.ts),
  [SafetyCheckService.ts:280-281](../../src/core/safety/SafetyCheckService.ts)); precedence
  upstream-remote → `origin` → only remote → `choice-required` → `none`. An upstream naming a
  remote that no longer exists in `remotes` falls through to the next rule.
- New `src/core/commitAndPush/gate.ts`: compose `safetyCheckService.checkCommit` + `checkPush`
  ([SafetyCheckService.ts:264-285](../../src/core/safety/SafetyCheckService.ts)); build the
  hypothetical outgoing list as `existingOutgoing + [{authorName: identity.userName, authorEmail:
identity.userEmail}]` so the Phase-100 authorship gate
  ([SafetyCheckService.ts:187-199](../../src/core/safety/SafetyCheckService.ts)) fires _before_
  the commit is created; withhold the push verdict (null) while `existingOutgoing` is undefined,
  mirroring the sheet's pending semantics (finding 5).
- New `src/core/commitAndPush/flow.ts`: the reducer + invariants above.
- Vitest: target-precedence table (incl. gone-upstream and zero/one/many remotes), gate
  composition (commit blocker blocks all; push blocker blocks all; wrong-identity hypothetical
  commit blocks; withheld verdict), full flow-transition table incl. illegal events.

**Exit criteria:** `npx tsc --noEmit` clean (both tsconfigs); `npm test` green with the new suites;
`npm run lint` clean; core-purity passes on `src/core/commitAndPush/**` (AGENTS.md #1 — no
child_process/fs/Electron/DOM imports).

**Files:** new `src/core/commitAndPush/pickPushTarget.ts`, `src/core/commitAndPush/gate.ts`,
`src/core/commitAndPush/flow.ts`, `tests/unit/commitAndPush/*.test.ts`.

---

## Phase 115 — One "Commit & Push" tab replacing Commit and Remote (renderer + e2e)

**Goal:** a single tab that does everything the two tabs do today — no new button yet.

**Implementation:**

- New `src/renderer/screens/CommitPushScreen.tsx` merging the two screens' sections in journey
  order: staged summary → commit message + AI draft
  ([CommitScreen.tsx:119-187](../../src/renderer/screens/CommitScreen.tsx)) → commit safety issues
  - remediations ([CommitScreen.tsx:190-238](../../src/renderer/screens/CommitScreen.tsx)) → Commit
    button → Remotes section with Fetch/Pull/Push cards
    ([RemoteScreen.tsx:263-330](../../src/renderer/screens/RemoteScreen.tsx)) → outcomes + recovery
    banner ([RemoteScreen.tsx:332-380](../../src/renderer/screens/RemoteScreen.tsx)) → the push sheet
    ([RemoteScreen.tsx:384-520](../../src/renderer/screens/RemoteScreen.tsx)). Delete
    `CommitScreen.tsx` and `RemoteScreen.tsx`.
- Keep **all** inner data-testids and the section id `screen-commit` (finding 9). One mount effect
  fires `useCommitStore.load` and `useRemoteStore.load` in parallel (finding 1).
- The merged remediation filter skips a navigate to `'commit'` **or** `'remote'` (supersedes the
  per-screen skips at [CommitScreen.tsx:82-89](../../src/renderer/screens/CommitScreen.tsx) and
  [RemoteScreen.tsx:186-194](../../src/renderer/screens/RemoteScreen.tsx)).
- Nav: canonical id stays `'commit'`; `navigate()` in appStore normalizes `'remote' → 'commit'`
  (finding 3) so remediations and any stale caller land correctly; `NavScreen` keeps both members.
  Remove the `'remote'` entries from `NAV_ORDER` ([App.tsx:32-42](../../src/renderer/App.tsx)),
  the switch ([App.tsx:229-230](../../src/renderer/App.tsx) — both cases render the new screen),
  and `NAV_ITEMS` ([Sidebar.tsx:26-27](../../src/renderer/components/Sidebar.tsx) collapse to one
  item, icon `commit`).
- Strings: replace `NAV_COMMIT`/`NAV_REMOTE` usage with new `NAV_COMMIT_PUSH: 'Commit & Push'`
  ([strings.ts:46-47](../../src/renderer/strings.ts)); merge the tour's commit + remote steps into
  one step on the unified tab ([OnboardingTour.tsx:73-86](../../src/renderer/components/OnboardingTour.tsx))
  with merged title/body strings.
- e2e: update the specs in finding 9 — replace `nav-remote`/`screen-remote` navigation with
  `nav-commit`/`screen-commit`; adjust `shell.spec.ts` nav-count/shortcut expectations and
  `onboarding.spec.ts` step expectations. Remote-flow assertions (push sheet, policy, wrong-author,
  recovery) stay behaviorally identical.

**Exit criteria:** `npx tsc --noEmit` clean (both tsconfigs); `npm test` green; `npm run lint`
clean; `npm run e2e` green across the updated specs (run chunked); every capability of the two old
tabs demonstrably reachable on the one tab (commit path + fetch/pull/push path each covered by a
passing spec).

**Files:** new `src/renderer/screens/CommitPushScreen.tsx`; delete
`src/renderer/screens/CommitScreen.tsx`, `src/renderer/screens/RemoteScreen.tsx`; edit
`src/renderer/App.tsx`, `src/renderer/store/appStore.ts`, `src/renderer/components/Sidebar.tsx`,
`src/renderer/components/OnboardingTour.tsx`, `src/renderer/strings.ts`,
`src/renderer/screens/workflowScreens.css` (if section spacing needs it), affected `tests/e2e/*.spec.ts`.

---

## Phase 116 — The Commit & Push button with one confirmation (renderer + e2e)

**Goal:** one click, one confirmation, and the change is committed _and_ on the remote — with the
same safety GitWarden applies to each action separately.

**Implementation:**

- New `src/renderer/store/commitAndPushStore.ts`: holds `CommitAndPushFlowState` (store, not
  component state — finding 6) and drives it via `reduceCommitAndPushFlow`. `confirm` executes
  `useCommitStore.getState().doCommit(message)` and, only on success, `useRemoteStore.getState()
.doRemotePush(remoteName, branch)` — reusing both stores' outcome machinery (findings 6, 8)
  untouched.
- Button **Commit & Push** next to **Commit Changes** on the unified tab; enabled only when
  `pickPushTarget` yields a target (or the user picked one) and there is a current branch; opening
  the sheet kicks off the same token + outgoing verification the push sheet does (finding 5) and
  renders the Phase-114 combined verdict: details rows, GitHub line, Branch Access block, the
  _union_ of commit and push issues with their remediations, and a Confirm disabled until
  `canCommitAndPush` and nothing is pending.
- `choice-required` targets render a remote picker inside the sheet, preselecting nothing.
- Execution UX: Confirm → "Committing…" → "Pushing…" (button-level progress, sheet closes on
  start); `done` shows one success confirmation naming hash + remote; `commit-failed` shows the
  commit error (nothing was pushed); `push-failed` keeps the "✓ Committed <hash>" confirmation
  visible _and_ routes the failure through `remoteStore.lastFailure` so the existing recovery
  banner offers the one-click fix; any retry from there pushes only — it never re-commits.
- New user-facing strings externalized in `strings.ts` (button, sheet title, per-stage progress,
  combined-success and partial-failure copy).
- e2e (`tests/e2e/commit-and-push.spec.ts`, offline against a local bare-repo "remote" fixture):
  happy path (one Confirm → commit lands in the bare remote); blocked path (identity mismatch
  blocks Confirm and shows the union verdict); partial-failure path (non-fast-forward remote →
  commit exists, recovery banner shown, "✓ Committed" survives); cancel path (Cancel from the
  sheet leaves the repo untouched).

**Exit criteria:** `npx tsc --noEmit` clean (both tsconfigs); `npm test` green; `npm run lint`
clean; `npm run e2e` green incl. the new spec; the remote action runs only after the explicit
Confirm (AGENTS.md #6), and no secrets appear in any new log or copy (AGENTS.md #5).

**Files:** new `src/renderer/store/commitAndPushStore.ts`, `tests/e2e/commit-and-push.spec.ts`;
edit `src/renderer/screens/CommitPushScreen.tsx`, `src/renderer/strings.ts`.

---

## Acceptance criteria (feature)

- One sidebar tab covers the full journey: everything the old Commit tab did (staged summary,
  message, AI draft, gate, remediations, commit) and everything the old Remote tab did (per-remote
  fetch/pull/push, push sheet with token/branch-access/authorship verification, recovery banners)
  — each reachable without switching tabs, each covered by a passing spec.
- **Commit & Push** performs both actions after exactly one confirmation, is blocked by the union
  of both gates _before_ anything executes, and reports partial failure honestly (commit kept,
  push recoverable in one click).
- Remediation buttons that previously navigated to Commit or Remote all land on the unified tab.
- `src/core/` stays pure; no new IPC; no push without confirmation; suites green:
  `npm test` + `npm run e2e`.

## Decisions (resolved)

- Slug `unified-commit-remote`; sidebar label **"Commit & Push"** (kickoff interview).
- Staging stays on Status — the unified tab consumes the staged set as-is (interview).
- Single up-front confirmation covering commit + push; push is never unconfirmed (interview).
- Canonical nav id `'commit'`; `'remote'` normalized inside `navigate()`; core `NavTarget`
  untouched.
- Default push target: upstream's remote → `origin` → only remote; otherwise an explicit pick.
- Push failure after a successful commit keeps the commit and reuses the existing recovery banner;
  retries push only.
- Landing live-demo/screenshot realignment (finding 10) deliberately deferred to a follow-up track.

## Open questions (resolve at kickoff)

None — the kickoff interview resolved naming, boundary, and confirmation flow.
