# Plan — Connect-Return Check: the Connect-GitHub modal wakes up the moment you come back

**Status:** 🟡 in progress — Phase 80 ✅ done, Phase 81 open — **derived view**; the authoritative
state is the Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 80 → 81.
**Feature-complete stop point:** Phase 81.
**Prompts:** [`docs/prompts/connect-return-check-prompts.md`](../prompts/connect-return-check-prompts.md).

## Goal

When a user connects GitHub, the modal shows a device code and sits on one frozen line —
"Waiting for you to authorize on GitHub…" — while they go off to the browser to authorize (or, for
someone brand-new, to **create a GitHub account** first). That detour can take minutes. When they
come back to the app, the modal still says "Waiting…" for **up to a full poll interval** even though
they already did their part — which reads as "stuck / did it not work?".

This feature makes the modal **react to your return**. The instant the app window regains focus, it
shows an active **"Checking with GitHub…"** spinner and asks GitHub once, right then, whether
authorization is done — so in the common case (you came back *because* you just authorized) it flips
straight to "Connected" instead of making you wait out the next background poll. If you're not done
yet, it quietly settles back to "Waiting…". Two smaller returns-focused touches ride along: a
one-line reassurance for people without a GitHub account ("Create one — we'll keep waiting"), and, if
the code expired during a long signup, "Try Again" becomes the obvious primary button.

**Product boundary (decided — "feedback-first, one bounded bypass poll"):** this is a
**responsiveness/feedback** polish on the *already-working* device flow (Phase 26), not a new auth
path. The background poll already detects authorization on its own within one interval; this only
collapses the *perceived* wait on return and makes the app feel alive. It does **not** add a new auth
`Status`, does **not** change how tokens are stored or what crosses to the renderer, and does **not**
poll GitHub on a tighter *sustained* cadence — it permits exactly **one** opportunistic early poll
per return, rate-guarded, accepting that a user who repeatedly refocuses *without* authorizing may
occasionally incur GitHub's `slow_down` (a self-correcting +5s to the interval — never a break).

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a claim with real
`file:line` links and the **consequence** for this feature:

1. **The modal is fully event-driven and survives a browser round-trip.** `ConnectGitHubModal`
   subscribes to `github:authEvent` and renders per `status`; the `awaitingUser` block shows the
   static WAITING line ([ConnectGitHubModal.tsx:160-179](../../src/renderer/components/ConnectGitHubModal.tsx),
   `STR.GITHUB_MODAL_WAITING` [strings.ts:182](../../src/renderer/strings.ts)). It cancels on unmount
   but **not** on losing OS focus ([ConnectGitHubModal.tsx:93-99](../../src/renderer/components/ConnectGitHubModal.tsx)).
   **Consequence:** a browser round-trip does **not** remount the modal — the in-flight flow (owned by
   main) is intact on return — so the "Checking…" feedback slots into this exact `awaitingUser` block,
   and the return trigger is window focus, not a remount.

2. **Detection is a main-side background poll on a fixed cadence; the renderer never polls.**
   `GitHubAuthCoordinator.poll` awaits `service.pollForToken` and emits only terminal statuses
   (`authorized`/`denied`/`expired`/`error`) — nothing on `pending`
   ([GitHubAuthCoordinator.ts:180-220](../../src/main/ipc/GitHubAuthCoordinator.ts)); the service
   loop sleeps `intervalSec` between polls ([GitHubAuthService.ts:167](../../src/main/services/GitHubAuthService.ts)).
   **Consequence:** after the user authorizes, the flip to `authorized` lands on the **next scheduled
   poll** — up to one full interval later. That lag, felt while the user is back and staring, is the
   pain this feature targets.

3. **The poll interval is GitHub's floor, not ours to shrink freely (the honest finding).**
   `pollForToken` respects `intervalSec` and raises it on `slow_down`
   ([GitHubAuthService.ts:150-153](../../src/main/services/GitHubAuthService.ts)); GitHub answers a
   too-fast poll with `slow_down` (+5s, `SLOW_DOWN_INCREMENT_SEC` [GitHubAuthService.ts:33](../../src/main/services/GitHubAuthService.ts)).
   **Consequence:** you **cannot legally poll faster than `intervalSec`**, so an immediate check that
   *strictly never* polls early buys ~0 latency. Delivering a real instant flip on return therefore
   requires allowing **one bounded early ("bypass") poll**, at the cost of an occasional single
   `slow_down` — this is the boundary decision, see Decisions §1.

4. **The inter-poll wait is an injected, abortable seam — the clean place to add a wake.** `Sleeper`
   defaults to `abortableDelay` and is injected ([GitHubAuthService.ts:48-49,63-79,94](../../src/main/services/GitHubAuthService.ts));
   the loop calls `this.sleep(intervalSec * 1000, signal)` each iteration
   ([GitHubAuthService.ts:167](../../src/main/services/GitHubAuthService.ts)), with an injectable
   `Clock` (`now`) already present ([GitHubAuthService.ts:51-52,96](../../src/main/services/GitHubAuthService.ts)).
   **Consequence:** add a **re-armable "wake"** that races the injected sleep so a poke can resolve the
   wait early (guarded) — keeping the single poll cadence, never a second parallel poll. Fully
   unit-testable via the existing `sleep`/`now` seams.

5. **The lifecycle already has a per-profile controller map and a Zod-validated emit.** `controllers`
   Map ([GitHubAuthCoordinator.ts:87](../../src/main/ipc/GitHubAuthCoordinator.ts)), abort/supersede
   ([GitHubAuthCoordinator.ts:100-124,234-241](../../src/main/ipc/GitHubAuthCoordinator.ts)), and
   `emit` validating with `GitHubAuthEventPayload.parse`
   ([GitHubAuthCoordinator.ts:243-257](../../src/main/ipc/GitHubAuthCoordinator.ts)).
   **Consequence:** add `coordinator.refreshDeviceAuth(profileId)` that, only if a controller is live
   for that profile, asks the service for a bypass poll — no new state store, reuses the existing map.

6. **The IPC + preload + `window.d.ts` pattern is a thin Zod-validated `wrap` per channel — copy
   `github:cancelDeviceAuth` exactly.** Handler
   ([ipc-handlers.ts:436-442](../../src/main/ipc/ipc-handlers.ts)) parses `GitHubCancelDeviceAuthPayload`
   (`= GitHubProfilePayload` [ipc-schemas.ts:105-107](../../src/main/ipc/ipc-schemas.ts)), bridged at
   [preload/index.ts:207-208](../../preload/index.ts) and typed at
   [window.d.ts:169](../../src/renderer/types/window.d.ts). **Consequence:** add `github:refreshDeviceAuth`
   with `GitHubRefreshDeviceAuthPayload = GitHubProfilePayload`, one bridge method
   (`refreshDeviceAuth(profileId)`), one `window.d.ts` line — mirroring cancel exactly.

7. **"Checking…" can be a renderer-local display keyed to "I just poked" — no event-schema change.**
   The modal owns `status` locally and reacts to events
   ([ConnectGitHubModal.tsx:26-30,45-71](../../src/renderer/components/ConnectGitHubModal.tsx)); the
   poll loop emits nothing on `pending`, so a backend `checking:false` would need a brand-new emit on
   a non-terminal state. **Consequence:** keep the auth-event schema (`GitHubAuthEventPayload`
   [ipc-schemas.ts:118-126](../../src/main/ipc/ipc-schemas.ts)) and the `GitHubAuthStatus` union
   ([types.ts:52-58](../../src/core/types.ts)) **untouched** — on focus the renderer sets a local
   `checking` flag (spinner), pokes `refreshDeviceAuth`, and clears the flag on the next `authEvent`
   or a short timeout. The success case flips via the normal `authorized` event, so the spinner is
   honestly backed by the bypass poll.

8. **Expiry already has a state + string; the sad path is only about prominence.** `status: 'expired'`
   renders `STR.GITHUB_MODAL_EXPIRED` with a "Try Again" button
   ([ConnectGitHubModal.tsx:190-203,229-249](../../src/renderer/components/ConnectGitHubModal.tsx);
   [strings.ts:192,196](../../src/renderer/strings.ts)); the code lives 900s
   (`expiresInSec`, [types.ts:30](../../src/core/types.ts)). **Consequence:** no new expiry logic — a
   long new-account signup can outlast 900s, so Phase 81 only makes "Try Again" the visually **primary**
   action (it already is the primary button; keep it prominent and ensure it reads clearly on return).

9. **No new-user guidance exists anywhere in the connect flow.** The `GITHUB_MODAL_*` string block
   ([strings.ts:179-196](../../src/renderer/strings.ts)) has no "no account yet" copy; the flow relies
   entirely on GitHub's own signup page. **Consequence:** add one externalized string rendered under
   the code in the `awaitingUser` block.

## Scope

- **In:** a re-armable **wake** on `GitHubAuthService.pollForToken` with an internal rate guard (one
  bypass poll per interval window); `GitHubAuthCoordinator.refreshDeviceAuth(profileId)`; a new
  Zod-validated `github:refreshDeviceAuth` IPC channel + preload bridge + `window.d.ts` type; a
  renderer focus/visibility listener (debounced) that pokes it and shows a local **"Checking with
  GitHub…"** spinner in the `awaitingUser` block; a one-line new-user reassurance string under the
  code; "Try Again" kept as the prominent primary action on an expired code seen after return; all
  new copy externalized in `STR`.
- **Out / Non-goals:**
  - **No new auth `Status`** and **no change to `GitHubAuthEventPayload`** — "checking" is a
    renderer-local visual (finding 7).
  - **No tighter sustained polling** — exactly one opportunistic bypass poll per return, rate-guarded;
    the normal cadence is unchanged.
  - **No silent auto-restart of an expired code** — expiry stays manual (a code changing itself under
    the user is confusing); only the button's prominence is addressed.
  - **No change** to token storage, what crosses to the renderer, scopes, or the browser-open behavior.
  - **No renderer-side polling** — the renderer only *pokes*; all polling stays in main.
  - **No account-creation flow** — GitHub still owns signup; we only reassure and wait.

## The new seam (main)

The only new "contract" is a small, unit-testable addition to the auth service interface — it stays
in main (not `src/core/`), consistent with the existing service:

```ts
// src/main/services/GitHubAuthService.ts (IGitHubAuthService)
export interface IGitHubAuthService {
  requestDeviceCode(scopes: string[]): Promise<GitHubDeviceCode>
  pollForToken(signal: AbortSignal): Promise<DeviceTokenResult>
  /**
   * Ask the in-flight poll to cut its current wait short for ONE immediate ("bypass") poll.
   * No-op when no poll is waiting. Rate-guarded internally: at most one bypass per current
   * interval window, and never within a small floor of the last poll — so a burst of pokes
   * cannot hammer GitHub (worst case: an occasional single `slow_down`).
   */
  requestImmediatePoll(): void
}
```

Mechanics: `pollForToken` records `lastPollAt` (via the injected `now`) after each `pollOnce`, tracks
the current interval, and replaces the bare `this.sleep(...)` with a `waitInterval(...)` that **races**
the injected sleep against a re-armable `wake`. `requestImmediatePoll()` resolves that wake **only if**
`now - lastPollAt ≥ a small floor` **and** `now - lastBypassAt ≥ currentInterval` (one bypass per
window); otherwise it's ignored. The injected `sleep`/`now` seams make every branch deterministic in
Vitest with no real timers.

---

## Phase 80 — Wakeable poll + rate-limit-conscious immediate re-check (main + IPC)

**Goal:** the engine behind "check now on return" — a guarded, re-armable wake on the poll loop, a
coordinator refresh entry point, and a typed IPC channel to trigger it. No UI. Honors AGENTS.md rules
#2 (GitRunner/services own execution — no new `child_process`), #5 (no secrets logged — the wake
touches no token/`device_code`), and the IPC-Zod-validation rule.

**Implementation:**

- **`GitHubAuthService`** ([GitHubAuthService.ts](../../src/main/services/GitHubAuthService.ts)): add
  `requestImmediatePoll()` to `IGitHubAuthService` and the class per "The new seam". In `pollForToken`
  ([GitHubAuthService.ts:129-169](../../src/main/services/GitHubAuthService.ts)) record `lastPollAt`
  after each `pollOnce`, keep `currentIntervalMs` in sync with `intervalSec` (including after
  `slow_down`), and replace `this.sleep(intervalSec * 1000, signal)`
  ([GitHubAuthService.ts:167](../../src/main/services/GitHubAuthService.ts)) with a private
  `waitInterval(ms, signal)` that races the injected `sleep` against a re-armable `wake`. Keep the
  `AbortSignal` cancellation and the `deadline` expiry ([GitHubAuthService.ts:138,159-165](../../src/main/services/GitHubAuthService.ts))
  exactly as-is. The guard uses the existing injected `now` `Clock`.
- **`GitHubAuthCoordinator`** ([GitHubAuthCoordinator.ts](../../src/main/ipc/GitHubAuthCoordinator.ts)):
  add `refreshDeviceAuth(profileId)` to `IGitHubAuthCoordinator` and the class — a no-op unless
  `this.controllers.has(profileId)` (a flow is live, [GitHubAuthCoordinator.ts:87](../../src/main/ipc/GitHubAuthCoordinator.ts)),
  otherwise `this.auth.requestImmediatePoll()`. No new emit, no token access.
- **IPC + bridge:** add `GitHubRefreshDeviceAuthPayload = GitHubProfilePayload`
  ([ipc-schemas.ts:105-107](../../src/main/ipc/ipc-schemas.ts)); register `github:refreshDeviceAuth`
  in [ipc-handlers.ts](../../src/main/ipc/ipc-handlers.ts) mirroring `github:cancelDeviceAuth`
  ([ipc-handlers.ts:436-442](../../src/main/ipc/ipc-handlers.ts)) (parse → call → return `null`); add
  `refreshDeviceAuth(profileId)` to the preload `github` bridge
  ([preload/index.ts:204-221](../../preload/index.ts)) and its type to `window.d.ts`
  ([window.d.ts:167-173](../../src/renderer/types/window.d.ts)).

**Exit criteria:** `npx tsc --noEmit` clean on both tsconfigs; **Vitest (deterministic — inject a fake
`sleep` and `now`, no real timers)**: a poke during a wait triggers exactly one early poll; a burst of
pokes yields **at most one** bypass per interval window; a poke with **no** in-flight flow is a no-op;
a poke does **not** change `deadline`/expiry behavior or `AbortSignal` cancellation; the normal
`pending → sleep → poll` cadence is unchanged when no poke arrives. `npm run lint` clean; the
**safety-reviewer** subagent passes (no secrets logged, IPC Zod-validated, no new execution surface).
No UI, no auth-event schema change.

**Files:** edit `src/main/services/GitHubAuthService.ts`, `src/main/ipc/GitHubAuthCoordinator.ts`,
`src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`,
`src/renderer/types/window.d.ts`; new/extended `tests/unit/github-auth-immediate-poll.test.ts`.

---

## Phase 81 — "Checking with GitHub…" on return + return polish (renderer + e2e)

**Goal:** the user comes back to the app and the modal visibly wakes up — a "Checking…" spinner and,
in the common case, an instant flip to "Connected"; plus the new-user reassurance line and a prominent
"Try Again" on an expired code. Feature-complete stop point.

**Implementation:**

- **`ConnectGitHubModal`** ([ConnectGitHubModal.tsx](../../src/renderer/components/ConnectGitHubModal.tsx)):
  add a `checking` local state and a focus effect — subscribe to `window` `focus` and
  `document` `visibilitychange` (→ visible), **debounced (~1s)**; on trigger, only while
  `status === 'awaitingUser'`, set `checking = true`, call `window.api.github.refreshDeviceAuth(profileId)`,
  and clear `checking` on the next `authEvent` (the existing handler
  [ConnectGitHubModal.tsx:45-71](../../src/renderer/components/ConnectGitHubModal.tsx)) or after a short
  fallback timeout. Render the spinner + `STR.GITHUB_MODAL_CHECKING` **in place of** the static
  `GITHUB_MODAL_WAITING` line ([ConnectGitHubModal.tsx:177](../../src/renderer/components/ConnectGitHubModal.tsx))
  while `checking`. Clean up listeners/timers on unmount (mirror the existing cleanup effects
  [ConnectGitHubModal.tsx:93-106](../../src/renderer/components/ConnectGitHubModal.tsx)).
- **New-user hint:** render `STR.GITHUB_MODAL_NO_ACCOUNT_HINT` as a small muted line under the code in
  the `awaitingUser` block.
- **Expired prominence:** ensure the `expired` terminal block keeps "Try Again" as the primary action
  and reads clearly ([ConnectGitHubModal.tsx:190-249](../../src/renderer/components/ConnectGitHubModal.tsx));
  no logic change, presentation only.
- **Strings:** add `GITHUB_MODAL_CHECKING: 'Checking with GitHub…'` and
  `GITHUB_MODAL_NO_ACCOUNT_HINT: "No GitHub account yet? Create one — we'll keep waiting."` to `STR`
  ([strings.ts:179-196](../../src/renderer/strings.ts)). No hard-coded user-facing text.

**Exit criteria (Playwright e2e, offline — the existing GitHub-connect e2e harness/stub for the device
flow):**

- With a flow in `awaitingUser`, firing a `visibilitychange`→visible (or `window` focus) shows the
  **"Checking with GitHub…"** line/spinner and invokes `github:refreshDeviceAuth`.
- When the stubbed flow reports authorization, the modal flips to **"Connected"**.
- When not yet authorized, the "Checking…" line settles back to the **"Waiting…"** line (no stuck
  spinner).
- The new-user hint is visible in `awaitingUser`; an `expired` flow shows a prominent "Try Again".
- `npx tsc --noEmit` clean; `npm test`, `npm run e2e`, `npm run lint` all green; no hard-coded
  user-facing strings.

**Files:** edit `src/renderer/components/ConnectGitHubModal.tsx`, `src/renderer/strings.ts`; new/extended
`tests/e2e/github-connect-return.spec.ts` (or extend the existing GitHub-connect spec).

---

## Acceptance criteria (feature)

- Returning to the app during a connect (window focus / tab visible) shows an active "Checking with
  GitHub…" state and triggers exactly one guarded immediate check — no manual button needed.
- If the user authorized while away, the modal flips to "Connected" promptly on return instead of
  waiting out the next background poll; if not, it settles back to "Waiting…".
- A burst of refocus events cannot make the app poll GitHub faster than one bypass per interval window;
  the worst case is an occasional self-correcting `slow_down`, never a broken flow.
- A user without a GitHub account sees a one-line reassurance that creating one is fine and the app
  will keep waiting; if the code expired during a long signup, "Try Again" is the obvious next action.
- No new auth `Status`, no change to the auth-event schema, token storage, or what crosses to the
  renderer; the renderer never polls GitHub directly; no secrets logged.
- Logic-first honored: Phase 80 ships green Vitest before the UI; Phase 81 has green Playwright. One
  commit per phase; the progress-log entry written **before** each commit; not pushed.

## Decisions (resolved)

1. **Honest check, with one bounded bypass poll (the corrected mechanism).** A strict "never poll below
   the interval" guard would neuter the instant flip (finding 3), so the design allows exactly **one**
   opportunistic early poll per return, rate-guarded (one bypass per interval window + a small floor
   after the last poll). The accepted cost: a user who repeatedly refocuses *without* authorizing may
   occasionally trigger GitHub's `slow_down` (+5s, self-correcting). (Grill fork 1 = "Honest check",
   refined by finding 3.)
2. **Include the new-user reassurance line.** One string under the code — it directly serves the
   scenario that motivated the feature (creating an account, then returning). (Grill fork 2 = "Include
   it".)
3. **Expired code stays manual; only "Try Again" prominence improves.** No silent auto-restart — a code
   changing itself under the user is confusing. (Grill fork 3 = "Manual, prominent".)
4. **"Checking" is renderer-local, not a new backend state.** Keeps `GitHubAuthStatus` and
   `GitHubAuthEventPayload` untouched; the spinner is backed by the real bypass poll in the success
   case and cleared by timeout otherwise. (Finding 7.)
5. **Trigger is window focus + `visibilitychange`, debounced.** The modal persists across the browser
   round-trip (finding 1); returning is the trigger, not a remount. Debounce bounds pokes; the service
   guard bounds actual polls.
6. **Copy is English**, consistent with the existing `STR` table ([strings.ts](../../src/renderer/strings.ts)).

## Open questions (resolve at kickoff)

- **Spinner clear-timeout length** (Phase 81): the fallback that returns "Checking…" → "Waiting…" when
  no event arrives. Lean: ~2s (comfortably longer than a fast bypass round-trip, short enough not to
  feel stuck). Confirm at Phase 81 kickoff.
- **e2e harness reuse:** extend the existing GitHub-connect Playwright spec vs. a new
  `github-connect-return.spec.ts`. Lean: whichever the current connect e2e already stubs the device
  flow in — confirm when opening Phase 81.
