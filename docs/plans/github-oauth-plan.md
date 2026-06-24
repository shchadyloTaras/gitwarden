# GitWarden — GitHub OAuth Sign-In Implementation Plan

> Add **"Connect GitHub"** — a one-click, GitKraken-style account link that auto-fills a profile's identity and lets the Safety Engine verify the _real_ GitHub account behind a push. Built on the **OAuth Device Authorization Flow**, the same mechanism the GitHub CLI (`gh`) uses for desktop sign-in.
>
> This plan **supersedes the token-deferred decision** recorded in Phase 0 (`docs/plans/gitwarden-plan.md` §7.3 / `DECISIONS.md`). Token auth is no longer model-only.

## 0. How to Read This Plan

A continuation of the main plan (`docs/plans/gitwarden-plan.md`). Same conventions: each phase has a **Goal**, **Tasks**, and an explicit **Exit criteria** gate that always includes the tests that must pass. Build **logic-first** — pure core + services with green Vitest before any UI. Do not start a phase until the previous one's exit criteria are met.

Phase order (continues the main plan, which ended at Phase 20):

- **Phase 21 — OAuth Foundations & Types** (core, pure)
- **Phase 22 — Secret Storage Activation** (`TokenStore` on `safeStorage`)
- **Phase 23 — GitHub Device Flow Auth Service** (main; logic + network)
- **Phase 24 — GitHub API Client & Account Identity**
- **Phase 25 — IPC Bridge for GitHub Auth**
- **Phase 26 — "Connect GitHub" UI** ← the GitKraken experience; **safe stop point**
- **Phase 27 — Token-based Push (HTTPS) + Safety Engine extension** (optional epic)

**Where you can stop:** Phases 21–26 deliver the full "connect → auto-fill → verified linked account" experience. Phase 27 only adds pushing over HTTPS with the token; if you keep pushing over SSH, you can ship after Phase 26.

**Verifiability principle (unchanged):** all network I/O goes through an injected HTTP client so the device-flow state machine and API client are unit-tested under Vitest with mocked responses. The UI is driven by Playwright against an **injected fake auth service** — no real GitHub call ever runs in CI.

---

## 1. Why OAuth (and why Device Flow)

GitWarden's reason to exist is **preventing the wrong-account push**. Today the Safety Engine can only check that a remote _host_ looks right (`REMOTE_HOST_MISMATCH`); it cannot verify _which account_ will actually authenticate. OAuth fixes both ends:

1. **Convenience** — one click pulls `displayName`, `gitAuthorName`, `gitAuthorEmail`, `githubUsername` from GitHub instead of four manual fields per profile.
2. **Verified identity (the real win)** — a token is bound to a concrete GitHub account. The engine can assert _"you are about to push as **@login**, and this repo's profile expects **@login** ✓"_ — a far stronger guarantee than host-string matching.

### 1.1 Mechanism decision — Device Authorization Flow

| Option                       | Client secret? | Redirect/protocol handler?                               | Verdict                                                               |
| ---------------------------- | -------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| **Device Flow**              | **No**         | **No**                                                   | ✅ Chosen — what `gh` CLI uses; nothing secret to embed in the binary |
| Authorization Code + PKCE    | No             | Needs `gitwarden://` custom protocol or localhost server | More moving parts; rejected for MVP                                   |
| Authorization Code (classic) | **Yes**        | Yes                                                      | A desktop binary cannot keep a secret — rejected                      |

Device Flow needs only a **public `client_id`**. There is no client secret anywhere in GitWarden.

### 1.2 Coexistence with SSH

OAuth is **additive**, not a replacement. SSH profiles keep working unchanged. A profile may be SSH-only, OAuth-linked, or both. GitKraken supports both transports; so do we.

### 1.3 Prerequisite (one-time, manual — see Appendix D)

A maintainer registers **one** GitHub OAuth App (Device Flow enabled) and obtains its **Client ID**. That single Client ID is shipped with the app and shared by every install; each end user authorizes their own account against it. This is the only step the agent cannot perform (it requires a human GitHub login).

---

## 2. Domain Model Additions (`core/types.ts`)

Extends the models in `docs/plans/gitwarden-plan.md` §10. All plain TS, Zod-validated at the storage/IPC boundary. **Tokens are never part of any model** — they live only in `TokenStore`, keyed by profile id.

```ts
// What the device-flow start step returns to the renderer (the device_code itself
// stays in main and is NEVER sent to the renderer).
export interface GitHubDeviceCode {
  userCode: string // e.g. "WDJB-MJHT" — shown to the user
  verificationUri: string // e.g. "https://github.com/login/device"
  expiresInSec: number // typically 900
  intervalSec: number // minimum poll interval, e.g. 5
}

// Resolved identity fetched from the GitHub API after authorization.
export interface GitHubAccount {
  id: number
  login: string // the @username
  name?: string
  email?: string // primary verified email (may be absent)
  avatarUrl?: string
}

// Persisted on the Profile. The token is NOT here.
export interface LinkedGitHubAccount {
  login: string
  accountId: number
  scopes: string[] // granted scopes, e.g. ["read:user","user:email"]
  connectedAt: string // ISO
}

// Auth progress, surfaced to the UI via an IPC event channel.
export type GitHubAuthStatus =
  | 'idle'
  | 'awaitingUser' // device code shown; polling
  | 'authorized' // token obtained
  | 'denied' // user rejected
  | 'expired' // user_code expired
  | 'error'

export type GitHubAuthErrorCode =
  | 'slowDown'
  | 'expiredToken'
  | 'accessDenied'
  | 'tokenInvalid' // 401 from the API later (revoked/expired)
  | 'network'
  | 'unknown'
```

`Profile` gains one optional field:

```ts
export interface Profile {
  // …existing fields…
  linkedGitHub?: LinkedGitHubAccount
}
```

The public Client ID lives in a config module (not a secret), e.g. `src/core/config/github.ts`:

```ts
export const GITHUB_CLIENT_ID = '<provided in Appendix D>'
export const GITHUB_OAUTH_SCOPES = ['read:user', 'user:email'] // + 'repo' only if Phase 27
```

---

## 3. New Services

```ts
// All network calls go through an injected HttpClient so Vitest can mock them.
export interface HttpClient {
  postForm(
    url: string,
    body: Record<string, string>,
    headers?: Record<string, string>
  ): Promise<{ status: number; json: unknown }>
  get(url: string, headers?: Record<string, string>): Promise<{ status: number; json: unknown }>
}

// Device Authorization Flow orchestration (main process).
export interface GitHubAuthService {
  requestDeviceCode(scopes: string[]): Promise<GitHubDeviceCode>
  // Polls the token endpoint, respecting `interval` + `slow_down`, until a
  // terminal state. Cancellable via AbortSignal. Resolves with the raw token.
  pollForToken(signal: AbortSignal): Promise<{ accessToken: string; scopes: string[] }>
}

// Read-only GitHub REST calls (main process).
export interface GitHubApiService {
  getAuthenticatedUser(token: string): Promise<GitHubAccount>
  getPrimaryVerifiedEmail(token: string): Promise<string | undefined>
}

// Encrypted token persistence — activates the SecretStore scaffolded in Phase 6.
export interface TokenStore {
  set(profileId: string, token: string): Promise<void>
  get(profileId: string): Promise<string | undefined>
  delete(profileId: string): Promise<void>
}
```

`SafetyCheckService` (pure, `core/`) gains optional inputs and codes — see §5.

---

## 4. The Device Flow (sequence)

```text
renderer                 main / GitHubAuthService            github.com
   │  connect(profileId)        │                                │
   ├───────────────────────────►│ POST /login/device/code        │
   │                            ├───────────────────────────────►│
   │   {userCode, verifyUri}    │◄───────────────────────────────┤
   │◄───────────────────────────┤  device_code (kept in main)    │
   │  show code + "Open GitHub" │                                │
   │  shell.openExternal(uri)   │  poll every `interval`s:        │
   │                            ├─ POST /login/oauth/access_token►│
   │                            │◄─ authorization_pending ────────┤
   │                            ├─ (wait interval) ──────────────►│
   │   authEvent: authorized    │◄─ access_token ─────────────────┤
   │◄───────────────────────────┤  GET /user, GET /user/emails    │
   │  auto-fill + linked badge  │  store token in TokenStore       │
```

Terminal poll responses: `access_token` (success) · `authorization_pending` (keep polling) · `slow_down` (increase interval) · `expired_token` · `access_denied`.

---

## 5. Safety Logic Extensions

OAuth strengthens the push gate. New, **optional** checks (only fire when a profile is OAuth-linked and/or HTTPS push is in play — SSH-only profiles are unaffected):

### New issue codes

| Code                      | Severity | Fires when                                                                                |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `GITHUB_ACCOUNT_MISMATCH` | blocker  | Repo's assigned profile is linked to `@A`, but the active/effective push account is `@B`. |
| `GITHUB_TOKEN_MISSING`    | blocker  | Profile is set to push over HTTPS but no token is stored for it.                          |
| `GITHUB_TOKEN_INVALID`    | blocker  | A stored token was rejected (401) — needs re-auth.                                        |
| `GITHUB_NOT_CONNECTED`    | warning  | Profile has no linked GitHub account (informational; SSH still allowed).                  |

These extend `checkPush` (and, for `GITHUB_TOKEN_INVALID`, surface in the Safety Center). Existing SSH codes (`REMOTE_HOST_MISMATCH`, etc.) are untouched. The push confirmation sheet (Phase 14) gains a line: _"Pushing as **@login** via HTTPS token — matches assigned profile ✓/✗."_

---

## 6. Implementation Phases

### Phase 21 — OAuth Foundations & Types

**Goal:** pure core types, schemas, and the recorded decision — no network, no UI.
**Tasks:**

- Add the types in §2 to `src/core/types.ts`; add Zod schemas for `LinkedGitHubAccount`, the GitHub API responses, and the new IPC payloads.
- Extend `Profile` (and its Zod schema + persisted-data round-trip) with `linkedGitHub?`.
- Add `src/core/config/github.ts` with `GITHUB_CLIENT_ID` (placeholder until Appendix D) + `GITHUB_OAUTH_SCOPES`.
- Update `DECISIONS.md` (reverse the token-deferral) and `SECURITY.md` (token-at-rest + no-secret-in-renderer rules).

**Exit:** `core/` stays pure (no `fs`/`child_process`/Electron); `tsc --noEmit` clean on both tsconfigs; Vitest round-trip parse/serialize passes for `Profile` (with and without `linkedGitHub`) and the new schemas.

### Phase 22 — Secret Storage Activation

**Goal:** real encrypted token storage — activate the `SecretStore` scaffolded in Phase 6.
**Tasks:**

- Implement `TokenStore` over `SecretStore` (Electron `safeStorage`), keyed by `profileId`; handle missing/corrupt ciphertext gracefully.
- Keep the injectable encryptor seam so Vitest runs without Electron.
- Ensure the logger redacts tokens everywhere (Appendix B of the main plan).

**Exit:** Vitest (injectable encryptor) — a token round-trips set→get; survives a simulated relaunch; `delete` removes it; corrupt data returns `undefined` (no throw); a spy on the logger proves the token never appears in any log line.

### Phase 23 — GitHub Device Flow Auth Service

**Goal:** the cancellable device-flow state machine, fully unit-tested with a mocked HTTP client.
**Tasks:**

- `GitHubAuthService.requestDeviceCode()` → POST `https://github.com/login/device/code` (`Accept: application/json`).
- `pollForToken()` → POST `https://github.com/login/oauth/access_token`; honor `interval`, back off on `slow_down`, stop on `access_denied`/`expired_token`; cancel cleanly on `AbortSignal`.
- Inject the `HttpClient`; keep `shell.openExternal` out of the service (it belongs in the IPC/main glue, Phase 25).

**Exit:** Vitest covers the full matrix with a fake `HttpClient` — `authorization_pending → success`, `slow_down` raises the interval, `expired_token`, `access_denied`, a network error, and an aborted poll that rejects/stops promptly. No UI.

### Phase 24 — GitHub API Client & Account Identity

**Goal:** turn a token into a verified `GitHubAccount`.
**Tasks:**

- `GitHubApiService.getAuthenticatedUser()` → GET `https://api.github.com/user` (`Authorization: Bearer …`).
- `getPrimaryVerifiedEmail()` → GET `https://api.github.com/user/emails`; pick `primary && verified`.
- Map a 401 to `GitHubAuthErrorCode.tokenInvalid` (the re-auth trigger).

**Exit:** Vitest (mocked HTTP) — `getAuthenticatedUser` maps `login/id/name/avatar_url`; primary-verified email is selected over others; a 401 yields the typed `tokenInvalid` error.

### Phase 25 — IPC Bridge for GitHub Auth

**Goal:** typed, Zod-validated channels wiring the services to the renderer.
**Tasks:**

- Channels: `github:startDeviceAuth` (returns `GitHubDeviceCode`, begins polling in main), `github:cancelDeviceAuth`, `github:disconnect`, `github:getLinkedAccount`.
- Push auth progress to the renderer via an event channel `github:authEvent` (`webContents.send`) carrying `GitHubAuthStatus` — keeps the UI cancellable and avoids a long blocking IPC call.
- On success in main: fetch identity (Phase 24), store the token (`TokenStore`), persist `linkedGitHub` on the profile. `shell.openExternal(verificationUri)` lives here.
- Validate every payload with Zod; wrap results in the existing `IpcResult<T>` envelope; register handlers in `electron/index.ts` with all new services injected.

**Exit:** Playwright with an **injected fake `GitHubAuthService`** (no real GitHub) — `startDeviceAuth` round-trips and returns a device code; a simulated `authEvent: authorized` reaches the renderer; an invalid payload is rejected by Zod; the renderer security flags (`contextIsolation`, `sandbox`, no `window.require`) still hold.

### Phase 26 — "Connect GitHub" UI ← the GitKraken experience

**Goal:** the one-click connect flow in `ProfilesScreen`. **Safe stop point.**
**Tasks:**

- "Connect GitHub" button → modal showing `userCode`, an "Open GitHub" button (`shell.openExternal`), live status (waiting / success / denied / expired / error), and Cancel.
- On success: auto-fill `displayName` (only if empty), `gitAuthorName`, `gitAuthorEmail`, `githubUsername`; render a linked badge (avatar + `@login`) and a **Disconnect** action.
- **Disconnect** (with confirm): delete the local token (`TokenStore`) and clear `linkedGitHub`; open `https://github.com/settings/connections/applications/{client_id}` so the user can fully revoke on GitHub (the API revoke endpoint needs a client secret we deliberately don't have — see Appendix C).
- Re-auth prompt when `GITHUB_TOKEN_INVALID` surfaces.
- Externalize all new strings in `strings.ts`.

**Exit:** Playwright (injected fake service) — click Connect → modal shows the code → simulated authorization → the four fields populate and a linked badge appears → Disconnect clears the badge and token. `tsc --noEmit` clean.

### Phase 27 — Token-based Push (HTTPS) + Safety Engine extension (optional)

**Goal:** push over HTTPS using the linked token, with the Safety Engine verifying the account. Skip this phase if you keep pushing over SSH.
**Tasks:**

- In the push path, when the remote is an HTTPS GitHub URL and the assigned profile has a stored token, authenticate via a bundled **`GIT_ASKPASS` helper**: the helper reads the token from a per-invocation env var and echoes it; `GitRunner` sets that env only for this push. The token is **never** written into the remote URL, `.git/config`, or `argv` (Appendix C).
- Extend `SafetyCheckService.checkPush` with the §5 codes (`GITHUB_ACCOUNT_MISMATCH`, `GITHUB_TOKEN_MISSING`, `GITHUB_TOKEN_INVALID`, `GITHUB_NOT_CONNECTED`).
- Add the "pushing as @login via HTTPS" line to the push confirmation sheet.
- Update `SECURITY.md` (token-in-transit: askpass only; scope minimization; revoke-on-disconnect caveat).

**Exit:** Vitest — the safety matrix for the four new codes (match/mismatch/missing/invalid). Integration — `GIT_ASKPASS` wiring against a local repo, plus an assertion that the token appears in **neither** `argv`, the stored remote URL, nor `.git/config`. Playwright — push is blocked on `GITHUB_ACCOUNT_MISMATCH` and proceeds only after explicit confirmation.

---

## 7. Acceptance Criteria (feature-level)

A user can: click **Connect GitHub** on a profile; see a device code and open GitHub; authorize and have the profile auto-fill name/email/username with a linked `@login` badge; **disconnect** (local token cleared + GitHub revoke page opened); and — if Phase 27 ships — push over HTTPS with the linked token, **blocked** when the token's account ≠ the repo's assigned profile and only proceeding after explicit confirmation. **Quality gate:** the device-flow state machine, API client, and token store are covered by passing Vitest with mocked HTTP/encryptor; the connect/disconnect UI is covered by Playwright against an injected fake service; **no test makes a real network call.**

---

## Appendix A — GitHub Endpoint Reference

All calls use `Accept: application/json`. Authenticated calls add `Authorization: Bearer <token>`.

| Operation           | Method · URL                                       | Body / Params                                                                         | Returns                                                                                                                    |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Request device code | POST `https://github.com/login/device/code`        | `client_id`, `scope`                                                                  | `device_code`, `user_code`, `verification_uri`, `expires_in`, `interval`                                                   |
| Poll for token      | POST `https://github.com/login/oauth/access_token` | `client_id`, `device_code`, `grant_type=urn:ietf:params:oauth:grant-type:device_code` | `access_token`, `scope`, `token_type` — or error `authorization_pending` / `slow_down` / `expired_token` / `access_denied` |
| Authenticated user  | GET `https://api.github.com/user`                  | —                                                                                     | `login`, `id`, `name`, `email`, `avatar_url`                                                                               |
| User emails         | GET `https://api.github.com/user/emails`           | —                                                                                     | `[{ email, primary, verified, visibility }]`                                                                               |

---

## Appendix B — Threat Model Additions (append to `SECURITY.md`)

- **Client ID is public** — fine to embed/commit. There is **no client secret** in GitWarden (Device Flow does not use one).
- **Token at rest:** only in `TokenStore` via Electron `safeStorage`; never plaintext, never in a model, never sent to the renderer (the renderer only ever sees `LinkedGitHubAccount`, never the token).
- **Token in transit (Phase 27):** supplied to git only through a `GIT_ASKPASS` helper reading a per-invocation env var — never in `argv`, never in the remote URL on disk, never in `.git/config`.
- **`device_code` stays in main** — only `user_code`/`verification_uri` cross to the renderer.
- **Logger redacts** access tokens and device codes.
- **Scope minimization:** identity needs only `read:user`, `user:email`; `repo` is requested **only** when HTTPS push (Phase 27) is enabled, via a re-auth with the broader scope.
- **HTTPS/cert validation** is never disabled.

---

## Appendix C — Disconnect & Revocation (honest limitation)

GitHub's token-revocation endpoint (`DELETE /applications/{client_id}/token`) requires the OAuth App's **client secret** as Basic auth. A Device-Flow desktop app has no secret, so GitWarden **cannot** programmatically revoke a token. Therefore **Disconnect**:

1. deletes the local token (`TokenStore.delete`) and clears `linkedGitHub`, and
2. opens `https://github.com/settings/connections/applications/{client_id}` so the user can revoke GitWarden's access on GitHub if they choose.

OAuth App tokens do not expire by default and there is no refresh token in this flow — so token lifecycle is "valid until the user revokes." A revoked/expired token surfaces later as `GITHUB_TOKEN_INVALID` (401) and triggers the re-auth prompt.

---

## Appendix D — Registering the OAuth App (one-time, manual)

The agent cannot do this — it needs a human GitHub login. ~3 minutes:

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Name `GitWarden` (this string is what users see on the consent screen), Homepage URL = the repo URL. Authorization callback URL can be the repo URL (Device Flow does not use it).
3. Create the app, then **enable "Device Flow"** in its settings.
4. Copy the **Client ID** and paste it into `src/core/config/github.ts` (`GITHUB_CLIENT_ID`). Do **not** generate or store a client secret.
5. The same Client ID ships to all users; each authorizes their own account against it. No per-user registration.

> One real end-to-end check is still required from a human after Phase 26: run `npm run dev`, click **Connect GitHub**, and authorize with a real account once — CI only exercises the injected fake service.
