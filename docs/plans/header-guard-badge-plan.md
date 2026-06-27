# Plan — Replace static SAFE badge with a live header guard

**Status:** ✅ implemented (commit 233a08e)
**Type:** fix / improvement (not a numbered phase)
**Suggested commit:** `Fix: Replace static SAFE badge with live header guard`

## Goal

The header badge today is a **lie**: it always reads `Safe`. Replace it with an honest, live
indicator that answers one question only:

> Does GitWarden currently see the right profile and Git identity for **this** repository?

The badge must never imply commit/push safety. Those stay on the Commit / Remote / Safety
Center screens. The header guard reports **repo / profile / Git-identity alignment** and nothing
else.

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **The badge is already 100% static.** `setSafetyBadge` is defined in
   [appStore.ts:89](../../src/renderer/store/appStore.ts) but **never called anywhere**
   (`grep setSafetyBadge` → only its own definition). `safetyBadge` is initialised to `'safe'`
   and never changes. So removal is clean — there is no live wiring to preserve. The whole
   `SafetyBadge` type + `safetyBadge` state + `setSafetyBadge` action can be deleted.
2. **`safetyCheckService.checkRepositoryIdentity` already exists** and is exactly the right
   input — see [SafetyCheckService.ts:171](../../src/core/safety/SafetyCheckService.ts). It
   returns `{ canCommit, canPush, issues }` where each issue has
   `severity: 'warning' | 'blocker'`. We use **only** this method — never `checkCommit` /
   `checkPush`.
3. **Severities already match the desired blocked/review split** — no reclassification needed
   ([safetyMessages.ts](../../src/core/safety/safetyMessages.ts)):
   - `NO_ACTIVE_PROFILE`, `REPO_UNASSIGNED`, `PROFILE_MISMATCH`, `IDENTITY_UNSET` → **blocker** → `blocked`
   - `EMAIL_MISMATCH`, `EMAIL_FROM_GLOBAL_ONLY` → **warning** → `review`
   - Commit/push-only codes (`NOTHING_STAGED`, `EMPTY_MESSAGE`, `HAS_CONFLICTS`, `NO_REMOTE`,
     `REMOTE_HOST_MISMATCH`, all `GITHUB_*`, `STAGED_SECRET_DETECTED`) are **never produced** by
     `checkRepositoryIdentity`, so they structurally cannot reach the header.
4. **`window.api.git.getEffectiveIdentity(repoPath)` exists** and returns
   `IpcResult<EffectiveGitIdentity>` ([window.d.ts:126](../../src/renderer/types/window.d.ts)).
5. **`safetyCenterStore` is the exact template** for the new store — it already wires
   `getEffectiveIdentity` + `checkRepositoryIdentity` and contains a **dangling-profile
   normalization** ([safetyCenterStore.ts:51](../../src/renderer/store/safetyCenterStore.ts)):
   if `assignedProfileId` no longer resolves to a profile, treat the repo as unassigned. The
   header store **must reuse this** so the header and Safety Center never disagree.
6. **One e2e assertion pins the old text** —
   [shell.spec.ts:93](../../tests/e2e/shell.spec.ts) expects `header-safety-badge` to read
   `'Safe'`. It must be rewritten.
7. **Trigger pattern to mirror:** `SafetyCenterScreen` drives its load via a `useEffect` with
   deps `[activeRepo, activeProfile_, load, profiles]`. The header is always mounted, so the
   same effect placed in `GlobalHeader` gives app-wide live updates without cross-store
   subscriptions.

## Scope

**In the header guard** (all from `checkRepositoryIdentity`):
active repo selected · active profile exists · repo assigned to a profile · active profile
matches assigned profile · Git `user.name`/`user.email` set · Git email matches profile email ·
identity source is `local` vs `global`.

**Not in the header guard** (stay on Commit / Remote / Safety Center): empty commit message ·
nothing staged · merge conflicts · staged-secret scan · no remote · GitHub token missing/invalid
· push account mismatch.

## States

```ts
export type HeaderGuardState =
  | 'checking' // async in flight
  | 'ready' // repo/profile/identity aligned (NOT "safe to commit/push")
  | 'review' // warnings only (email mismatch / global-only identity)
  | 'blocked' // any blocker (unassigned / profile mismatch / identity unset / no profile)
  | 'not-checked' // no repo, or identity could not be resolved (IPC error)
```

**Crucial distinction:** "identity not configured" (`getEffectiveIdentity` returns an object
with empty `userName`/`userEmail`) is **`blocked`** via `IDENTITY_UNSET` — _not_ `not-checked`.
`not-checked` is reserved for "no active repo" or "the IPC call itself failed" (git missing,
repo unreadable). Conflating these would hide a real misconfiguration behind a neutral chip.

`Guard · Ready` means only that repo/profile/Git identity are consistent — **not** that a commit
or push will succeed.

---

## Implementation

### Step 1 — Audit & confirm removal surface

Confirm (already done in this plan, re-verify at implementation time) every `safetyBadge`
reference: [appStore.ts](../../src/renderer/store/appStore.ts) (state/type/action),
[GlobalHeader.tsx](../../src/renderer/components/GlobalHeader.tsx) (`BADGE_STYLE`,
`BADGE_LABEL`, render), [Inspector.tsx](../../src/renderer/components/Inspector.tsx) (Safety
section), [shell.spec.ts](../../tests/e2e/shell.spec.ts) (assertion). Outcome: all are
safe to delete/replace because the value is static.

### Step 2 — Pure guard mapper (core)

**New file:** `src/core/safety/headerGuard.ts` — pure, no `fs`/`child_process`/Electron/DOM
(obeys the `src/core/` purity rule). It owns the "which method, which thresholds" decision so it
is enforced in one place and trivially unit-testable.

```ts
import type { Profile, RepositoryRecord, EffectiveGitIdentity } from '../types.js'
import { safetyCheckService } from './SafetyCheckService.js'

export type HeaderGuardState = 'checking' | 'ready' | 'review' | 'blocked' | 'not-checked'

export interface HeaderGuardInput {
  loading: boolean
  hasRepo: boolean
  /** getEffectiveIdentity (or any prerequisite) failed to resolve. */
  errored: boolean
  repository: RepositoryRecord | null
  activeProfile: Profile | null
  /** Resolved identity, or null if it could not be read. */
  identity: EffectiveGitIdentity | null
}

export interface HeaderGuard {
  state: HeaderGuardState
  issueCount: number
}

export function deriveHeaderGuard(input: HeaderGuardInput): HeaderGuard {
  if (input.loading) return { state: 'checking', issueCount: 0 }
  if (!input.hasRepo || input.errored || !input.repository || !input.identity) {
    return { state: 'not-checked', issueCount: 0 }
  }
  const { issues } = safetyCheckService.checkRepositoryIdentity({
    repository: input.repository,
    activeProfile: input.activeProfile ?? undefined,
    identity: input.identity,
  })
  if (issues.some((i) => i.severity === 'blocker')) {
    return { state: 'blocked', issueCount: issues.length }
  }
  if (issues.length > 0) return { state: 'review', issueCount: issues.length }
  return { state: 'ready', issueCount: 0 }
}
```

Mapper rules (spec → code): loading → `checking`; no repo / error / no identity → `not-checked`;
any blocker → `blocked`; warnings only → `review`; clean → `ready`. The mapper calls
`checkRepositoryIdentity` internally so callers cannot accidentally feed it commit/push results.

### Step 3 — Header guard store (renderer)

**New file:** `src/renderer/store/headerGuardStore.ts`. Modeled on `safetyCenterStore`, with a
**stale-async guard** (the header recomputes on every fast repo switch).

State: `{ loading, state: HeaderGuardState, issueCount, error: string | null }`.

Action: `refresh(repoPath, repository, activeProfile, profiles)` and a `reset()` for the no-repo
case.

Requirements:

- Reuse the **dangling-profile normalization** from `safetyCenterStore` (if
  `assignedProfileId` doesn't resolve, treat the repo as unassigned) so the header matches the
  Safety Center verdict.
- Call **only** `window.api.git.getEffectiveIdentity(repoPath)` (the header doesn't need
  remotes/status). On `ok:false` → `errored:true` → `not-checked`.
- Compute the final state by calling `deriveHeaderGuard(...)` from the core mapper.
- **Stale guard:** keep a monotonic `reqId`; increment on each `refresh`; capture it locally;
  after the await, bail (no `set`) if `reqId` changed. This prevents a slow result for repo A
  from overwriting a newer result for repo B.

Sketch:

```ts
let reqId = 0
// inside refresh:
const myReq = ++reqId
set({ loading: true, error: null /* state stays until result, or set to 'checking' */ })
const res = await window.api.git.getEffectiveIdentity(repoPath)
if (myReq !== reqId) return // a newer refresh superseded us — drop stale result
const identity = res.ok ? res.data : null
const guard = deriveHeaderGuard({
  loading: false,
  hasRepo: true,
  errored: !res.ok,
  repository: normalizedRepo,
  activeProfile,
  identity,
})
set({
  loading: false,
  state: guard.state,
  issueCount: guard.issueCount,
  error: res.ok ? null : res.error,
})
```

### Step 4 — GlobalHeader

In [GlobalHeader.tsx](../../src/renderer/components/GlobalHeader.tsx):

- Remove `safetyBadge` from the `useAppStore()` destructure, and delete `BADGE_STYLE` /
  `BADGE_LABEL` and the `header-safety-badge` span.
- Add a `useEffect` (deps `[activeRepo, activeProfile, profiles]`) that calls
  `headerGuardStore.refresh(activeRepo.localPath, activeRepo, activeProfile, profiles)` when a
  repo is active, else `reset()`. Mirror `SafetyCenterScreen`'s effect.
- Render a **clickable** `GuardBadge` reading `{ state, issueCount }` from the store:
  - Label: `Guard · Ready` / `Guard · Review` / `Guard · Blocked` / `Guard · Checking` /
    `Guard · Not checked` (from `STR`).
  - Click: active repo → `navigate('safety-center')`; no repo → `navigate('repositories')`.
  - `aria-label` includes the state **and** issue count plus the destination hint, e.g.
    `"Guard status: Blocked, 2 issues. Open Safety Center."`
  - **Rename `data-testid` to `header-guard-badge`** (decided) — the meaning changed, so the
    test id should too. Update every spec that referenced `header-safety-badge`.

Colors (reuse existing theme vars already in `BADGE_STYLE`):
| State | Color |
|---|---|
| ready | green — `--gw-success-solid` |
| review | amber — `--gw-warning-solid` |
| blocked | red — `--gw-danger-solid` |
| checking / not-checked | neutral gray — `--gw-surface3` bg / `--gw-text-muted` text |

Drop the `textTransform: uppercase` (the label now carries `Guard · …` mixed case).

### Step 5 — Inspector

In [Inspector.tsx](../../src/renderer/components/Inspector.tsx): the `Safety` section currently
renders `{safetyBadge}`. Replace it with the **same guard state** from `headerGuardStore`
(decided — **show the state**, don't drop the row). Read-only: the Inspector does **not**
trigger a refresh; the header owns the effect, single source of truth. Render it subtly (muted,
smaller) so it doesn't compete with the header. Relabel the section `Guard`. Same color logic,
lower visual weight.

### Step 6 — Strings

Add to [strings.ts](../../src/renderer/strings.ts):

```ts
GUARD_READY: 'Guard · Ready',
GUARD_REVIEW: 'Guard · Review',
GUARD_BLOCKED: 'Guard · Blocked',
GUARD_CHECKING: 'Guard · Checking',
GUARD_NOT_CHECKED: 'Guard · Not checked',
GUARD_OPEN_SAFETY_CENTER: 'Open Safety Center',
GUARD_OPEN_REPOSITORIES: 'Open Repositories',
```

The `aria-label` is composed in the component from the label + issue count + the relevant
`GUARD_OPEN_*` hint (count is dynamic, so it isn't a static string).

### Step 7 — Tests

**Unit** — `tests/unit/header-guard.test.ts` (alongside `safety-engine.test.ts`; vitest glob
`tests/unit/**/*.test.ts` already covers it). Cover the mapper via `deriveHeaderGuard`:

- clean identity context → `ready`
- email mismatch → `review`; global-only identity (`emailSource !== 'local'`) → `review`
- repo unassigned → `blocked`; profile mismatch → `blocked`; identity unset
  (empty `userName`/`userEmail`) → `blocked`; no active profile → `blocked`
- `loading:true` → `checking`; `hasRepo:false` → `not-checked`; `errored:true` /
  `identity:null` → `not-checked`
- **commit/push-only issues are not part of the header** — assert that an input which is
  otherwise `ready` stays `ready` regardless of staging/remote/message state (these are never
  passed to `checkRepositoryIdentity`, so the test documents the structural guarantee).
- `issueCount` matches the number of identity issues.

**E2E** — update [shell.spec.ts](../../tests/e2e/shell.spec.ts) and add header-guard behavior
(reuse the fixture-repo harness from
[safety-center.spec.ts](../../tests/e2e/safety-center.spec.ts) for identity states):

- header no longer shows `SAFE`/`Safe`
- a normal, aligned repo shows `Guard · Ready`
- a broken identity or unassigned repo shows `Guard · Blocked`
- clicking the guard with an active repo opens the Safety Center
- no active repo → `Guard · Not checked` and clicking routes to Repositories

### Step 8 — Docs & closeout

- Add a dated entry to [docs/progress-log.md](../../docs/progress-log.md) in the existing
  `### YYYY-MM-DD — Fix: …` format (Fixed / Files / Tests / Notes).
- Run `npm test`, `npm run e2e`, `npm run lint`. Commit **only** on green, as
  `Fix: Replace static SAFE badge with live header guard` with the
  `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. Do **not** push.

## Files

| Action       | Path                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| **new**      | `src/core/safety/headerGuard.ts` (pure mapper)                                         |
| **new**      | `src/renderer/store/headerGuardStore.ts`                                               |
| **new**      | `tests/unit/header-guard.test.ts`                                                      |
| edit         | `src/renderer/store/appStore.ts` — delete `SafetyBadge`/`safetyBadge`/`setSafetyBadge` |
| edit         | `src/renderer/components/GlobalHeader.tsx` — GuardBadge + refresh effect               |
| edit         | `src/renderer/components/Inspector.tsx` — read guard state                             |
| edit         | `src/renderer/strings.ts` — `GUARD_*` strings                                          |
| edit         | `tests/e2e/shell.spec.ts` — replace `Safe` assertion                                   |
| edit (maybe) | new/extended `tests/e2e/*.spec.ts` for guard behavior                                  |
| edit         | `docs/progress-log.md` — dated fix entry                                               |

## Acceptance criteria

- Header no longer shows `SAFE`/`Safe`.
- Header never promises commit/push safety — only repo/profile/identity alignment.
- Status reflects real repo/profile/Git identity and updates on repo & profile change.
- `Review` and `Blocked` lead the user into the Safety Center; no repo → Repositories.
- No stale state survives a fast repo switch (request-id guard).
- Tests cover the mapper and header behavior; `npm test` / `npm run e2e` / `npm run lint` green.
- `docs/progress-log.md` updated; one commit, not pushed.

## Decisions (resolved)

1. **`data-testid`:** ✅ rename to `header-guard-badge` and update all specs.
2. **Inspector:** ✅ show the same guard state, subtly (keep the row, lower visual weight).
3. **Companion prompts file:** ✅ generated at
   [docs/prompts/header-guard-badge-prompts.md](../prompts/header-guard-badge-prompts.md).
