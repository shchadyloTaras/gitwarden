# GitWarden — Header Guard Badge prompts

Copy-paste prompts to drive the **"Replace static SAFE badge with live header guard"** fix one
step at a time. Each prompt is self-contained and points at the plan in
`docs/plans/header-guard-badge-plan.md`. Rules live in `CLAUDE.md` / `AGENTS.md`.

**This is a single fix, not a numbered phase** — it lands as **one commit** at the very end
(`Fix: Replace static SAFE badge with live header guard`). Run the steps in order; **do not
commit between steps**. Logic-first: the pure mapper + its unit tests go green before any UI
(Architecture rule — `src/core/` is the verifiability backbone).

**No external prerequisite.** No network, no GitHub account, no token. E2E uses real git
fixtures in a temp dir (reuse the harness in `tests/e2e/safety-center.spec.ts`).

Background facts (already verified against the tree — don't re-litigate):

- The badge is **static today**: `setSafetyBadge` exists in `appStore.ts` but is **never
  called**, so removing the whole `safetyBadge` apparatus is safe.
- Use **only** `safetyCheckService.checkRepositoryIdentity` — never `checkCommit` / `checkPush`.
- `checkRepositoryIdentity` severities already map cleanly: blocker → `blocked`,
  warning-only → `review`, none → `ready`. No reclassification.
- Reuse the **dangling-profile normalization** from `src/renderer/store/safetyCenterStore.ts`
  (unresolvable `assignedProfileId` ⇒ treat repo as unassigned) so header == Safety Center.
- `not-checked` = no repo **or** the `getEffectiveIdentity` IPC call failed. Empty
  `userName`/`userEmail` is **not** `not-checked` — it's `IDENTITY_UNSET` ⇒ `blocked`.

---

## 🔁 Closeout footer (run only at the end of Step 4)

```
When all acceptance criteria in docs/plans/header-guard-badge-plan.md are met and tests are green:
1. Append a dated entry to docs/progress-log.md in the existing fix format (newest last, do not rewrite past entries):
   ### <today's date> — Fix: Replace static SAFE badge with live header guard
   - Fixed: <what changed and why — header now reports repo/profile/identity alignment, not commit/push safety>
   - Files: <files added/changed>
   - Tests: <exact vitest + playwright results, e.g. "Vitest 12 added/green; e2e N passed">
   - Notes / follow-ups: <anything worth knowing>
2. Commit ALL changes as ONE commit (only if everything is green):
   git add -A
   git commit -m "Fix: Replace static SAFE badge with live header guard" -m "<one-line summary>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
3. Report the test output to me honestly. If anything failed or was skipped, say so explicitly.
```

---

## Step 1 — Core pure guard mapper + unit tests (logic-first)

```
Work on Step 1 of the header-guard fix (see docs/plans/header-guard-badge-plan.md §"Step 2" and §"States"). Pure core only — no store, no UI. Do NOT commit.

Tasks:
- Add src/core/safety/headerGuard.ts (PURE — no fs/child_process/Electron/DOM). Export:
    type HeaderGuardState = 'checking' | 'ready' | 'review' | 'blocked' | 'not-checked'
    interface HeaderGuardInput { loading, hasRepo, errored, repository: RepositoryRecord|null, activeProfile: Profile|null, identity: EffectiveGitIdentity|null }
    interface HeaderGuard { state: HeaderGuardState; issueCount: number }
    function deriveHeaderGuard(input): HeaderGuard
- Logic (in this order): loading → 'checking'; (!hasRepo || errored || !repository || !identity) → 'not-checked'; else call safetyCheckService.checkRepositoryIdentity({ repository, activeProfile: activeProfile ?? undefined, identity }) and map: any issue with severity 'blocker' → 'blocked'; else issues.length > 0 → 'review'; else 'ready'. issueCount = number of identity issues (0 for checking/not-checked).
- The mapper MUST call checkRepositoryIdentity itself (never checkCommit/checkPush) so callers can't feed it commit/push results.

- Add tests/unit/header-guard.test.ts (vitest glob already covers tests/unit/**). Cover:
  * clean aligned identity → 'ready', issueCount 0
  * EMAIL_MISMATCH → 'review'; emailSource !== 'local' (global-only) → 'review'
  * REPO_UNASSIGNED → 'blocked'; PROFILE_MISMATCH → 'blocked'; IDENTITY_UNSET (empty userName/userEmail) → 'blocked'; no active profile → 'blocked'
  * loading:true → 'checking'; hasRepo:false → 'not-checked'; errored:true → 'not-checked'; identity:null → 'not-checked'
  * structural guarantee: an otherwise-'ready' input stays 'ready' regardless of staging/remote/commit-message state (those are never passed in)
  * issueCount equals the count of identity issues

Exit: `npx tsc --noEmit` clean on both tsconfigs; `npm test` green for the new file; core stays pure. Do NOT commit yet.
```

---

## Step 2 — Renderer guard store + appStore cleanup

```
Work on Step 2 of the header-guard fix (docs/plans/header-guard-badge-plan.md §"Step 3" and §"Step 1"). Do NOT commit.

Tasks:
- Add src/renderer/store/headerGuardStore.ts (zustand), modeled on src/renderer/store/safetyCenterStore.ts:
  * state: { loading: boolean, state: HeaderGuardState, issueCount: number, error: string | null }
  * action refresh(repoPath, repository, activeProfile, profiles): apply the SAME dangling-profile normalization as safetyCenterStore (if repository.assignedProfileId doesn't resolve in profiles, treat as unassigned). Call ONLY window.api.git.getEffectiveIdentity(repoPath) (no remotes/status needed). On ok:false → errored. Compute final state via deriveHeaderGuard(...) from src/core/safety/headerGuard.ts.
  * action reset(): set state to 'not-checked', issueCount 0, error null (used when no active repo).
  * STALE-ASYNC GUARD: keep a module-level monotonic reqId; increment at the top of refresh, capture locally, and after the await bail WITHOUT calling set() if reqId changed — so a slow result for repo A can't overwrite a newer result for repo B. Set loading:true (state 'checking') at the start.
- Remove the dead badge apparatus from src/renderer/store/appStore.ts: delete the SafetyBadge type, the safetyBadge state field, and the setSafetyBadge action (grep confirms setSafetyBadge has no callers).

Exit: `npx tsc --noEmit` clean on both tsconfigs (this will surface every remaining safetyBadge consumer — they're handled in Step 3). Do NOT commit yet.
```

---

## Step 3 — UI: GlobalHeader GuardBadge, Inspector, strings

```
Work on Step 3 of the header-guard fix (docs/plans/header-guard-badge-plan.md §"Step 4", §"Step 5", §"Step 6"). Do NOT commit.

Tasks:
- src/renderer/strings.ts — add: GUARD_READY 'Guard · Ready', GUARD_REVIEW 'Guard · Review', GUARD_BLOCKED 'Guard · Blocked', GUARD_CHECKING 'Guard · Checking', GUARD_NOT_CHECKED 'Guard · Not checked', GUARD_OPEN_SAFETY_CENTER 'Open Safety Center', GUARD_OPEN_REPOSITORIES 'Open Repositories'.

- src/renderer/components/GlobalHeader.tsx:
  * Remove safetyBadge from the useAppStore() destructure; delete BADGE_STYLE, BADGE_LABEL, and the old header-safety-badge span.
  * Add a useEffect (deps [activeRepo, activeProfile, profiles]) mirroring SafetyCenterScreen: if activeRepo → headerGuardStore.refresh(activeRepo.localPath, activeRepo, activeProfile, profiles); else headerGuardStore.reset().
  * Render a clickable GuardBadge from { state, issueCount }:
      - label from STR (Guard · Ready / Review / Blocked / Checking / Not checked)
      - onClick: activeRepo → navigate('safety-center'); else navigate('repositories')
      - aria-label includes the state AND issueCount AND destination, e.g. "Guard status: Blocked, 2 issues. Open Safety Center." (count is dynamic; compose in-component using STR.GUARD_OPEN_*)
      - data-testid="header-guard-badge" (renamed from header-safety-badge)
      - colors: ready → var(--gw-success-solid); review → var(--gw-warning-solid); blocked → var(--gw-danger-solid); checking/not-checked → neutral (var(--gw-surface3) bg / var(--gw-text-muted) text). Drop textTransform:uppercase (label is mixed-case "Guard · …").

- src/renderer/components/Inspector.tsx: replace the Safety section's {safetyBadge} with the SAME guard state read from headerGuardStore (read-only — Inspector does NOT call refresh; header owns the effect). Relabel the section "Guard". Render subtly (muted, smaller) with the same color logic at lower visual weight.

Exit: `npx tsc --noEmit` clean on both tsconfigs; `npm run lint` clean; no new hard-coded user-facing strings (all via STR). Do NOT commit yet.
```

---

## Step 4 — E2E, docs & closeout commit

```
Work on Step 4 of the header-guard fix (docs/plans/header-guard-badge-plan.md §"Step 7", §"Step 8", §"Acceptance criteria"). This step ends with the single commit.

Tasks:
- tests/e2e/shell.spec.ts: replace the assertion that header-safety-badge reads 'Safe' (line ~93). Update the test id to header-guard-badge and assert the header NO LONGER shows 'SAFE'/'Safe'.
- Add header-guard behavior coverage (extend shell.spec.ts or a new tests/e2e/header-guard.spec.ts), reusing the fixture-repo harness from tests/e2e/safety-center.spec.ts:
  * an aligned repo shows "Guard · Ready"
  * a broken-identity or unassigned repo shows "Guard · Blocked"
  * clicking the guard with an active repo opens the Safety Center
  * with no active repo the guard shows "Guard · Not checked" and clicking routes to Repositories
- Grep the whole repo for any remaining 'header-safety-badge' / 'safetyBadge' references and clean them up.

Verify (all must be green):
  npm test
  npm run e2e
  npm run lint

Then run the closeout footer at the top of this file (progress-log entry + the single
`Fix: Replace static SAFE badge with live header guard` commit). Do NOT push.
```
