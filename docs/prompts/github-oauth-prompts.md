# GitWarden — GitHub OAuth Phase Prompts

Copy-paste prompts to drive the GitHub OAuth feature one phase at a time. Each prompt is self-contained, points at the plan, and **ends with the standard progress block** that appends an entry to `CLAUDE.md`.

**How to use:** run prompts in order (21 → 27). Don't start a phase until the previous phase's entry in `docs/progress-log.md` shows Exit criteria ✅. You may **ship after Phase 26** (full connect/auto-fill experience); Phase 27 (HTTPS push) is an optional epic. References: feature plan in `docs/plans/github-oauth-plan.md`, base plan in `docs/plans/gitwarden-plan.md`, rules in `CLAUDE.md` / `AGENTS.md`.

**One-time human prerequisite (before Phase 23 runs against real GitHub):** register a GitHub OAuth App with Device Flow enabled and paste its Client ID into `src/core/config/github.ts` — see `docs/plans/github-oauth-plan.md` Appendix D. Phases 21–22 and all tests need no Client ID (tests use mocks/fakes).

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

## Phase 21 — OAuth Foundations & Types

```
Work on Phase 21 of GitWarden (see docs/plans/github-oauth-plan.md §2, §6 Phase 21). Pure core only — no network, no UI.

Tasks:
- In src/core/types.ts (PURE — no node/electron/DOM), add the OAuth types from the plan §2: GitHubDeviceCode, GitHubAccount, LinkedGitHubAccount, GitHubAuthStatus, GitHubAuthErrorCode. Extend Profile with an optional linkedGitHub?: LinkedGitHubAccount.
- Add Zod schemas for LinkedGitHubAccount, the GitHub API responses, and the new IPC payloads; update the Profile schema + persisted-data round-trip to include linkedGitHub.
- Add src/core/config/github.ts exporting GITHUB_CLIENT_ID (placeholder string for now) and GITHUB_OAUTH_SCOPES = ['read:user','user:email'].
- Update DECISIONS.md to reverse the Phase 0 token-deferral (OAuth via Device Flow is now in scope; no client secret). Update SECURITY.md with the token-at-rest and no-secret-in-renderer rules from the plan Appendix B.

Exit criteria: core/ stays pure; `npx tsc --noEmit` clean on tsconfig.node.json and tsconfig.web.json; Vitest round-trip parse/serialize passes for Profile WITH and WITHOUT linkedGitHub, plus the new schemas.

Then run the standard progress footer.
```

---

## Phase 22 — Secret Storage Activation

```
Work on Phase 22 (docs/plans/github-oauth-plan.md §3, §6 Phase 22). Activate real encrypted token storage on top of the SecretStore scaffolded in Phase 6.

Tasks:
- Implement TokenStore (set/get/delete keyed by profileId) over SecretStore (Electron safeStorage). Handle missing and corrupt ciphertext gracefully — get() returns undefined, never throws.
- Keep the injectable encryptor seam so the tests run under plain Vitest with no Electron.
- Confirm the Logger redacts tokens everywhere (per base plan Appendix D / SECURITY.md).

Exit criteria: Vitest with an injected fake encryptor — a token round-trips set→get; survives a new TokenStore instance (simulated relaunch); delete removes it; corrupt stored data yields undefined without throwing; a spy/assertion proves the token never appears in any log line.

Then run the standard progress footer.
```

---

## Phase 23 — GitHub Device Flow Auth Service

```
Work on Phase 23 (docs/plans/github-oauth-plan.md §3, §4, Appendix A, §6 Phase 23). Build the cancellable device-flow state machine — logic only, fully unit-tested with a mocked HTTP client.

Tasks (main process):
- Define an injectable HttpClient interface (postForm/get) so Vitest can mock all network calls.
- GitHubAuthService.requestDeviceCode(scopes): POST https://github.com/login/device/code with client_id + scope, Accept: application/json → GitHubDeviceCode (note: device_code stays in main, is NOT part of the returned renderer payload).
- GitHubAuthService.pollForToken(signal): POST https://github.com/login/oauth/access_token with client_id, device_code, grant_type=urn:ietf:params:oauth:grant-type:device_code. Honor `interval`; back off on slow_down; keep polling on authorization_pending; stop on access_denied/expired_token; cancel promptly on AbortSignal. Resolve { accessToken, scopes }.
- Do NOT call shell.openExternal here — that belongs in the IPC glue (Phase 25).

Exit criteria: Vitest with a fake HttpClient covers the full matrix — authorization_pending→success, slow_down raises the interval, expired_token, access_denied, a network error, and an aborted poll that stops/rejects promptly. No UI.

Then run the standard progress footer.
```

---

## Phase 24 — GitHub API Client & Account Identity

```
Work on Phase 24 (docs/plans/github-oauth-plan.md §3, Appendix A, §6 Phase 24). Turn a token into a verified GitHubAccount.

Tasks (main process, reuse the injectable HttpClient):
- GitHubApiService.getAuthenticatedUser(token): GET https://api.github.com/user with Authorization: Bearer → GitHubAccount (login, id, name, avatarUrl, email).
- GitHubApiService.getPrimaryVerifiedEmail(token): GET https://api.github.com/user/emails → choose the entry where primary && verified.
- Map an HTTP 401 to the typed GitHubAuthErrorCode 'tokenInvalid' (the re-auth trigger).

Exit criteria: Vitest with mocked HTTP — getAuthenticatedUser maps login/id/name/avatar_url; the primary-verified email is selected over non-primary/unverified ones; a 401 yields the typed tokenInvalid error.

Then run the standard progress footer.
```

---

## Phase 25 — IPC Bridge for GitHub Auth

```
Work on Phase 25 (docs/plans/github-oauth-plan.md §4, §6 Phase 25, base plan Appendix D). Wire the GitHub services to the renderer with typed, Zod-validated IPC.

Tasks:
- Channels: github:startDeviceAuth (returns GitHubDeviceCode and begins polling in main), github:cancelDeviceAuth, github:disconnect, github:getLinkedAccount.
- Surface auth progress to the renderer via an event channel github:authEvent (webContents.send) carrying GitHubAuthStatus — keep the flow cancellable; avoid one long blocking IPC call.
- On success in main: fetch identity (Phase 24), store the token via TokenStore, persist linkedGitHub on the profile. Put shell.openExternal(verificationUri) here.
- Validate every payload (both directions) with Zod; wrap results in the existing IpcResult<T> envelope; register handlers in electron/index.ts with all new services injected. Mirror window.api types in src/renderer/types/window.d.ts.

Exit criteria: Playwright with an INJECTED FAKE GitHubAuthService (no real GitHub) — startDeviceAuth round-trips and returns a device code; a simulated authEvent 'authorized' reaches the renderer; an invalid payload is rejected by Zod (ok:false); the renderer security flags (contextIsolation, sandbox, no window.require/window.process) still hold. tsc --noEmit clean on both tsconfigs.

Then run the standard progress footer.
```

---

## Phase 26 — "Connect GitHub" UI (the GitKraken experience)

```
Work on Phase 26 (docs/plans/github-oauth-plan.md §6 Phase 26). Build the one-click connect flow in ProfilesScreen. This is a safe stop point — the full connect/auto-fill experience ships here.

Tasks:
- "Connect GitHub" button → modal showing userCode, an "Open GitHub" button (shell.openExternal via IPC), live status (waiting / success / denied / expired / error), and Cancel.
- On success: auto-fill displayName (ONLY if empty), gitAuthorName, gitAuthorEmail, githubUsername; render a linked badge (avatar + @login) and a Disconnect action.
- Disconnect (with confirm): delete the local token (TokenStore) and clear linkedGitHub, then open https://github.com/settings/connections/applications/{client_id} so the user can revoke on GitHub (we cannot revoke via API — no client secret; see plan Appendix C).
- Show a re-auth prompt when GITHUB_TOKEN_INVALID surfaces.
- Externalize ALL new user-facing strings in src/renderer/strings.ts. Use the custom Dropdown/button styling already in the app where relevant.

Exit criteria: Playwright with the injected fake service — click Connect → modal shows the code → simulated authorization → the four fields populate and a linked @login badge appears → Disconnect clears the badge and token. tsc --noEmit clean.

Then run the standard progress footer.
```

---

## Phase 27 — Token-based Push (HTTPS) + Safety Engine extension (optional)

```
Work on Phase 27 (docs/plans/github-oauth-plan.md §5, §6 Phase 27, Appendix B/C). Push over HTTPS with the linked token, with the Safety Engine verifying the account. Skip this phase entirely if pushing stays on SSH.

Tasks:
- In the push path, when the remote is an HTTPS GitHub URL AND the assigned profile has a stored token, authenticate via a bundled GIT_ASKPASS helper that reads the token from a per-invocation env var and echoes it. GitRunner sets that env ONLY for this push. The token must NEVER appear in argv, the remote URL on disk, or .git/config.
- Extend SafetyCheckService.checkPush (pure, core/) with the new codes: GITHUB_ACCOUNT_MISMATCH (blocker), GITHUB_TOKEN_MISSING (blocker), GITHUB_TOKEN_INVALID (blocker), GITHUB_NOT_CONNECTED (warning). SSH-only profiles must be unaffected.
- Add a "Pushing as @login via HTTPS token — matches assigned profile ✓/✗" line to the push confirmation sheet.
- Update SECURITY.md with token-in-transit rules (askpass only), scope minimization (request 'repo' only here, via re-auth), and the revoke-on-disconnect caveat.

Exit criteria: Vitest — the safety matrix for the four new codes (match/mismatch/missing/invalid). Integration — GIT_ASKPASS wiring against a local repo, plus an assertion that the token appears in NEITHER argv, the stored remote URL, NOR .git/config. Playwright — push is blocked on GITHUB_ACCOUNT_MISMATCH and proceeds only after explicit confirmation.

Then run the standard progress footer.
```
