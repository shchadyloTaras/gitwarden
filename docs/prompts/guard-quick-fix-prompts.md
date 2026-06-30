# GitWarden — Guard Quick-Fix Phase Prompts

Copy-paste prompts to drive the **Guard Quick-Fix** feature (one-click remediation for
identity / account / push-auth errors) one phase at a time. Each prompt is self-contained, points
at the plan in `docs/plans/guard-quick-fix-plan.md`, and **ends with the standard progress
footer** that records progress in `docs/progress-log.md`. Rules live in `CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (63 → 67). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Treat **Phases 65–66** as the logic-complete
checkpoints (every fix is verified headlessly against offline fixtures) and **Phase 67** as the UI
that ships the feature. This is a numbered feature: **one commit per phase**, the progress-log
entry written **before** the commit.

**No external prerequisite.** No network, no real GitHub account, no token. E2E and integration
tests use real git fixtures in a temp dir with a **local bare repo as the "remote"** for push
paths; the GitHub device-flow service is **mocked**.

**Product boundary (do not cross):** GitWarden fixes **its own** push only. **Never** run
`gh auth …`, **never** write `git config --global`, `~/.ssh/config`, or a global
`safe.directory`. Honors the AGENTS.md rule "Don't change global git config — only `--local`."

Background facts (already verified against the tree — don't re-litigate):

- The **token-injection seam exists**: `GitService.push(...auth?)` routes the token via
  `GIT_ASKPASS` env only (`src/main/git/askpass.ts`); the push handler auto-resolves the token
  with `resolvePushAuth(services, repoPath, remote)` (`ipc-handlers.ts:338/816`). A "retry push"
  needs only the right active profile — the token follows.
- **Profile auto-switch exists** on repo select (`syncProfileToRepo`, `appStore.ts:18-27`); the
  manual remediation is for when the user has deliberately moved off the assigned profile.
- **One executable fix already ships** — the "Set local identity" button
  (`CommitScreen.tsx:273-312` → `commitStore.ts:93` → `git:setLocalIdentity` → `GitService:127`).
  Generalize this pattern; don't hand-wire per code.
- **Remediation is text-only today**: `SAFETY_ACTION_BY_CODE` + `ACTION_HINTS`
  (`src/core/ai/safetyCopilotMessages.ts:64-107`). `SafetySuggestedAction` lives in
  `src/core/ai/types.ts`.
- **The IPC envelope flattens errors to a string** (`IpcResult` in `ipc-handlers.ts:131` /
  `window.d.ts:48`; `wrap()` `:133-138`; `remoteStore.ts:114-118`). `GitError.code` is destroyed
  at the boundary — the envelope must carry structured failure info before any recovery UI works.
- **`ErrorMapper` is pure** and only matches SSH `permission denied (publickey)` for auth — the
  HTTPS wrong-account/403 push and the folder-move "dubious ownership" failure both fall through
  to `unknown` ("An unexpected Git error occurred.").

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

## Phase 63 — Remediation Model & Action Contracts (pure core)

```
Work on Phase 63 of GitWarden (see docs/plans/guard-quick-fix-plan.md §"The remediation model" and §"Phase 63"). Pure core only — no IPC, no UI. This phase also REGISTERS the feature in the docs (it's new — not yet in the checklist).

Tasks:
- Registration (docs): add Phase 63–66 rows (unchecked) under a new "### Guard Quick-Fix feature (plan: docs/plans/guard-quick-fix-plan.md, prompts: docs/prompts/guard-quick-fix-prompts.md)" heading in docs/progress-log.md "## Phase Checklist"; add a "Guard Quick-Fix" row (⬜, phases 63–66) to the Feature Track Status table; extend the AGENTS.md build order with "→ 63→66 (Guard Quick-Fix)"; add the plan + prompts to AGENTS.md "Reference docs".
- Add src/core/safety/remediation.ts (PURE — no fs/child_process/Electron/DOM). Export:
    type RemediableGitErrorCode = 'pushRejectedWrongAccount' | 'authenticationFailed' | 'dubiousOwnership'  // authenticationFailed is the EXISTING GitErrorCode, now remediable
    type RemediationKind = 'executable' | 'navigate'
    type NavTarget = 'repositories' | 'commit' | 'status' | 'remote' | 'branches' | 'profiles'
    interface Remediation { action: SafetySuggestedAction; kind: RemediationKind; navigateTo?: NavTarget }
    const EXECUTABLE_ACTIONS = Set<SafetySuggestedAction>(['set-local-identity','switch-active-profile','reconnect-github','switch-profile-and-retry-push'])
    function remediationForSafetyCode(code: SafetyCode): Remediation   // DERIVE from existing SAFETY_ACTION_BY_CODE — do not fork the code→action map
    function remediationForGitError(code: RemediableGitErrorCode): Remediation
  Map per the plan's "Executable vs navigate" table. dubiousOwnership → navigate→'repositories' (explain-only).
- Extend SafetySuggestedAction in src/core/ai/types.ts with 'switch-profile-and-retry-push'. Add its ACTION_HINTS entry in src/core/ai/safetyCopilotMessages.ts (in-app description). Keep GITHUB_ACCOUNT_MISMATCH → reconnect-github in SAFETY_ACTION_BY_CODE (token problem); 'switch-profile-and-retry-push' is the diagnosis-side action wired in Phase 64.
- Add tests/unit/remediation.test.ts: EVERY SafetyCode yields a Remediation with no default-gap (exhaustive switch or record); executable flags match the table; every navigate action carries a navigateTo; each RemediableGitErrorCode maps correctly; 'switch-profile-and-retry-push' ∈ EXECUTABLE_ACTIONS.

Exit: `npx tsc --noEmit` clean on both tsconfigs; `npm test` green for the new file; src/core/ stays pure (core-purity passes); no IPC/UI changes.

Then run the standard progress footer.
```

---

## Phase 64 — Push-Failure Diagnosis & Structured IPC Errors

```
Work on Phase 64 of GitWarden (docs/plans/guard-quick-fix-plan.md §"Phase 64"). Logic + the IPC transport seam. No remediation UI yet.

Tasks:
- Extend GitErrorCode in src/core/types.ts with the TWO NEW codes only: 'pushRejectedWrongAccount' | 'dubiousOwnership'. ('authenticationFailed' already exists — reuse it, don't duplicate.)
- In src/main/git/ErrorMapper.ts, reconcile with the EXISTING authenticationFailed matcher (lines 34-43) — do NOT add a second code that re-matches "authentication failed":
    NEW pushRejectedWrongAccount, placed BEFORE the existing auth matcher so it wins: /remote: Permission to .+ denied to .+/i, /The requested URL returned error: 403/i, /\berror: 403\b/i  (token valid but wrong account → switch-and-retry remediation)
    EXTEND the existing authenticationFailed matcher to also catch HTTPS token rejection: /could not read Username/i, /Invalid username or password/i, /\b401\b/  (→ reconnect-github remediation)
    NEW dubiousOwnership: /detected dubious ownership in repository/i  (folder move → navigate/explain only)
  Each new/extended branch gets a userMessage that names the REAL problem (wrong-account push, expired/invalid token, moved repo folder).
- Extend the IPC envelope ADDITIVELY (non-breaking): IpcResult error arm → { ok:false; error:string; code?: GitErrorCode; remediation?: Remediation } in src/main/ipc/ipc-handlers.ts:131 AND src/renderer/types/window.d.ts:48. Update wrap() (ipc-handlers.ts:133-138) to detect a GitError instance and attach code + (when the code is remediable) remediation from remediationForGitError/remediationForSafetyCode. The error STRING stays exactly as today.
- Surface on the push path: update remoteStore.doRemotePush (src/renderer/store/remoteStore.ts:109-122) to retain { message, code?, remediation? } as lastFailure instead of collapsing to new Error(res.error).

Exit: `npx tsc --noEmit` clean on both tsconfigs; tests/unit/error-mapper.test.ts covers each new code with captured-stderr fixtures; a test proving wrap() attaches code+remediation for a thrown GitError and leaves a plain Error string-only (code/remediation undefined); EVERY existing IpcResult consumer still compiles (additive change); `npm run lint` clean. No UI.

Then run the standard progress footer.
```

---

## Phase 65 — Executable Fix Actions (main + IPC)

```
Work on Phase 65 of GitWarden (docs/plans/guard-quick-fix-plan.md §"Phase 65"). Make the four executable remediations actually run, behind typed + Zod-validated IPC. Honor every safety rule.

Tasks:
- Add a Zod schema (src/main/ipc/schemas.ts) + IPC handler 'remediation:execute' in src/main/ipc/ipc-handlers.ts. Payload: { action: SafetySuggestedAction; repoPath: string; profileId?: string; remote?: string; branch?: string }. Dispatch:
    set-local-identity → services.git.setLocalIdentity (exists)
    switch-active-profile → set the active profile id via the SAME settings path the renderer's setActiveProfile uses
    reconnect-github → start the existing device-flow auth service for the assigned profile; return its code/url result
    switch-profile-and-retry-push → set assigned profile active, then services.git.push(repoPath, remote, branch, await resolvePushAuth(services, repoPath, remote)); re-classify any new failure through the structured envelope (a second wrong-account/token error returns a fresh remediation)
- Guard rails: validate with Zod; refuse switch-profile-and-retry-push when the repo is unassigned (return a remediation → assign-repo-profile); NEVER log the token; git args stay arrays; retry-push runs only from this explicit action and through GitRunner per-repo serialization.
- Add the typed bridge method to src/renderer/types/window.d.ts (window.api.remediation.execute(payload): Promise<IpcResult<...>>).

Exit: integration tests (Vitest) drive each action against OFFLINE fixtures — temp git repo + local bare repo as remote for the retry-push happy path, a rejecting remote for the failure path; device-flow service mocked. Assert: setLocalIdentity writes only --local; switch-profile-and-retry-push on a mismatched-but-assigned repo switches profile and pushes; unassigned repo → assign-repo-profile remediation, no push attempt. `npx tsc --noEmit` clean; `npm test` green; the safety-reviewer subagent passes (no secret logging, remote behind explicit action, args arrays, no global-state writes).

Then run the standard progress footer.
```

---

## Phase 66 — SSH Transport Binding (the assigned profile governs the SSH key)

```
Work on Phase 66 of GitWarden (docs/plans/guard-quick-fix-plan.md §"Phase 66 — SSH Transport Binding"). Logic + main; NO UI. This phase also renumbers the old UI phase to 67 and records ADR 0009.

Product boundary (honors ADR 0002, recorded as ADR 0009): bind by REWRITING the repo's --local git remote host to the profile's declared sshKeyAlias. NEVER set GIT_SSH_COMMAND, NEVER read/write ~/.ssh/config, NEVER create/rotate keys. Key resolution stays in the user's ssh config + agent.

Tasks:
- Registration (docs): in docs/progress-log.md rename the old "Phase 66 — One-Click Fix UI" checklist row → Phase 67; add a "Phase 66 — SSH Transport Binding" row (unchecked); update the Feature Track Status row to 63–67; extend the AGENTS.md build order to "… → 63→67 (Guard Quick-Fix)". (plan + prompts are already renumbered.)
- Pure core: make the push host check alias-aware in src/core/safety/SafetyCheckService.ts (~line 270) — a remote matches when r.host ∈ (expectedRemoteHosts ∪ {sshKeyAlias}). Without this the bind triggers a false REMOTE_HOST_MISMATCH.
- Pure helper: add src/core/github/remoteAlias.ts — bindHostToAlias(url, alias) and restoreHost(url, host) swapping ONLY the host of scp-like/ssh remotes (git@github.com:o/r.git ↔ git@<alias>:o/r.git); HTTPS URLs unchanged. Reuse existing remote parsing.
- Main: add reconcileAssignedProfileRemote alongside applyAssignedProfileIdentity on repositories:update. If assigned profile authenticationMethod==='ssh' AND sshKeyAlias set AND origin is an SSH GitHub remote → set --local origin host to the alias (GitService git remote set-url, args array). On unassign / switch to a non-ssh-alias profile → restore the canonical host (capture pre-bind host on RepositoryRecord; fallback expectedRemoteHosts[0] ?? 'github.com'). HTTPS/token untouched. Best-effort (never block assignment).
- ADR + spec: ADR 0009 is already drafted (docs/adr/0009-ssh-transport-binding.md) — add its row to docs/adr/README.md and a one-line note to docs/features/gitwarden/spec.md §AC-08/AC-12 (app may set the remote host to the profile's alias; still no GIT_SSH_COMMAND / no ssh-config parsing).
- Tests: unit (pure) for the alias-aware host check + remoteAlias bind/restore (scp, ssh, HTTPS-untouched); integration (offline, real temp repo) — assign ssh profile alias X → --local origin host becomes X; switch ssh profile → re-points; switch to token / unassign → canonical host restored; HTTPS origin + aliasless profile untouched.

Exit: `npx tsc --noEmit` clean both tsconfigs; `npm test` green (unit + integration); `npm run lint` clean; src/core/ pure; safety-reviewer subagent CLEAN (no global state, no ~/.ssh/config writes, no GIT_SSH_COMMAND, args arrays). No UI.

Then run the standard progress footer.
```

---

## Phase 67 — One-Click Fix UI & Failed-Push Recovery (renderer + e2e)

```
Work on Phase 67 of GitWarden (docs/plans/guard-quick-fix-plan.md §"Phase 67", §"Acceptance criteria"). Feature-complete stop point. This phase ends with the per-phase commit.

Tasks:
- Add src/renderer/components/RemediationButton.tsx: given an issue's Remediation, render EITHER a fix button (kind 'executable' → window.api.remediation.execute(...), with a pending state mirroring the existing Set-local-identity button) OR a "Go to …" link (kind 'navigate' → navigate(navigateTo)). Reuse the visual treatment from CommitScreen.tsx:273-312.
- Wire it into the blocker/warning lists in CommitScreen (and the push sheet / Safety Center issue lists where the same issues render). REPLACE the bespoke Set-local-identity button with the generic model-driven one.
- Failed-push recovery banner: when remoteStore.lastFailure.remediation is set, replace the generic error text with a diagnosed banner — the real userMessage + the one-click fix ("Switch to <profile> and push" / "Reconnect GitHub"). dubiousOwnership shows explain-only (what happened + how to re-point the repo), no fix button.
- Externalize all new copy in src/renderer/strings.ts (REMEDIATION_*, recovery-banner labels). No hard-coded user-facing strings.

Exit (Playwright e2e, offline fixtures + local bare remote, reuse the safety-center.spec harness):
- active profile ≠ assigned → Commit/push blocker shows the executable fix; clicking it switches profile and the push succeeds to the bare remote
- a push the fixture remote rejects (wrong account/403) → recovery banner shows diagnosis + fix, NOT "An unexpected Git error occurred."
- token-invalid path → banner offers "Reconnect GitHub"
- a navigate-only issue (unassigned repo) → "Go to Repositories" link, not a fix button
- `npm test`, `npm run e2e`, `npm run lint` all green.

Then run the standard progress footer. This is the feature-complete stop point for Guard Quick-Fix (63–67).
```
