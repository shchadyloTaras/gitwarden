# Plan — Guard Quick-Fix: one-click remediation for identity, account & push-auth errors

**Status:** 🟡 in progress — Phases 63–65 done; 66–67 open — **derived view**; the authoritative
state is the Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 63 → 67 (numbered feature; HEAD is Phase 65). Phase 66 (SSH Transport Binding) was
inserted after the logic phases; the original UI phase is now Phase 67.
**Feature-complete stop point:** Phase 67.
**Prompts:** [`docs/prompts/guard-quick-fix-prompts.md`](../prompts/guard-quick-fix-prompts.md).

## Goal

Today GitWarden **detects** identity / account / push-auth problems but makes the user **leave
the app to fix them**. Two concrete gaps motivated this feature:

1. A real push failed with the opaque banner **"An unexpected Git error occurred."** because
   [`ErrorMapper`](../../src/main/git/ErrorMapper.ts) doesn't recognize GitHub's HTTPS
   wrong-account / 403 rejection — it only matches the SSH `permission denied (publickey)` form
   ([ErrorMapper.ts:34-43](../../src/main/git/ErrorMapper.ts)) and falls through to `unknown`
   ([ErrorMapper.ts:110](../../src/main/git/ErrorMapper.ts)).
2. The remediation system is **navigational text only**: every safety issue maps to an
   `ACTION_HINTS` sentence like _"Open Profiles and select…"_
   ([safetyCopilotMessages.ts:88-107](../../src/core/ai/safetyCopilotMessages.ts)). The user
   reads it, then does the work by hand on another screen — or in the terminal.

This feature turns "here's where to go fix it" into **"click here to fix it, without the
terminal."** When the active profile, identity, or GitHub account is wrong for a repo, the user
resolves it with one button **right on the blocker**; when a push fails for an actionable reason,
they get a **diagnosed recovery banner** with the same one-click fix instead of a generic error.

**Product boundary (decided — Variant 1, "fix the push inside the app"):** GitWarden **never
mutates global/system state** — no `gh auth`, no global Git config, no `~/.ssh/config`,
no global `safe.directory`. This honors the AGENTS.md rule _"Don't change global git config —
only `--local`."_ It makes **its own** push bulletproof (one-click fixes + automatic per-push
token injection that already exists), and for failures it can only diagnose-and-redirect, never
repair the user's shell.

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **The token-injection seam already exists and works.** `push()` accepts an optional
   `auth?: PushAuth` and routes the credential through `GIT_ASKPASS` env only — the token never
   touches argv or `.git/config` ([GitService.ts:167-180](../../src/main/services/GitService.ts),
   [askpass.ts](../../src/main/git/askpass.ts), `GIT_TERMINAL_PROMPT=0`). The push IPC handler
   resolves the correct token automatically via `resolvePushAuth(services, repoPath, remote)`
   ([ipc-handlers.ts:338](../../src/main/ipc/ipc-handlers.ts),
   [ipc-handlers.ts:816](../../src/main/ipc/ipc-handlers.ts)). **Consequence:** a "switch to the
   assigned profile and retry the push" action needs only to make the right profile active and
   re-invoke the existing push path — the token follows.
2. **Profile auto-switch already exists.** `syncProfileToRepo`
   ([appStore.ts:18-27](../../src/renderer/store/appStore.ts)) sets the active profile to a repo's
   assigned profile on repo select, via `useProfilesStore.setActiveProfile`. It **no-ops** when
   the repo is unassigned, already matching, or the assigned profile isn't loaded — so a manual
   "switch now" remediation is still needed when the user has deliberately moved off the assigned
   profile, or when the push is initiated while mismatched.
3. **One executable fix already ships — as a one-off.** The Commit screen renders a
   "Set local identity to …" button that writes `--local` config
   ([CommitScreen.tsx:273-312](../../src/renderer/screens/CommitScreen.tsx) →
   [commitStore.ts:93](../../src/renderer/store/commitStore.ts) →
   `git:setLocalIdentity` [ipc-handlers.ts:307](../../src/main/ipc/ipc-handlers.ts) →
   [GitService.ts:127](../../src/main/services/GitService.ts)). This is the **proof of pattern**
   to generalize — every executable remediation should feel like this button, and it should be
   driven by the model, not hand-wired per code.
4. **Remediation is otherwise text-only.** `SAFETY_ACTION_BY_CODE` maps each `SafetyCode` to a
   `SafetySuggestedAction`, and `ACTION_HINTS` maps each action to a _navigational sentence_
   ([safetyCopilotMessages.ts:64-107](../../src/core/ai/safetyCopilotMessages.ts)). There is no
   notion of "this action is executable in-app." `SafetySuggestedAction` is defined in
   [src/core/ai/types.ts](../../src/core/ai/types.ts).
5. **Severities/codes are already right.** `GITHUB_ACCOUNT_MISMATCH`, `PROFILE_MISMATCH`,
   `IDENTITY_UNSET`, `GITHUB_TOKEN_MISSING/INVALID` are blockers
   ([safetyMessages.ts:4-26](../../src/core/safety/safetyMessages.ts)); GitHub push issues are
   produced by `checkPush` only when the target is an HTTPS GitHub remote
   ([SafetyCheckService.ts](../../src/core/safety/SafetyCheckService.ts)). No reclassification
   needed — this feature adds **actions**, not new verdicts.
6. **The IPC envelope flattens errors to a string — this is the linchpin.**
   `IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }`
   ([ipc-handlers.ts:131](../../src/main/ipc/ipc-handlers.ts),
   [window.d.ts:48](../../src/renderer/types/window.d.ts)), and `wrap()` collapses every thrown
   error to `err.message` ([ipc-handlers.ts:133-138](../../src/main/ipc/ipc-handlers.ts)). The
   renderer push path then does `if (!res.ok) throw new Error(res.error)` and stores only the
   string ([remoteStore.ts:114-118](../../src/renderer/store/remoteStore.ts)). So
   `GitError.code` — the thing the UI needs to pick a fix — **is destroyed at the boundary.**
   The envelope must carry structured failure info before any recovery UI is possible.
7. **`ErrorMapper` is pure** (imports only types) and already classifies seven families
   ([ErrorMapper.ts](../../src/main/git/ErrorMapper.ts)). Extending it is low-risk and unit-test
   friendly. The wrong-account HTTPS push and the **folder-move "dubious ownership"** failure
   (the user moved/renamed the repo dir) both currently fall through to `unknown`.
8. **Navigation target type exists.** `NavScreen`
   ([appStore.ts:29-38](../../src/renderer/store/appStore.ts)) enumerates every screen a
   navigate-style remediation can route to (`repositories`, `commit`, `status`, `remote`,
   `branches`, `safety-center`, `profiles`, `settings`).

## Scope

**In scope** — make every identity/account/push-auth issue _resolvable in-app_:

- A core **remediation model** that classifies each `SafetyCode` and each actionable
  `GitErrorCode` as **executable** (one-click, in-app) or **navigate** (open the right screen),
  with the existing `ACTION_HINTS` text retained as the description.
- **Push-failure diagnosis**: `ErrorMapper` recognizes GitHub HTTPS wrong-account/403, token
  rejection (401/invalid), and dubious-ownership (folder move) → actionable codes.
- **Structured IPC errors**: the envelope additively carries `code` + `remediation` so the
  renderer can map a failure to a fix (the `error` string stays, for backward compat).
- **Executable fix actions** in main, behind typed + Zod-validated IPC: switch active profile,
  set local identity (exists), reconnect GitHub, and **switch-profile-and-retry-push**.
- **UI**: a reusable fix affordance on each blocker/warning (executable → button; navigate →
  link), and a **failed-push recovery banner** that reads the structured error.

**Out of scope / Non-goals:**

- **No mutation of global/system state** — no `gh auth login/switch/setup-git`, no
  `git config --global`, no `~/.ssh/config` edits, no global `safe.directory`. GitWarden fixes
  _its own_ push, never the user's terminal. (Dubious-ownership is therefore **diagnosed and
  explained**, not auto-fixed.)
- **No new safety verdicts or severities** — this feature adds remediation _actions_ over the
  existing engine output.
- **No AI dependency** — remediation is deterministic and works with AI disabled (consistent
  with the Safety Copilot's "works offline" guarantee).
- **No auto-execution** — a fix runs only on explicit user click. The blocker still blocks until
  then; remote actions (retry-push) keep their confirmation.

## The remediation model (new core contract)

New pure module `src/core/safety/remediation.ts` (no `fs`/`child_process`/Electron/DOM):

```ts
import type { SafetyCode } from './SafetyCheckService.js'
import type { SafetySuggestedAction } from '../ai/types.js'
import { SAFETY_ACTION_BY_CODE } from '../ai/safetyCopilotMessages.js'

/** Actionable git failure codes that carry a remediation (subset of GitErrorCode). */
export type RemediableGitErrorCode =
  | 'pushRejectedWrongAccount' // NEW: remote: Permission to X denied to Y / 403 on push
  | 'authenticationFailed' // EXISTING code, now remediable: 401 / token rejected
  | 'dubiousOwnership' // NEW: repo dir moved/renamed → git refuses (explain-only)

/** How the UI should offer the fix. */
export type RemediationKind = 'executable' | 'navigate'

export interface Remediation {
  action: SafetySuggestedAction
  kind: RemediationKind
  /** For navigate kind: which screen to open. */
  navigateTo?: NavTarget
}

/** Stable, renderer-agnostic screen ids (renderer maps these to NavScreen). */
export type NavTarget = 'repositories' | 'commit' | 'status' | 'remote' | 'branches' | 'profiles'

/** The four actions GitWarden can perform in-app without touching global state. */
export const EXECUTABLE_ACTIONS = new Set<SafetySuggestedAction>([
  'set-local-identity',
  'switch-active-profile',
  'reconnect-github',
  'switch-profile-and-retry-push', // NEW (added to SafetySuggestedAction)
])

export function remediationForSafetyCode(code: SafetyCode): Remediation {
  /* … */
}
export function remediationForGitError(code: RemediableGitErrorCode): Remediation {
  /* … */
}
```

**Executable vs navigate mapping (decided):**

| Action                                                             | Kind       | What the click does (in-app, no terminal)                 |
| ------------------------------------------------------------------ | ---------- | --------------------------------------------------------- |
| `set-local-identity`                                               | executable | write profile name/email to **`--local`** config (exists) |
| `switch-active-profile`                                            | executable | `setActiveProfile(assignedProfileId)`                     |
| `switch-profile-and-retry-push`                                    | executable | switch active profile → re-run push (token auto-resolves) |
| `reconnect-github`                                                 | executable | launch the device-flow connect for the assigned profile   |
| `assign-repo-profile`                                              | navigate   | → `repositories`                                          |
| `stage-changes` / `review-staged-changes` / `write-commit-message` | navigate   | → `commit` / `status`                                     |
| `resolve-conflicts`                                                | navigate   | → `status`                                                |
| `configure-remote`                                                 | navigate   | → `remote`                                                |
| `switch-branch`                                                    | navigate   | → `branches`                                              |
| `edit-push-policy`                                                 | navigate   | → `repositories`                                          |

`dubiousOwnership` is **navigate/explain only** (no auto-fix): it routes to `repositories` with
the explanation that the repo folder moved and how to re-point or re-add it — GitWarden won't
write a global `safe.directory`.

---

## Phase 63 — Remediation Model & Action Contracts (pure core)

**Goal:** the deterministic contract that every later phase consumes. Logic-first; no UI, no IPC.

**Implementation:**

- Add `src/core/safety/remediation.ts` (PURE) with the types and the two mapping functions above.
  Build `remediationForSafetyCode` on top of the existing `SAFETY_ACTION_BY_CODE` (don't fork the
  code→action map — derive `kind`/`navigateTo` from it). Mark actions in `EXECUTABLE_ACTIONS` as
  `executable`; everything else `navigate` with its `navigateTo`.
- Extend `SafetySuggestedAction` in [src/core/ai/types.ts](../../src/core/ai/types.ts) with
  `'switch-profile-and-retry-push'`; add its `ACTION_HINTS` entry in
  [safetyCopilotMessages.ts](../../src/core/ai/safetyCopilotMessages.ts) (an in-app description,
  e.g. _"Switch to the repository's assigned profile and push with its GitHub account."_) and its
  `SAFETY_ACTION_BY_CODE` use for `GITHUB_ACCOUNT_MISMATCH` (today `reconnect-github` — keep that
  for token problems; `switch-profile-and-retry-push` is the diagnosis-side action for a _failed_
  wrong-account push).
- Add `tests/unit/remediation.test.ts`: every `SafetyCode` yields a `Remediation`
  (exhaustive — no `default` gap); executable flags match the table; navigate actions carry a
  `navigateTo`; each `RemediableGitErrorCode` maps correctly; `switch-profile-and-retry-push`
  is executable.

**Exit criteria:** `npx tsc --noEmit` clean on both tsconfigs; `npm test` green for the new
file; `src/core/` stays pure (core-purity hook/subagent passes); no UI/IPC changes.

**Files:** new `src/core/safety/remediation.ts`, new `tests/unit/remediation.test.ts`;
edit `src/core/ai/types.ts`, `src/core/ai/safetyCopilotMessages.ts`.

---

## Phase 64 — Push-Failure Diagnosis & Structured IPC Errors

**Goal:** failures arrive at the renderer **diagnosed and actionable**, not as an opaque string.

**Implementation:**

- **ErrorMapper** ([ErrorMapper.ts](../../src/main/git/ErrorMapper.ts)) — extend the classifier
  with real-stderr regexes. **Reconcile with the existing `authenticationFailed` matcher**
  ([ErrorMapper.ts:34-43](../../src/main/git/ErrorMapper.ts)) — do **not** add a second code that
  re-matches "authentication failed":
  - **New** `pushRejectedWrongAccount`, placed **before** the existing auth matcher so it wins:
    `remote: Permission to .+ denied to .+`, `The requested URL returned error: 403`,
    `\berror: 403\b`. The token is valid but for the wrong account → its remediation is the
    _switch-and-retry_ path, not reconnect.
  - **Extend** the existing `authenticationFailed` matcher to also catch HTTPS token rejection —
    `could not read Username`, `Invalid username or password`, `\b401\b` — and make this code
    **remediable** (`remediationForGitError('authenticationFailed')` → `reconnect-github`).
  - **New** `dubiousOwnership`: `detected dubious ownership in repository` (the folder-move case)
    → navigate/explain only.
  - Each new/extended branch gets a `userMessage` that names the real problem (e.g. _"GitHub
    rejected the push: you're authenticated as a different account than this repo's profile."_).
    Extend `GitErrorCode` in [src/core/types.ts](../../src/core/types.ts) with the **two new**
    codes only (`pushRejectedWrongAccount`, `dubiousOwnership`); `authenticationFailed` already
    exists.
- **Structured envelope (additive, non-breaking):** extend `IpcResult`'s error arm to
  `{ ok: false; error: string; code?: GitErrorCode; remediation?: Remediation }` in
  [ipc-handlers.ts:131](../../src/main/ipc/ipc-handlers.ts) and
  [window.d.ts:48](../../src/renderer/types/window.d.ts). Update `wrap()`
  ([ipc-handlers.ts:133-138](../../src/main/ipc/ipc-handlers.ts)) to detect a `GitError` and
  attach `code` + (when the code is remediable) `remediation` from the core model. The `error`
  string stays exactly as-is, so every existing consumer keeps working.
- **Surface it on the push path:** update `remoteStore.doRemotePush`
  ([remoteStore.ts:109-122](../../src/renderer/store/remoteStore.ts)) to keep the structured
  fields (`code`, `remediation`) instead of collapsing to `new Error(res.error)`. Store a
  `lastFailure: { message, code?, remediation? } | null`.

**Exit criteria:** `npx tsc --noEmit` clean; unit tests for each new ErrorMapper code using
captured stderr fixtures (green); a focused test that `wrap()` attaches `code`/`remediation` for a
thrown `GitError` and leaves plain errors string-only; `npm run lint` clean. Logic stays pure;
no UI yet.

**Files:** edit `src/main/git/ErrorMapper.ts`, `src/core/types.ts`,
`src/main/ipc/ipc-handlers.ts`, `src/renderer/types/window.d.ts`,
`src/renderer/store/remoteStore.ts`; new/extended `tests/unit/error-mapper.test.ts`.

---

## Phase 65 — Executable Fix Actions (main + IPC)

**Goal:** the four executable remediations actually run, behind typed + Zod-validated IPC,
honoring every safety rule (no global state, args arrays, remote behind confirmation, no secret
logging).

**Implementation:**

- Add a Zod-validated IPC channel `remediation:execute` (payload: `{ action, repoPath,
profileId?, remote?, branch? }`) in [ipc-handlers.ts](../../src/main/ipc/ipc-handlers.ts),
  dispatching to:
  - `set-local-identity` → existing `services.git.setLocalIdentity`
    ([GitService.ts:127](../../src/main/services/GitService.ts)).
  - `switch-active-profile` → settings service that backs `setActiveProfile` (reuse the same
    path the renderer store uses; the IPC just sets the active profile id).
  - `reconnect-github` → kick off the existing device-flow auth service for the assigned
    profile and return the result so the UI can show the code/url.
  - `switch-profile-and-retry-push` → set the assigned profile active, then call
    `services.git.push(repoPath, remote, branch, await resolvePushAuth(...))`. **Remote action:**
    it runs only from an explicit user click (the button label _is_ the confirmation), goes
    through `GitRunner`'s per-repo serialization, and re-classifies any new failure through the
    same structured envelope (so a second wrong-account/token error returns a fresh remediation).
- Guard rails: validate the payload with Zod; refuse `switch-profile-and-retry-push` when the
  repo is unassigned (return a remediation pointing at `assign-repo-profile`); never log the
  token; keep git args as arrays.

**Exit criteria:** integration tests (Vitest) drive each action against **offline fixtures** —
a temp git repo + a **local bare repo as the remote** for the retry-push happy path and a
rejecting remote for the failure path; the device-flow service is mocked. `npx tsc --noEmit`
clean; `npm test` green; safety-reviewer subagent passes (no secret logging, remote behind
explicit action, args arrays).

**Files:** edit `src/main/ipc/ipc-handlers.ts`, `src/main/services/GitService.ts` (if a thin
retry helper helps), `src/main/ipc/schemas.ts` (Zod payload), `src/renderer/types/window.d.ts`
(typed bridge method); new `tests/unit/remediation-actions.test.ts` (or integration spec).

---

## Phase 66 — SSH Transport Binding (the assigned profile governs the SSH key)

**Goal:** make the assigned profile actually determine which SSH key authenticates a push, by
binding the repo's `--local` SSH remote host to the profile's declared `sshKeyAlias`. Closes the
**silent wrong-key push** gap and makes Phase 65's `switch-profile-and-retry-push` switch identity
on SSH remotes (today it only swaps the HTTPS token). Honors ADR 0002 (no key management, no
`~/.ssh/config` parsing, no `GIT_SSH_COMMAND`); recorded as **ADR 0009** (amends 0002).

**Background (verified):** `sshKeyAlias` is a profile's ssh `Host` alias (UI "SSH Host Alias",
[ProfilesScreen.tsx:713](../../src/renderer/screens/ProfilesScreen.tsx)), **stored but unused**
([types.ts:10](../../src/core/types.ts) + schema only). The push host check is
`expectedRemoteHosts`-only ([SafetyCheckService.ts:270-274](../../src/core/safety/SafetyCheckService.ts)).
Identity is already reconciled on assignment via `applyAssignedProfileIdentity`
([ipc-handlers.ts](../../src/main/ipc/ipc-handlers.ts)) — the same seam this phase extends.

**Implementation:**

- **Registration (docs):** this phase renumbers the UI phase. In `docs/progress-log.md`: rename the
  old "Phase 66 — One-Click Fix UI" checklist row → **Phase 67**, add a **Phase 66 — SSH Transport
  Binding** row, update the Feature Track Status row to `63–67`; extend the AGENTS.md build order to
  `… → 63→67`. (The plan + prompts files are already renumbered.)
- **Pure core — alias-aware host check:** in
  [SafetyCheckService.ts:270-274](../../src/core/safety/SafetyCheckService.ts), a remote matches when
  `r.host ∈ (expectedRemoteHosts ∪ {sshKeyAlias})`. Once the remote is bound to the alias, that alias
  IS an expected host; without this the bind triggers a false `REMOTE_HOST_MISMATCH` blocker. Stays pure.
- **Pure helper — remote URL transform:** new `src/core/github/remoteAlias.ts`:
  `bindHostToAlias(url, alias)` / `restoreHost(url, host)` swap only the host of an scp-like/ssh
  remote (`git@github.com:o/r.git` ↔ `git@<alias>:o/r.git`), reusing the existing remote parsing;
  HTTPS URLs returned unchanged. Pure + unit-testable.
- **Main — apply the bind:** add `reconcileAssignedProfileRemote` next to
  `applyAssignedProfileIdentity` on `repositories:update`. When the assigned profile is
  `authenticationMethod==='ssh'` with a non-empty `sshKeyAlias` and the origin is an SSH GitHub
  remote, set the `--local` origin host to the alias (`GitService` → `git remote set-url`, args
  array). On unassign / switch to a profile without an ssh alias, restore the canonical host
  (capture the pre-bind host on the `RepositoryRecord` for exact reversal; fall back to
  `expectedRemoteHosts[0] ?? 'github.com'`). HTTPS/token untouched. **Best-effort** like the identity
  reconcile — a rewrite failure never blocks assignment (Safety Center still reports the mismatch).
- **ADR + spec:** ADR 0009 is added (`docs/adr/0009-ssh-transport-binding.md`); add its row to
  `docs/adr/README.md` and a one-line note to `docs/features/gitwarden/spec.md` §AC-08/AC-12 (the app
  may set the remote host to the profile's alias; still no `GIT_SSH_COMMAND`, no config parsing).

**Exit criteria:** `npx tsc --noEmit` clean on both tsconfigs; **unit** (pure) — the alias-aware host
check passes when the remote host equals the profile's `sshKeyAlias` and still fires
`REMOTE_HOST_MISMATCH` when neither alias nor `expectedRemoteHosts` match; `remoteAlias` bind/restore
covered (scp + ssh + HTTPS-untouched). **Integration** (offline, real temp git repo) — assigning an
SSH profile with alias `X` to a repo whose origin is `git@github.com:o/r.git` rewrites the `--local`
origin to `git@X:o/r.git` (asserted via `git remote get-url`); switching to another SSH profile
re-points; switching to a token profile / unassigning restores the canonical host; an HTTPS origin and
an aliasless profile are untouched. `npm run lint` clean; `src/core/` stays pure; the
**safety-reviewer** subagent passes (no global state, no `~/.ssh/config` writes, no `GIT_SSH_COMMAND`,
git args arrays). **No UI** in this phase.

**Files:** new `src/core/github/remoteAlias.ts`, `docs/adr/0009-ssh-transport-binding.md`; edit
`src/core/safety/SafetyCheckService.ts`, `src/main/ipc/ipc-handlers.ts`,
`src/main/services/GitService.ts` (thin `setRemoteUrl` if needed), `src/core/types.ts` +
`src/core/schemas.ts` (pre-bind host on `RepositoryRecord`), `docs/adr/README.md`,
`docs/features/gitwarden/spec.md`; new/extended `tests/unit/safety-*.test.ts`,
`tests/unit/remote-alias.test.ts`, and an integration spec for the reconcile.

---

## Phase 67 — One-Click Fix UI & Failed-Push Recovery (renderer + e2e)

**Goal:** the user fixes the problem where they hit it — feature-complete stop point.

**Implementation:**

- **Generalize the proven pattern.** Extract a `RemediationButton`/`RemediationRow` component
  that, given an issue's `Remediation`, renders either a **fix button** (executable → calls
  `window.api.remediation.execute(...)`, shows a pending state like the existing identity button)
  or a **"Go to …" link** (navigate → `navigate(navigateTo)`). Reuse the visual treatment of the
  current "Set local identity" button ([CommitScreen.tsx:273-312](../../src/renderer/screens/CommitScreen.tsx)).
- **Wire it on the blockers/warnings** in `CommitScreen` (and the push sheet / Safety Center
  issue lists where the same issues render) so each issue shows its one-click fix. The existing
  bespoke identity button is replaced by the generic one driven by the model.
- **Failed-push recovery banner:** when `remoteStore.lastFailure.remediation` is set, replace the
  generic error text with a diagnosed banner — the real `userMessage` + the one-click fix
  (e.g. **"Switch to Work (eleken-git) and push"**, **"Reconnect GitHub"**) — matching the
  approved mockup. `dubiousOwnership` shows the explain-only path (what happened + how to
  re-point the repo), no fix button.
- **Strings:** externalize all new copy in [strings.ts](../../src/renderer/strings.ts)
  (`REMEDIATION_*`, recovery-banner labels).

**Exit criteria (Playwright e2e, offline fixtures + local bare remote):**

- Active profile ≠ assigned profile → Commit/push blocker shows the executable fix; clicking it
  switches profile and the push succeeds to the bare remote.
- A push that the fixture remote rejects (wrong account / 403) → recovery banner shows the
  diagnosis + fix, **not** "An unexpected Git error occurred."
- Token-invalid path → banner offers **Reconnect GitHub**.
- A navigate-only issue (e.g. unassigned repo) → shows a "Go to Repositories" link, not a fix
  button.
- `npm test`, `npm run e2e`, `npm run lint` green; no hard-coded user-facing strings.

**Files:** new `src/renderer/components/RemediationButton.tsx`; edit `CommitScreen.tsx`,
the push-sheet/Safety Center issue rendering, `remoteStore.ts`, `strings.ts`,
`src/renderer/types/window.d.ts`; new/extended `tests/e2e/*.spec.ts`.

---

## Acceptance criteria (feature)

- No identity/account/push-auth blocker requires the terminal to resolve — each is fixed in-app
  by one click (executable) or one navigation (navigate).
- A wrong-account / 403 / token-rejected push surfaces a **named diagnosis + one-click fix**;
  "An unexpected Git error occurred." no longer appears for these cases.
- GitWarden never mutates global/system state (verified: no `gh`, no `--global`, no ssh-config,
  no global `safe.directory` writes anywhere in the diff).
- The remediation model is the single source for "which fix, executable or navigate"; the UI is
  data-driven, not per-code hand-wiring.
- Works with AI disabled. Remote retry-push stays behind explicit user action and `GitRunner`
  serialization; tokens are never logged; git args are arrays.
- Logic-first honored: Phases 63–66 ship green Vitest before the UI; Phase 67 has green
  Playwright. One commit per phase; progress-log entry written **before** each commit; not pushed.
- The assigned profile governs the SSH key on push: the repo's `--local` remote host is bound to the
  profile's ssh alias (ADR 0009) — no `GIT_SSH_COMMAND`, no `~/.ssh/config` writes.

## Decisions (resolved)

1. **Product boundary:** Variant 1 — fix GitWarden's own push; never touch global/system state.
2. **Executable set:** exactly the four actions in `EXECUTABLE_ACTIONS`; all others are navigate.
3. **`dubiousOwnership` (folder move):** diagnosed + explained, **not** auto-fixed (would require
   global `safe.directory`).
4. **IPC envelope:** extend additively (`error` string stays; add optional `code` +
   `remediation`) — no breaking change to existing consumers.
5. **Retry-push confirmation:** the explicit fix-button click is the confirmation; no second
   modal, but it still flows through normal push serialization and re-diagnosis on failure.
6. **SSH transport (ADR 0009):** bind the `--local` remote host to the profile's ssh alias (option B)
   — honors ADR 0002 (no key management, no `~/.ssh/config`, no `GIT_SSH_COMMAND`); makes
   `switch-profile-and-retry-push` actually switch identity on SSH remotes.

## Open questions (resolve at kickoff)

- **Phase registration:** Phases 63–66 are registered (63–65 done). The new **Phase 66 (SSH
  Transport Binding)** renumbers the old UI phase to **67**; its kickoff re-derives the views —
  rename the checklist's UI row to Phase 67, add a Phase 66 (SSH Binding) row, update the Feature
  Track Status to `63–67`, and extend the AGENTS.md build order to `… → 63→67`.
- **Safety Center parity:** should the same `RemediationButton` also render in the Safety Center
  issue list in Phase 66, or stay Commit/push-only for the MVP and follow up? (Lean: include it —
  it's the same component and the issues already render there.)
