# SECURITY.md — GitWarden

Threat model and enforceable security rules. Source: `docs/plans/gitwarden-plan.md` §7.4.
These rules are **non-negotiable** and apply everywhere; review every PR against them.

## Threat model

Opening a repository can **execute code**. Git hooks (`.git/hooks/*`) and certain config
keys (e.g. `core.fsmonitor`, `core.pager`, alias expansions) run external programs as a
side effect of ordinary git commands. Therefore **every repo path and every repo's
contents are untrusted input**, even on the user's own machine.

## Enforceable rules

1. **`execFile` + args array, never a shell.**
   Run git only via `child_process.execFile` with an **arguments array**. Never `exec`,
   never `sh -c`, never string interpolation or shell concatenation. Path arguments go
   after `--` to prevent option injection. `GitRunner` is the **only** caller of `execFile`.

2. **Canonicalize & validate every repo path.**
   Resolve the real path (follow symlinks), reject paths containing `..` traversal, and
   require a genuine `.git` (directory or gitfile) before treating a path as a repo.
   Untrusted paths never reach git unvalidated.

3. **Controlled git environment.**
   `GitRunner` sets a fixed env for every invocation:
   - `GIT_CONFIG_NOSYSTEM=1` — ignore system-level git config.
   - `GIT_TERMINAL_PROMPT=0` — never block on an interactive credential prompt.
   - `GIT_OPTIONAL_LOCKS=0` — for read-only ops, avoid taking optional locks.
   - `LC_ALL=C` — stable, parseable, locale-independent output.
     Only the minimal env git/ssh need is forwarded (`HOME`/`USERPROFILE`, `PATH`,
     `SSH_AUTH_SOCK`); nothing else from the host environment leaks through.

4. **Locked-down renderer.**
   The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and
   `sandbox: true`. The renderer has **no Node access**; it reaches main only through the
   typed preload bridge.

5. **Zod-validated IPC.**
   Every IPC payload crossing the preload bridge (both directions) is validated with Zod
   at the boundary. Malformed or unexpected payloads are rejected, not coerced.

6. **No secret logging.**
   Never log tokens, secrets, or credential material. `Logger` redacts known-sensitive
   fields; when in doubt, omit. Secrets never appear in logs, error messages, or telemetry.

7. **Hooks risk acknowledged (not sanitized in MVP).**
   GitWarden does **not** sanitize or sandbox git hooks in the MVP. This residual risk is
   accepted and documented here. Mitigation: all **destructive and remote actions stay
   behind explicit confirmation**, and irreversible actions (e.g. `git clean`) get a
   distinct, stronger warning. A future phase may add hook detection/disabling.

## GitHub OAuth token handling (Device Flow)

Added with the GitHub OAuth feature (`docs/plans/github-oauth-plan.md`, Appendix B).
These rules are **non-negotiable** like the rules above.

8. **No client secret; the Client ID is public.**
   GitWarden uses the OAuth **Device Authorization Flow**, which has **no client secret**.
   The public `GITHUB_CLIENT_ID` (`src/core/config/github.ts`) is fine to embed and commit.
   No secret is ever generated, stored, or shipped — a desktop binary cannot keep one.

9. **Token at rest — `TokenStore` only.**
   An access token lives **only** in `TokenStore` (Electron `safeStorage`, encrypted),
   keyed by `profileId`. It is **never** written in plaintext, **never** a field on any
   domain model (`Profile`, `LinkedGitHubAccount`, …), and **never** persisted to JSON.
   The persisted link carries only `login`, `accountId`, granted `scopes`, and `connectedAt`.

10. **No secret in the renderer.**
    The token **never** crosses the preload bridge to the renderer. The renderer only ever
    receives `LinkedGitHubAccount` (identity + scopes), `GitHubDeviceCode`
    (`user_code`/`verification_uri` only), and `GitHubAuthStatus` events. The raw
    `device_code` **stays in the main process** and is never sent to the renderer.

11. **Logger redacts access tokens and device codes.**
    Access tokens and `device_code` values must never appear in any log line, error
    message, or telemetry. Treat both as secrets under rule 6.

12. **Scope minimization.**
    Request only `read:user` and `user:email` for identity. The broader `repo` scope is
    requested **only** if HTTPS push (Phase 27) is enabled, via an explicit re-auth — never
    by default. HTTPS/cert validation is never disabled for any GitHub call.

13. **Token in transit — `GIT_ASKPASS` only (Phase 27).**
    For an HTTPS-token push, the token reaches `git` through **exactly one** channel: a
    bundled `GIT_ASKPASS` helper (`src/main/git/askpass.ts`) that echoes the credential
    from a **per-invocation environment variable** (`GITWARDEN_ASKPASS_PASSWORD`), set by
    `GitRunner` only for that single `push`. The token **never** appears in `argv`, **never**
    in the remote URL on disk, and **never** in `.git/config`. The helper script itself
    contains no secret — only the env-var read. `GIT_TERMINAL_PROMPT=0` prevents any
    interactive fallback. SSH and ambient-credential pushes attach no credential env at all.

14. **Account verification before push.**
    Before an HTTPS-token push, the stored token is verified against `GET /user` so the
    Safety Engine can block `GITHUB_ACCOUNT_MISMATCH` (token authenticates as a different
    account than the repo's assigned profile), `GITHUB_TOKEN_MISSING`, and
    `GITHUB_TOKEN_INVALID` (a 401 → re-auth). The verification uses the token in main only;
    the renderer receives just the resolved `@login`, never the token.

15. **Revoke on disconnect is best-effort (no client secret).**
    Device-Flow apps have no client secret, so GitWarden **cannot** call GitHub's
    token-revocation endpoint. **Disconnect** deletes the local token (`TokenStore.delete`)
    and clears `linkedGitHub`, then opens
    `https://github.com/settings/connections/applications/{client_id}` so the user can
    revoke access on GitHub. A token thus stays valid on GitHub until the user revokes it;
    a revoked/expired token surfaces later as `GITHUB_TOKEN_INVALID` (401) and triggers the
    re-auth prompt.

## AI Connections (advisory layer)

Added with the AI Connections feature (`docs/plans/ai-integration-plan.md` §3–§6). The central
new risk is that **sending a diff to an AI endpoint can mean sending source code to a third
party.** These rules are **non-negotiable** like the rules above.

16. **Source-code-to-provider is the central risk; default-off with fixed precedence.**
    No repo context leaves the machine until the user both enables AI and selects an active
    connection. When the enable flags disagree, precedence is one-directional —
    **per-repo override → global enable → `connection.enabled`** — and a more specific opt-out
    always wins. A repo opted out of AI blocks context assembly entirely. The AI is advisory:
    no blocker, gate, or Git mutation may depend on model output.

17. **Send gate — redaction + explicit acknowledgement (revised in Phase 55a).** Originally the
    default privacy mode was `preview-each`: a per-send dialog showed the exact **post-redaction**
    payload and **destination host** before each sensitive request. The AI Chat Redesign
    (Phase 55a) **removed that inline preview→confirm gate** from the chat UI as a user-accepted
    trade-off. The shipped send gate is now: redaction always runs server-side before send (rule 18),
    and networked chat commands require an explicit acknowledgement (`expensiveSendAcknowledged`,
    set on an intentional command click/Enter). The `AiPrivacyMode` field (`off` | `preview-each` |
    `preview-first-run`) and the destination host are still in the model (rule 20) should a preview
    surface be reintroduced, but **no visual post-redaction preview is shown in the current chat
    flow.** Consequence: redaction (best-effort, not a guarantee) is the primary safeguard on the
    send path — see rule 18.

18. **Prompt redaction runs on the full context, before chunking.** Known token / private-key /
    GitHub-token / env-secret / credential-URL shapes are stripped from the **whole** context
    **before** any truncation or chunking, so a split boundary can never carry an un-scanned
    secret into a later chunk. Redaction and the deterministic secret scanner share **one**
    ruleset (`src/core/ai/redaction.ts`) — not two tables that can drift. Redaction is
    defense-in-depth and best-effort, **not** a guarantee; it never replaces user review of the
    preview.

19. **AI credentials at rest — `AiCredentialStore` only; never in connection JSON, never back to
    the renderer.** API keys and Custom HTTP header secrets live **only** in the encrypted
    `AiCredentialStore` (Electron `safeStorage`), keyed by `connectionId`. They are **never** a
    field on `AiConnection` (or any persisted model), **never** written to JSON, **never**
    returned to the renderer after save (the renderer receives only `AiCredentialMetadata` — a
    masked preview + which fields are stored), and **never** logged. Secret header values are
    masked everywhere they surface, including exported templates (Phase 38).

20. **`baseUrl` is a send-destination control, not a secret.** A connection's `baseUrl` is
    intentionally non-secret JSON so the send preview can display the host. The corollary is that
    a tampered or swapped `baseUrl` is a **recipient-change** risk: it silently redirects where
    source is sent. The preview-shows-the-host rule (17) is the mitigation — a changed destination
    is visible before any send. Transport is `https://` only for every adapter (built-in and
    Custom HTTP), except plain `http://` to a loopback host (`localhost` / `127.0.0.1` / `[::1]`)
    for local servers. HTTPS/cert validation is never disabled.

21. **Custom HTTP is declarative and constrained — never an evaluation surface.** A Custom HTTP
    mapping may interpolate **only** the closed placeholder set (`{{apiKey}}`, `{{model}}`,
    `{{messagesJson}}`, `{{promptJson}}`, `{{responseSchemaJson}}`, `{{metadataJson}}`); any other
    placeholder is rejected. Response extraction uses a **safe JSONPath subset** — dotted-key and
    numeric-index navigation only (`$.choices[0].message.content`). Filter (`?(…)`), script,
    recursive-descent (`..`), and wildcard (`*`, `[*]`) expressions are **rejected, not silently
    ignored**; the navigator performs pure property access and cannot evaluate code. No arbitrary
    JavaScript, no file reads, no shell. Mappings are validated by Zod at the boundary
    (`CustomHttpMappingSchema`).

22. **Retention posture is surfaced and unknown-retention is opt-in.** GitWarden shows a
    connection's retention state; an endpoint that cannot attest zero-retention requires explicit
    user acceptance (`user-accepted`) before sends on the default path. Local (loopback)
    connections are presented as the safest. No prompt/response logging by default; any future
    diagnostic logging must be redacted and opt-in.

23. **Chat free-text and `/explain` pasted content are context — same redaction, same gate.**
    Free-text chat messages, `@mention`-selected paths, and `/explain` arguments (a `SafetyCode`
    token, or **pasted tool / build output**) all become AI context and pass through the **same**
    redaction ruleset (`src/core/ai/redaction.ts`, rule 18) before leaving the machine. A pasted
    log or stack trace is a new free-text input path — users must treat it like any other content
    they send, since redaction is conservative and best-effort, not a guarantee. Streaming chat
    (`ai:chatStreamEvent`) is response-direction only and never bypasses request-side redaction;
    it carries plain assistant prose, not structured outputs.
