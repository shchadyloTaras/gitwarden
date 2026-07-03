# GitWarden — Connect-Return Check Phase Prompts

Copy-paste prompts to drive the **Connect-Return Check** feature one phase at a time. Each prompt is
self-contained, points at the plan in `docs/plans/connect-return-check-plan.md`, and **ends with the
standard progress footer** that records progress in `docs/progress-log.md`. Rules live in `CLAUDE.md` /
`AGENTS.md`.

**How to use:** run prompts in order (80 → 81). Don't start a phase until the previous phase's entry
in `docs/progress-log.md` shows Exit criteria ✅. Phase 80 is the logic/engine checkpoint (main + IPC,
green Vitest); Phase 81 is the renderer + e2e **feature-complete stop point**. One commit per phase;
the progress-log entry written **before** the commit.

**Prerequisites / offline note:** No network. The device flow is unit-tested with a fake `HttpClient`
and injected `sleep`/`now` seams (no real GitHub call, no real timers); the renderer e2e uses the
existing GitHub-connect harness/stub for the device flow.

Background facts (already verified against the tree — don't re-litigate):

- The connect modal `ConnectGitHubModal` is event-driven off `github:authEvent` and shows the static
  `STR.GITHUB_MODAL_WAITING` line in the `awaitingUser` block; a browser round-trip does **not** remount
  it (it cancels on unmount, not on losing focus), so the in-flight flow is intact on return.
- Detection is a **main-side** background poll: `GitHubAuthCoordinator.poll` awaits
  `GitHubAuthService.pollForToken`, which sleeps `intervalSec` between polls and emits only terminal
  statuses — so the flip to `authorized` lands on the next scheduled poll (up to one interval late).
- GitHub forbids polling faster than `intervalSec` (answers a too-fast poll with `slow_down`, +5s), so
  the immediate re-check must allow **one bounded bypass poll** per return, rate-guarded — it cannot
  legally poll faster on a sustained basis.
- The inter-poll wait is the injected `Sleeper` (default `abortableDelay`) with an injected `now`
  `Clock` — the clean, testable seam for a re-armable wake.
- IPC is a thin Zod-validated `wrap` per channel; `github:refreshDeviceAuth` mirrors
  `github:cancelDeviceAuth` (payload `= GitHubProfilePayload`), bridged in `preload/index.ts` and typed
  in `window.d.ts`.
- "Checking" is a **renderer-local** visual — no change to `GitHubAuthStatus` or `GitHubAuthEventPayload`.

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

## Phase 80 — Wakeable poll + rate-limit-conscious immediate re-check

```
Work on Phase 80 of GitWarden (docs/plans/connect-return-check-plan.md §"Phase 80"). Main + IPC only — no renderer/UI, no change to the auth-event schema or GitHubAuthStatus.

Tasks:
- src/main/services/GitHubAuthService.ts: add `requestImmediatePoll(): void` to `IGitHubAuthService` and the class. In `pollForToken`, record `lastPollAt` (via the injected `now`) after each `pollOnce`, keep the current interval in sync (including after `slow_down`), and replace the bare `this.sleep(intervalSec * 1000, signal)` with a private `waitInterval(ms, signal)` that RACES the injected `sleep` against a re-armable `wake`. Keep the AbortSignal cancellation and the `deadline` expiry exactly as-is.
- The internal guard: `requestImmediatePoll()` resolves the wake ONLY if `now - lastPollAt ≥ a small floor` AND `now - lastBypassAt ≥ currentInterval` (at most one bypass per interval window); otherwise it is a no-op. It is also a no-op when no wait is in flight.
- src/main/ipc/GitHubAuthCoordinator.ts: add `refreshDeviceAuth(profileId)` to `IGitHubAuthCoordinator` and the class — a no-op unless a controller is live for that profile (this.controllers), otherwise call `this.auth.requestImmediatePoll()`. No new emit, no token/device_code access.
- src/main/ipc/ipc-schemas.ts: add `GitHubRefreshDeviceAuthPayload = GitHubProfilePayload`.
- src/main/ipc/ipc-handlers.ts: register `github:refreshDeviceAuth`, mirroring the `github:cancelDeviceAuth` handler (parse payload → call coordinator → return null).
- preload/index.ts: add `refreshDeviceAuth(profileId)` to the `github` bridge (mirror `cancelDeviceAuth`); src/renderer/types/window.d.ts: add its type to the `github` namespace.
- Tests (tests/unit/github-auth-immediate-poll.test.ts): deterministic with an injected fake `sleep` and `now` (no real timers) — a poke during a wait triggers exactly one early poll; a burst of pokes yields at most one bypass per interval window; a poke with no in-flight flow is a no-op; expiry/`deadline` and AbortSignal cancellation behavior are unchanged; the normal cadence is unchanged when no poke arrives.

Exit: `npx tsc --noEmit` clean on BOTH tsconfigs; `npm test` green for the new tests; `npm run lint` clean; the safety-reviewer subagent passes (no secrets logged, IPC Zod-validated, no new execution surface). No UI, no auth-event schema change.

Then run the standard progress footer.
```

---

## Phase 81 — "Checking with GitHub…" on return + return polish (renderer + e2e)

```
Work on Phase 81 of GitWarden (docs/plans/connect-return-check-plan.md §"Phase 81"). Renderer + e2e — the feature-complete stop point. Depends on Phase 80 (github:refreshDeviceAuth) being green.

Tasks:
- src/renderer/components/ConnectGitHubModal.tsx: add a `checking` local state and a focus effect that subscribes to window `focus` and document `visibilitychange` (→ visible), DEBOUNCED (~1s). On trigger, only while `status === 'awaitingUser'`: set `checking = true`, call `window.api.github.refreshDeviceAuth(profileId)`, and clear `checking` on the next authEvent (existing handler) or after a short fallback timeout (~2s — confirm the exact value at kickoff). While `checking`, render a spinner + `STR.GITHUB_MODAL_CHECKING` IN PLACE OF the static `STR.GITHUB_MODAL_WAITING` line. Clean up listeners/timers on unmount, mirroring the existing cleanup effects.
- Render `STR.GITHUB_MODAL_NO_ACCOUNT_HINT` as a small muted line under the code in the `awaitingUser` block.
- Ensure the `expired` terminal block keeps "Try Again" as the prominent primary action and reads clearly on return — presentation only, no logic change.
- src/renderer/strings.ts: add `GITHUB_MODAL_CHECKING: 'Checking with GitHub…'` and `GITHUB_MODAL_NO_ACCOUNT_HINT: "No GitHub account yet? Create one — we'll keep waiting."`. No hard-coded user-facing strings.
- e2e (tests/e2e/github-connect-return.spec.ts, or extend the existing GitHub-connect spec): with a flow in `awaitingUser`, firing visibilitychange→visible (or window focus) shows "Checking with GitHub…" and invokes github:refreshDeviceAuth; when the stub reports authorization the modal flips to "Connected"; when not yet authorized the line settles back to "Waiting…" (no stuck spinner); the new-user hint is visible; an `expired` flow shows a prominent "Try Again".

Exit: `npx tsc --noEmit` clean; `npm test`, `npm run e2e`, `npm run lint` all green; no hard-coded user-facing strings.

Then run the standard progress footer.
```
