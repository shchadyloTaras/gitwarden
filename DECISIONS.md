# DECISIONS.md — GitWarden

Phase 0 foundational decisions. Each item is a binding decision with a one-line rationale.
Source: `docs/plans/gitwarden-plan.md` §7.

## 1. Locating & trusting the `git` binary (§7.1)

- **Resolution order:** user-configured path (Settings) → `PATH` lookup (`which git` on macOS/Linux, `where git` on Windows) → known common locations.
  - _Rationale:_ an explicit user override always wins; `PATH` covers the common case; fixed fallbacks rescue GUI-launched apps that don't inherit the login shell's `PATH`.
- **Common-location fallbacks:**
  - macOS: `/opt/homebrew/bin/git`, `/usr/local/bin/git`, `/usr/bin/git`.
  - Linux: `/usr/bin/git`, `/usr/local/bin/git`.
  - Windows: `C:\Program Files\Git\cmd\git.exe`, `C:\Program Files (x86)\Git\cmd\git.exe`.
  - _Rationale:_ GUI apps on macOS frequently launch with a minimal `PATH` that omits Homebrew; these paths cover the dominant install methods per OS.
- **Verification:** a resolved binary is trusted only after `git --version` succeeds and parses as a git version.
  - _Rationale:_ confirms the path is a real, runnable git — not a stale or wrong executable — before any repo operation.
- **First-run "git not found" UX:** if no candidate verifies, show a **blocking** first-run screen with per-OS install guidance (macOS: Xcode CLT / Homebrew; Linux: distro package manager; Windows: Git for Windows) plus a "Locate git manually…" file picker and a "Re-check" button. Never fail silently or degrade to a half-working state.
  - _Rationale:_ git is a hard dependency; the user must resolve it explicitly, and the app must make the fix obvious and self-service.

## 2. SSH model (§7.2)

- **The app does NOT manage SSH keys in MVP.** It relies on the user's existing `~/.ssh/config`, `ssh-agent` (macOS/Linux), or **Windows OpenSSH agent**. No key creation, import, or rotation.
  - _Rationale:_ key management is high-risk and out of scope; reusing the OS/ssh-agent infrastructure keeps the app's blast radius small and avoids storing private keys.
- **`sshKeyAlias` mapping:** a profile's `sshKeyAlias` maps to an **existing** ssh `Host` alias / `IdentityFile` entry in the user's ssh config. The app _surfaces which_ alias/key a push will use; it does not write or modify ssh config.
  - _Rationale:_ the safety value is visibility ("you're about to push with the Work key"), not control — so the app reads and displays, never mutates.
- **Env forwarded to git/ssh:** `GitRunner` forwards only what git/ssh need — `HOME` (macOS/Linux) / `USERPROFILE` (Windows), `PATH`, and `SSH_AUTH_SOCK` (macOS/Linux agent socket).
  - _Rationale:_ minimal env reduces the chance of leaking host state into git and keeps behavior reproducible.
- **Windows agent:** Windows OpenSSH uses a **named-pipe** agent (not `SSH_AUTH_SOCK`); the requirement is that `ssh` is on `PATH` so git can find it. Documented as a setup precondition.
  - _Rationale:_ the named-pipe agent needs no socket env var, but git-over-ssh on Windows only works if `ssh.exe` is resolvable — so we document that instead of forwarding a socket that doesn't exist there.

## 3. Token auth deferred (§7.3) — ⚠️ SUPERSEDED by §3a (GitHub OAuth plan, Phase 21+)

> **Status: superseded.** The MVP shipped (Phases 0–20) with token auth deferred, exactly as recorded below. The GitHub OAuth feature (`docs/plans/github-oauth-plan.md`) reverses this; the new decision is in §3a. The original text is kept for history.

- **Token auth is model-only in MVP.** `AuthenticationMethod` includes `token`, but the profile UI offers **SSH only**; `token` exists in the type system but has no UI and no push path.
  - _Rationale:_ keeps the type model complete and future-proof without shipping a half-built credential path.
- **`SecretStore` ships but is not wired into push.** The Electron `safeStorage`-backed store exists, but MVP push never reads a token from it.
  - _Rationale:_ avoids a deceptive path that passes safety checks yet silently does nothing — no partially-built auth in production.

## 3a. GitHub OAuth via Device Flow — token auth now in scope (reverses §3)

Source: `docs/plans/github-oauth-plan.md` §1, §1.1, Appendix B–D. Reverses the §3 deferral.

- **OAuth sign-in is in scope.** GitWarden adds **"Connect GitHub"** via the OAuth **Device Authorization Flow** (the mechanism `gh` CLI uses for desktop sign-in). One click links a profile to a real GitHub account, auto-fills its identity, and lets the Safety Engine verify the _account_ behind a push — not just the remote host string.
  - _Rationale:_ wrong-account prevention is GitWarden's reason to exist; a token bound to a concrete `@login` is a far stronger guarantee than host matching.
- **Device Flow, not Authorization Code.** Device Flow needs only a **public `client_id`** — **no client secret, no redirect/custom-protocol handler**. A desktop binary cannot keep a secret, so any flow requiring a client secret is rejected.
  - _Rationale:_ nothing secret is embedded in the shipped binary; the `client_id` is public and fine to commit (`src/core/config/github.ts`).
- **Additive to SSH, not a replacement.** A profile may be SSH-only, OAuth-linked, or both. Existing SSH profiles and codes (`REMOTE_HOST_MISMATCH`, …) are untouched.
  - _Rationale:_ OAuth strengthens the push gate without breaking the SSH path that already works.
- **`SecretStore` is now activated** (Phase 22) as a `TokenStore` keyed by `profileId`. Tokens live **only** there (Electron `safeStorage`), never in a model, never in the renderer — see SECURITY.md §8–9.
  - _Rationale:_ reverses "ships but unwired" — the encrypted store now backs a real, audited credential path.
- **Revocation is best-effort by design.** Device Flow has no client secret, so GitWarden **cannot** call GitHub's token-revoke endpoint. **Disconnect** deletes the local token and opens GitHub's app-connections page so the user can revoke there (Appendix C).
  - _Rationale:_ honest limitation surfaced to the user rather than a silent half-revoke.

## 4. Concurrency & cancellation (§7.5)

- **Long ops are cancellable:** clone/fetch/pull/push keep their `ChildProcess` handle; cancel calls `kill()`; progress is surfaced from stderr.
  - _Rationale:_ network ops can hang or run long; the user must be able to abort, and stderr is git's real-time progress channel.
- **Per-repo serialization:** mutating git ops are serialized per canonical repo path (one in-flight mutation per repo at a time).
  - _Rationale:_ concurrent mutations collide on git's index lock (`index.lock`); serializing avoids corrupt/failed operations. Read-only ops across different repos may still run in parallel.

## 5. Minimum supported versions

- **Node.js:** ≥ 20 LTS — _Rationale:_ matches the Node bundled by current Electron and provides a stable, supported `child_process`/`fs` API surface.
- **Electron:** ≥ 30 — _Rationale:_ recent enough to default-enable the renderer lockdown the threat model requires (`sandbox: true`, `contextIsolation`) and to ship current Chromium security fixes.
- **git:** ≥ 2.30 (resolved at runtime, not bundled) — _Rationale:_ a baseline with stable porcelain v2 status output and the config/env flags the Safety Engine relies on.

## 6. AI Connections — advisory layer (Phases 28–34)

Source: `docs/plans/ai-integration-plan.md` §1–§6. These decisions are binding for the AI
feature; they extend, and never weaken, the deterministic Safety Engine.

- **Token-first, single active connection.** The default Settings → AI UX is "paste the API
  key you already have": GitWarden detects the provider from the key, fetches the models that
  key can use (the fetch _is_ the connection test — no separate Test button on the primary
  path), the user picks one and saves. Under the hood it is still an n8n-style connection model
  (`AiConnection[]`, reusable credential + adapter + capabilities), but the MVP UI exposes one
  active connection, not a manager of many.
  - _Rationale:_ near-zero setup for the 80% case without throwing away the reusable-connection
    data model the advanced path and Phase 38 templates need.
- **Save and Enable are two deliberate steps.** "Save connection" attaches a key and a model;
  "Enable AI" is a separate consent that allows repo content to leave the machine. Saving with
  AI still disabled sends nothing.
  - _Rationale:_ the privacy consent (data leaving the machine) must be a conscious, distinct
    act — not a side effect of configuring a provider.
- **Advisory-only — AI owns no Git action.** The AI explains, drafts, and recommends. **No
  blocker, gate, or Git mutation may depend on model output.** It never commits, pushes, changes
  identity, rewrites config, or clears a deterministic finding; a model "all clear" cannot
  override the Safety Engine or the deterministic secret scanner. (Phase 39 agentic actions stay
  deferred and allowlist-only.)
  - _Rationale:_ GitWarden's reason to exist — preventing the wrong-identity commit/push — is a
    deterministic guarantee; AI sits beside it, never inside the control path.
- **Default-off with fixed, one-directional precedence.** AI is disabled until the user enables
  it. When flags disagree, precedence is **per-repo override → global enable → `connection.enabled`**;
  a more specific opt-out always wins, and no flag can re-enable what a more specific flag turned
  off. A repo opted out of AI blocks context assembly entirely.
  - _Rationale:_ a single, predictable rule means a user can always reason about whether a given
    repo's content can be sent, and the safest setting dominates.
- **Zero-retention / unknown-retention is a conscious downgrade.** GitWarden surfaces a
  connection's retention state (`zero-retention` | `unknown` | `user-accepted`). An endpoint that
  cannot attest zero-retention requires the user to explicitly accept the downgrade.
  - _Rationale:_ sending a diff can mean sending source to a third party; the retention posture
    and the actual destination must be visible and opt-in, not buried.
  - ⚠️ **Updated by Phase 55a (see below).** The `AiPrivacyMode` field (`off` | `preview-each` |
    `preview-first-run`) still exists in the connection model, but the **inline per-send
    preview→confirm gate was removed from the chat UI** in the AI Chat Redesign. The shipped
    privacy floor is now redaction + an explicit send acknowledgement, not the visual payload
    preview — see the Phase 55a decision at the end of this section.
- **`localOnly` is derived from the resolved host, not the kind.** Any connection whose base URL
  resolves to loopback (`localhost` / `127.0.0.1` / `[::1]`) is surfaced as the most private
  choice — including an `openai-compatible` connection pointed at LM Studio / vLLM / llama.cpp,
  not just `ollama`. Transport is `https://` only for every adapter, except plain `http://` to
  loopback.
  - _Rationale:_ privacy status must follow where data actually goes, not a provider label; local
    servers over plain http on loopback are legitimately the safest path.
- **Custom HTTP is declarative, not code.** The power-user escape hatch supports only a closed
  placeholder set (`{{apiKey}}`, `{{model}}`, `{{messagesJson}}`, `{{promptJson}}`,
  `{{responseSchemaJson}}`, `{{metadataJson}}`) and a **safe JSONPath subset** for response
  mapping — dotted-key and numeric-index navigation only (`$.choices[0].message.content`). Filter
  (`?(…)`), script, recursive-descent, and wildcard expressions are **rejected, not silently
  ignored**. No arbitrary JS, no file reads, no shell.
  - _Rationale:_ a user-supplied mapping must never become an evaluation surface; rejecting (vs
    ignoring) unsafe paths makes the constraint enforceable and auditable.
- **One redaction / secret-scanner ruleset.** The prompt-redaction patterns (Phase 31) and the
  deterministic secret scanner (Phase 33) are the **same** core ruleset (`src/core/ai/redaction.ts`),
  not two parallel tables that can drift apart. Redaction runs on the **full** context **before**
  any chunk/truncation, so no split boundary can carry an un-scanned secret into a later chunk.
  - _Rationale:_ two pattern tables inevitably diverge; one shared source keeps "what we redact"
    and "what we warn about" identical, and pre-chunk redaction removes a whole class of leak.
- **Secrets never live in `AiConnection` JSON.** A connection record — including `baseUrl`, the
  send destination — is non-secret JSON. API keys and custom header secrets are referenced only by
  `connectionId` and live in the encrypted `AiCredentialStore`; they never cross back to the
  renderer after save. (See SECURITY.md §16–§20.)
  - _Rationale:_ keeping the destination non-secret is what lets the send preview show the host;
    keeping the credential out of the record is what keeps it out of logs, exports, and the renderer.

### 6a. AI Chat Redesign & simplification (Phases 52–55a + post-plan hardening)

Source: `docs/plans/ai-chat-redesign-plan.md` and the post-plan log entries in `docs/progress-log.md`.
These refine — and in one case relax — the §6 decisions; they never weaken the advisory-only or
deterministic-safety invariants.

- **One chat surface replaces the per-capability panels.** The six AI panels (push-brief,
  history, repo-onboarding, failure-explain, safety-explain, agentic-proposal) were retired
  (Phase 55) in favour of a single chat panel driven by slash-commands (`/commit`, `/review`,
  `/push-brief`, `/history`, `/repo-brief`, `/propose`, `/explain`, `/help`). The underlying
  capability IPC/store methods are retained — the chat now invokes them. Deterministic safety
  reporting (`SafetyIssueRow`) was kept AI-free.
  - _Rationale:_ one conversational entry point is easier to reason about than six panels, while
    the deterministic Safety Engine stays entirely independent of the AI layer.
- **Paste-key-and-go: a stored key is the consent (Phase 55a).** Settings → AI was reduced to
  token → live model list → pick → Save; saving a credential auto-enables AI. The separate
  "Enable AI" toggle, per-repo override UI, Advanced disclosure, and built-in templates / export
  were removed from the UI. The backend precedence (`isAiSendAllowed`) and `RepositoryRecord.aiOverride`
  field remain as no-ops for forward compatibility.
  - _Rationale:_ near-zero setup for the common case; the conscious act is now "store a key + send",
    which the user does explicitly.
  - ⚠️ _Trade-off (user-accepted):_ this **supersedes the §6 "Save and Enable are two deliberate
    steps" decision** for the shipped UI — a saved key is now both. The privacy consent is the
    explicit send, not a separate enable step.
- **The inline send-preview gate was removed; the privacy floor is redaction + explicit
  acknowledgement (Phase 55a).** The chat no longer shows a per-send `preview-each`
  payload→confirm dialog. Slash-commands and free-text send immediately; networked chat commands
  pass `expensiveSendAcknowledged: true` on explicit click/Enter, and redaction (DECISIONS.md §6
  "one redaction ruleset", SECURITY.md §18) still runs server-side before every send.
  - _Rationale:_ the redesign optimizes for "paste key and chat"; the user accepted reducing the
    visible-payload gate to the redaction + acknowledgement floor.
  - ⚠️ _Trade-off (user-accepted):_ source can leave the machine without a visual post-redaction
    preview. Redaction remains best-effort, not a guarantee. The `AiPrivacyMode` model field is
    retained should a preview surface be reintroduced.
- **Streaming chat is plain-prose only.** `AiChatAssistant.chatStream` streams free-text replies
  over the `ai:chatStreamEvent` channel; structured (schema-bound) capabilities keep the
  non-streaming request path. Streaming is response-direction and does not bypass request-side
  redaction.
  - _Rationale:_ live tokens improve chat UX, but structured outputs must be parsed/validated whole
    and the redaction gate is on the outbound request, so streaming changes neither.
- **`/explain` accepts pasted tool output — treated as ordinary context.** `/explain` classifies
  its argument as a known `SafetyCode` token (explained from deterministic copy) or as **pasted
  tool/build output**, which is routed through the same redaction ruleset as any diff context
  before send. `@mention` / path-filtering selects which repo paths join the context.
  - _Rationale:_ pasted output is a new free-text input path; reusing the single redaction ruleset
    keeps "what we strip before sending" identical everywhere, with no parallel table to drift.
- **Structured output uses one schema source with a compatibility fallback chain.** All structured
  assistants derive their JSON schema from `providerJsonSchemaForKind` (`src/core/ai/providerSchemas.ts`);
  the OpenAI-compatible adapter degrades gracefully on HTTP 400 — strict `json_schema` → non-strict
  → `json_object` → plain completion.
  - _Rationale:_ one schema source prevents per-assistant drift; the fallback lets models without
    strict structured-output (e.g. Gemma) still return parseable JSON instead of hard-failing.
