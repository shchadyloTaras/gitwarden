# GitWarden — Client Branch Access Phase Prompts

Copy-paste prompts to drive the Client Branch Access feature one phase at a time. Each prompt is self-contained, points at the plan, and **ends with the standard progress footer** that records progress in `docs/progress-log.md`.

**How to use:** run prompts in order (56 → 59). Don't start a phase until the previous phase's entry in `docs/progress-log.md` shows Exit criteria ✅. You may treat **Phase 58** as the logic-complete checkpoint (the engine is fully verified headlessly) and **Phase 59** as the UI that ships the feature. References: feature plan in `docs/plans/client-branch-access-plan.md`, base plan in `docs/plans/gitwarden-plan.md`, rules in `CLAUDE.md` / `AGENTS.md`.

**No external prerequisite.** This feature needs no client GitHub account, no token, and makes no network call in any test — fixtures are real git repos in a temp dir with a local bare repo as the "remote."

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
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md.
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 56 — Push Policy Foundations & Pure Helpers

```
Work on Phase 56 of GitWarden (see docs/plans/client-branch-access-plan.md §2, §3, Appendix A, §6 Phase 56). Pure core only — no engine wiring, no UI.

Tasks:
- In src/core/types.ts (PURE — no node/electron/DOM), add PushPolicyMode = 'unrestricted' | 'branchScoped' and RepositoryPushPolicy (mode, allowedBranchPatterns, blockedBranchPatterns, expectedRemoteOwner?, expectedRemoteRepo?, expectedGitHubActor?, suggestedBranchPrefix?) exactly as in plan §2. Extend RepositoryRecord with an optional pushPolicy?: RepositoryPushPolicy.
- In src/core/schemas.ts add RepositoryPushPolicySchema and extend RepositoryRecordSchema. The migration is simply that OLD persisted records with no pushPolicy must parse to pushPolicy: undefined and NEVER throw — add a round-trip test proving it.
- Add src/core/safety/branchPatterns.ts: matchesBranchPattern(branch, pattern) and matchesAnyPattern(branch, patterns) implementing the glob semantics in Appendix A ('*' within a segment, '**' across '/', '?' single non-'/', anchored, case-sensitive).
- Add src/core/github/remoteOwner.ts: parseRemoteOwnerRepo(url) returning { owner, repo } | undefined for BOTH scp-like SSH (git@github.com:o/r.git) and HTTPS, stripping '.git' and trailing slash. Reuse isHttpsGitHubRemoteUrl where useful.
- Add src/core/safety/pushTarget.ts: resolvePushTarget({ remotes, upstream?, preferredRemoteName? }) returning the single GitRemote a push targets (upstream's remote wins; else preferred name, default 'origin'; else the sole remote; else undefined). Pure — inputs only.

Exit criteria: core/ stays pure; `npx tsc --noEmit` clean on tsconfig.node.json and tsconfig.web.json; Vitest covers the Appendix A glob matrix (segment '*', cross-segment '**', anchoring, case sensitivity, no-match), parseRemoteOwnerRepo for SSH / HTTPS / '.git' suffix / trailing slash / garbage (→ undefined), resolvePushTarget for upstream-wins / preferred-fallback / sole-remote / none, and RepositoryRecord round-trip WITH and WITHOUT pushPolicy.

Then run the standard progress footer.
```

---

## Phase 57 — Safety Engine: Branch Access Checks

```
Work on Phase 57 (docs/plans/client-branch-access-plan.md §4, §5, Appendix A/C/D, §6 Phase 57). Extend the Safety Engine — pure core/, fully unit-tested. This is the heart of the feature.

Tasks:
- Extend SafetyCheckService.checkPush (src/core/safety/SafetyCheckService.ts) to accept upstream?: string and to evaluate repo.pushPolicy using the Phase 56 helpers, following the plan §4 sequence.
- Add five codes to the SafetyCode union + safetyMessages.ts (message + severity): PROTECTED_BRANCH_PUSH (blocker), BRANCH_NOT_ALLOWED (blocker), REMOTE_OWNER_MISMATCH (blocker), REMOTE_REPO_MISMATCH (blocker), PUSH_POLICY_INCOMPLETE (warning).
- Precedence: blocked overrides allowed. Owner/repo are checked against the RESOLVED push target only (resolvePushTarget), never "any remote matches". blockedBranchPatterns is honored in BOTH modes; allowedBranchPatterns only in branchScoped.
- Opt-in guarantee (must be test-proven): !pushPolicy || mode === 'unrestricted' produces ZERO new issues. Do NOT add a GITHUB_ACTOR_MISMATCH code — reuse the existing GITHUB_ACCOUNT_MISMATCH for HTTPS-token actor, with expectedGitHubActor (when set) overriding the expected login. SSH actor is informational only (no blocker).

Exit criteria: Vitest matrix — allowed branch passes; main (blocked) → PROTECTED_BRANCH_PUSH; off-scope branch → BRANCH_NOT_ALLOWED; wrong owner → REMOTE_OWNER_MISMATCH; wrong repo → REMOTE_REPO_MISMATCH; empty allowed in branchScoped → PUSH_POLICY_INCOMPLETE (warning) + push denied; a branch matching BOTH allowed and blocked → blocked wins; REGRESSION GUARD: a repo with no policy yields the exact same issue set as before Phase 57. `npx tsc --noEmit` clean on both tsconfigs.

Then run the standard progress footer.
```

---

## Phase 58 — Policy Persistence, IPC & Push-Path Wiring

```
Work on Phase 58 (docs/plans/client-branch-access-plan.md §6 Phase 58, Appendix C). Persist a policy and feed the engine the REAL push target through the store/push path. No new UI yet beyond what's needed to save a policy via existing repo IPC.

Tasks:
- Wire pushPolicy save/load through the repository storage and the existing repository IPC channel(s). Zod-validate the policy payload in BOTH directions; reuse the IpcResult<T> envelope. Mirror any window.api type changes in src/renderer/types/window.d.ts.
- In src/renderer/store/safetyCenterStore.ts (and any push-sheet path that calls checkPush), resolve the effective push remote with resolvePushTarget using GitStatus.upstream + remotes, parse owner/repo from it, and pass upstream into checkPush. Keep the existing GitHubPushContext for HTTPS actor; pass expectedGitHubActor (when set) as the expected-login override.
- Do NOT add a network SSH actor probe — SSH actor stays informational (plan Appendix C documents the deferred ssh -T option).

Exit criteria: Vitest/integration — a pushPolicy round-trips through storage (save → reload → deep-equal); the store computes a pushCheck reflecting the RESOLVED target (a two-remote repo whose policy owner/repo live on a NON-default remote is judged against the upstream's remote, not "any remote"); an invalid policy IPC payload is rejected by Zod (ok:false). `npx tsc --noEmit` clean on both tsconfigs.

Then run the standard progress footer.
```

---

## Phase 59 — Push Policy UI (feature-complete stop point)

```
Work on Phase 59 (docs/plans/client-branch-access-plan.md §6 Phase 59, Appendix B/C). Build the guarded-workflow surfaces across the existing screens. This is the feature-complete stop point.

Tasks:
- RepositoriesScreen → "Push Policy" editor: mode toggle (unrestricted / branchScoped), allowed + protected pattern lists, expected owner/repo, optional actor override, optional suggested branch prefix.
- RemoteScreen push sheet → "Branch Access" block: profile · pushing-as · branch · verdict. Disable Confirm Push on any blocker with copy like "This profile can only push to <allowed> — use a Pull Request for <branch>". VISUALLY SEPARATE verified facts (branch, owner/repo) from assumed/unverified ones (SSH actor → label "assumed from policy — unverified"; see Appendix C). Add a short "GitWarden enforces this locally; ask the repo owner to set GitHub branch protection for real enforcement" note (Appendix B).
- Safety Center → "Branch Access" block (allowed · current branch · status).
- Branch badge near the branch (e.g. "main · blocked" / "client-x/taras/fix · allowed"); suggested branch name on the Branches screen from suggestedBranchPrefix.
- Externalize ALL new user-facing strings in src/renderer/strings.ts. Reuse existing Dropdown/button styling.

Exit criteria: Playwright against a LOCAL fixture repo (+ a local bare "remote", offline) — pushing on an allowed branch shows a Safe verdict and proceeds ONLY after explicit confirm; on main the verdict is Blocked and Confirm Push is DISABLED; a wrong owner/repo remote is judged Blocked. `npx tsc --noEmit` clean; no new hard-coded user-facing strings.

Then run the standard progress footer.
```
