# GitWarden — AI Connections Implementation Plan

> Add an **advisory AI layer** that explains, drafts, summarizes, and recommends — but design the provider setup like **n8n-style connections**: reusable credentials, built-in adapters, custom endpoints, testable mappings, and safe previews.
>
> The AI is **subordinate to the deterministic Safety Engine** and **owns no Git action**. It never silently commits, pushes, changes identity, rewrites config, or bypasses a blocker. Everything is **default-off**, privacy-aware, and gated behind the same user confirmations that already guard destructive/remote actions.

## 0. How to Read This Plan

This continues the main plan (`docs/plans/gitwarden-plan.md`) and the OAuth plan (`docs/plans/github-oauth-plan.md`). Same conventions: each phase has a **Goal**, **Tasks**, and explicit **Exit criteria**. Build **logic-first** — pure core + injected services with green Vitest before UI. Do not start a phase until its dependencies are met.

Phase order (continues the OAuth plan, which ended at Phase 27):

- **Phase 28 — AI Foundations, Decisions & Connection Contracts** (core, pure)
- **Phase 29 — AI Connections Manager & Credential Store** (n8n-like connection UX)
- **Phase 30 — Adapter Registry, Built-in Providers & Custom HTTP**
- **Phase 31 — Context Builder, Redaction & Send Preview** ← privacy backbone; must precede real diff sends
- **Phase 32 — Smart Commit Assistant** ← first useful vertical slice
- **Phase 33 — Change Review Assistant**
- **Phase 34 — Safety Copilot** ← **recommended MVP stop point (28–34)**
- **Phase 35 — Push Brief & History Intelligence**
- **Phase 36 — Repo Onboarding Assistant**
- **Phase 37 — Failure Explainer**
- **Phase 38 — Connection Templates, Import/Export & Team Handoff**
- **Phase 39 — Optional Agentic Actions** (deferred; allowlist-only)

**Recommended MVP cut:** ship **Phases 28–34**. That gives users AI Connections, credential safety, custom provider flexibility, redaction/preview, commit drafting, staged-change review, and safety explanations. Phases 35–38 are value-ordered add-ons. Phase 39 is intentionally last and should not be designed until the advisory MVP is stable.

**Verifiability principle:** all model/network I/O goes through injected connection adapters, so logic is unit-tested under Vitest with fake adapters. Playwright uses an injected fake AI connection (`GITWARDEN_E2E_FAKE_AI=1`). No real AI network call runs in CI.

---

## 1. Product Direction: Token-First, One Active Connection

GitWarden should not feel like it supports "one AI provider," but it should also not bury the user in setup. The guiding principle is **token-first with near-zero settings**: the user pastes the API key they already have, GitWarden figures out the rest, shows the models that key can actually use, the user picks one, saves, and — as a separate, deliberate step — enables AI. Under the hood this is still an n8n-style connection model (reusable credential + adapter + capabilities), but the **default UI exposes a single active connection**, not a manager of many.

### Primary flow (the 80% path)

```text
Settings → AI
  Paste API key
    → GitWarden detects the provider from the key
    → fetches the models the key can use   (this fetch IS the connection test)
    → user picks a model
    → Save
  Enable AI   ← separate toggle; nothing leaves the machine until this is on
```

Two deliberately separate steps:

1. **Save connection** = "I attached a key and chose a model." No code leaves the machine yet.
2. **Enable AI** = "I allow my repo content to be sent to this provider." This is the privacy consent, kept distinct on purpose (see §4).

### Progressive disclosure (the ambiguous-key case)

A key's prefix identifies the provider only sometimes. When it does not, GitWarden asks for **exactly one** more thing — a base URL — never a multi-step wizard:

- `sk-or-…` → OpenRouter, `sk-ant-…` → Anthropic, `gsk_…` → Groq → **zero extra fields**, fetch models immediately.
- bare `sk-…` / `sk-proj-…` → ambiguous (OpenAI, Together, Fireworks, a gateway, a local vLLM all share this shape) → show **one** "Provider / Base URL" field (default: OpenAI), then fetch models.

The model list appearing is the success signal; if it does not appear, the key is invalid or the endpoint is unreachable. There is no separate "Test connection" button on the primary path.

### Model list is filtered to what GitWarden can use

"Which models can I use" means **models that support the features GitWarden drives** (structured JSON output for commit drafts and review), not every model the key can reach. Models that cannot return structured output are hidden or clearly marked unsupported, with a _recommended_ tag on known-good ones, so the user cannot silently pick a model that breaks drafting.

For **local OpenAI-compatible servers** (LM Studio, vLLM, llama.cpp) structured output is a **server** capability — JSON-schema / grammar-constrained decoding — available across most models, not a per-model trait. So the filter must not blanket-hide local models: assume structured output is available for a local server and rely on the existing fail-closed Zod parse if a specific model misbehaves, rather than pre-hiding the whole list.

### Vocabulary (unchanged underneath)

- **Connection** = named, reusable provider configuration. The data model supports many (`AiConnection[]`); the MVP UI shows one active.
- **Credential** = encrypted secret material for that connection.
- **Adapter** = code that knows how to call that connection type.
- **Capability** = structured JSON, streaming, model list, cost estimate, local-only.
- **Mapping** = Custom HTTP only — a constrained way to map GitWarden's request into the provider request and the response back.

### Advanced path (unchanged power, hidden by default)

The n8n-style power lives behind an **Advanced** disclosure, so it never clutters the primary flow:

```text
Advanced → Custom HTTP
  URL · Method · Headers template · Body template · Response mapping · Test connection
```

### AI output language

For the MVP, AI-generated text (commit drafts, summaries, explanations) is **English-only** regardless of UI locale, to avoid a half-translated interface. Passing the UI locale into prompts is a post-MVP enhancement, not an MVP setting.

---

## 2. Why Advisory-Only

GitWarden's reason to exist is **preventing the wrong-identity commit/push**. That guarantee is deterministic — it comes from `SafetyCheckService` in `src/core/safety/`. AI must not weaken that.

The AI layer is strictly additive:

1. **It explains** — `SafetyCode` or `GitCommandError` in plain language.
2. **It drafts** — commit messages, summaries, release notes that the user must explicitly insert.
3. **It recommends** — review findings and risk flags labeled as model judgment, never as blockers.

**Hard rule:** no blocker, gate, or Git mutation may depend on model output. Deterministic controls stand alone; AI sits beside them.

| Concern                            | Owner                             | AI role                           |
| ---------------------------------- | --------------------------------- | --------------------------------- |
| "Is this commit/push safe?"        | `SafetyCheckService`              | None; may explain an issue        |
| "Does this diff contain a secret?" | Deterministic scanner             | May add findings, never clear one |
| "Should this action run?"          | Existing user confirmations       | None                              |
| "What does this error mean?"       | `ErrorMapper` → `GitCommandError` | Additive explanation only         |

---

## 3. Architecture Rules

These extend `AGENTS.md`; they do not replace it.

- **`src/core/` stays pure.** Add only AI types, Zod schemas, redaction rules, adapter contracts, mapping schemas, and result models. No model/network calls.
- **All AI network calls live in `src/main/ai/`** behind injected adapters. The renderer never reaches a provider directly.
- **AI never calls `GitRunner`.** Git execution remains app-owned, deterministic, serialized, and user-confirmed.
- **Secrets via `SecretStore`.** API keys and custom header secrets live in a dedicated `AiCredentialStore`, encrypted with Electron `safeStorage`. Secrets never live in `AiConnection` JSON and never cross back to renderer after save.
- **Every AI IPC payload and result is Zod-validated** at the boundary. Channel names follow house style: `ai:listConnections`, `ai:testConnection`, `ai:draftCommit`.
- **Structured outputs + Zod parsing.** Built-in adapters request structured JSON where possible; all adapters must return data that passes GitWarden's Zod schema. On mismatch, fail closed.
- **Custom HTTP is declarative, not code.** No arbitrary JavaScript templates, no shell hooks, no eval. Only constrained placeholders and JSONPath-like response mapping.
- **Transport: `https://` only, loopback excepted — for every adapter.** Any user-supplied base URL (built-in `openai-compatible` / `anthropic` / `ollama` or Custom HTTP) must be `https://`, except `http://localhost`, `http://127.0.0.1`, and `http://[::1]`. This is a shared rule, not a Custom-HTTP-only one, so local servers (LM Studio, Ollama, vLLM) work over plain http on loopback while LAN/remote stays TLS-only.
- **CI uses fake adapters only.** No real AI network calls in tests.
- **Default-off + explicit precedence.** AI is disabled until the user enables it. When the flags disagree, precedence is fixed and one-directional: **per-repo override → global enable → `connection.enabled`**. A repo opted out of AI blocks context assembly even if AI is globally enabled and the connection is active. No flag can re-enable what a more specific flag turned off.
- **All new user-facing strings are externalized** in `src/renderer/strings.ts`.

---

## 4. Privacy Model

Sending a diff to an AI endpoint can mean sending source code to a third party. GitWarden treats that as the central risk.

1. **Default-off with fixed precedence.** No context leaves the machine until the user enables AI and selects an active connection. When flags disagree, precedence is **per-repo override → global enable → `connection.enabled`** (§3); a more specific opt-out always wins.
2. **Preview before send, `preview-each` by default.** The user sees the exact post-redaction payload **and the destination host** before sensitive requests. Showing only the first run (`preview-first-run`) is a conscious downgrade the user must opt into, the same way an unknown-retention endpoint is — the diff content changes commit to commit, so first-run-only preview confirms structure, not content. This preview — payload **plus** host — is the real control: the host matters because `baseUrl` lives in non-secret JSON and is where the data actually goes.
3. **Redaction runs before chunking, and is best-effort.** Redaction strips known token/private-key/credential shapes from the **full** context before any truncation or chunking, so a split boundary can never carry an un-scanned secret into a later chunk. It is defense-in-depth, not a guarantee.
4. **One redaction implementation.** The redaction patterns and the deterministic secret scanner (Phase 33) are the **same** core ruleset, not two parallel pattern tables that can drift apart.
5. **Zero-retention/no-training for the default path.** GitWarden surfaces a connection's retention status. If an endpoint cannot attest this, the user must explicitly accept the downgrade. Note: aggregator keys (e.g. OpenRouter) route to many models with differing policies — retention is shown per the routed model where known, and local connections are presented as the safest option.
6. **Local connections are first-class — by host, not by kind.** `localOnly` is derived from the resolved host (`localhost` / `127.0.0.1` / `[::1]`), **not** from `kind === 'ollama'`. So an `openai-compatible` connection pointing at a local server (LM Studio on `http://localhost:1234/v1`, local vLLM, llama.cpp) gets the same visible "source stays on this machine" status. Any connection whose base URL resolves to loopback is surfaced as the most private choice.
7. **No prompt/response logs by default.** If diagnostic logging is ever added, it must be redacted and opt-in.

---

## 5. Core Types (`src/core/`, pure)

Sketch — finalized in Phase 28:

```ts
export type AiConnectionKind =
  | 'openrouter'
  | 'openai-compatible'
  | 'anthropic'
  | 'ollama'
  | 'custom-http'

// default is 'preview-each'; 'preview-first-run' is a conscious downgrade (§4)
export type AiPrivacyMode = 'off' | 'preview-each' | 'preview-first-run'

export type AiRequestKind =
  | 'commit-draft'
  | 'change-summary'
  | 'change-review'
  | 'safety-explain'
  | 'push-brief'
  | 'history-summary'
  | 'repo-brief'
  | 'failure-explain'

export interface AiConnection {
  id: string
  name: string
  kind: AiConnectionKind
  enabled: boolean
  baseUrl?: string
  defaultModel?: string
  privacyMode: AiPrivacyMode
  retention: 'zero-retention' | 'unknown' | 'user-accepted'
  capabilities: AiConnectionCapabilities
  createdAt: string
  updatedAt: string
}

export interface AiConnectionCapabilities {
  structuredOutput: boolean
  streaming: boolean
  modelList: boolean
  usage: boolean
  localOnly: boolean // derived from resolved host (loopback), not from kind (§4)
}

export interface AiCredentialMetadata {
  connectionId: string
  label: string
  maskedPreview: string
  secretFields: string[]
  updatedAt: string
}

export interface AiProviderDetection {
  kind: AiConnectionKind | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  reason: string
  suggestedBaseUrl?: string
}

export interface CustomHttpMapping {
  method: 'POST'
  url: string
  headersTemplate: Record<string, string>
  bodyTemplate: unknown
  responseMapping: {
    // safe JSONPath subset only — dotted-key/index navigation, no filter/script/wildcard (§6.3)
    text: string
    inputTokens?: string
    outputTokens?: string
  }
}

export interface AiUsageEstimate {
  inputTokens: number
  outputTokens?: number
  estCostUsd?: number
}

export interface AiReviewFinding {
  category:
    | 'secret-like'
    | 'risky-file'
    | 'migration'
    | 'lockfile'
    | 'generated'
    | 'missing-tests'
    | 'destructive'
  source: 'deterministic' | 'ai'
  confidence: 'low' | 'medium' | 'high'
  file?: string
  why: string
}
```

`AiConnection` is non-secret JSON (including `baseUrl` — the send destination), stored as a list (`AiConnection[]`) but surfaced in the MVP UI as a single active connection. Secret values are stored only in `AiCredentialStore`, keyed by `connectionId`. Because `baseUrl` is not encrypted, the send preview shows the destination host (§4) and `SECURITY.md` documents `baseUrl` tampering as a recipient-change risk.

---

## 6. Connection Strategy

### 6.1 Built-in Connections

Built-ins give a friendly path and safer defaults:

| Kind                | Setup                      | Notes                                                                          |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| `openrouter`        | API key + model slug       | Recommended first built-in; many models behind one OpenAI-compatible API       |
| `openai-compatible` | base URL + API key + model | Covers OpenAI, Groq, Together, Fireworks, LM Studio, vLLM, enterprise gateways |
| `anthropic`         | API key + model            | Direct adapter for Anthropic message format                                    |
| `ollama`            | local URL + model          | Local-only path; no API key required by default                                |

A built-in `openai-compatible` connection whose base URL resolves to loopback (LM Studio on `http://localhost:1234/v1`, local vLLM, llama.cpp) is treated as `localOnly` exactly like Ollama — local privacy status follows the host, not the kind (§4). For these local servers, structured output is a server-level capability, so the model list is not pre-filtered away (§1).

### 6.2 Auto-detect from Key (the primary path)

Detection is the main entry point, not UX sugar — but it is still **not a security boundary** (a forged prefix only changes which adapter we try; it grants nothing). It drives the progressive disclosure from §1:

- `sk-or-…` → `openrouter` (high confidence) → **zero extra fields**
- `sk-ant-…` → `anthropic` (high confidence) → **zero extra fields**
- `gsk_…` → `groq` via `openai-compatible` (high confidence) → **zero extra fields**
- `sk-lm-…` → LM Studio via `openai-compatible` (high confidence) → **one** base URL field pre-filled with `http://localhost:1234/v1` (the local port is user-configurable, so we confirm it rather than assume)
- bare `sk-…` / `sk-proj-…` → ambiguous OpenAI-compatible (medium confidence) → prompt for **one** base URL field (default OpenAI); the model fetch verifies it
- unknown → Advanced / Custom HTTP

The model-list fetch is what actually confirms the key and endpoint; there is no separate test step on this path. Renderer receives only `AiProviderDetection` and a masked key label, never the raw key.

### 6.3 Custom HTTP, n8n-style

Custom HTTP is the power-user escape hatch. It is declarative and constrained.

Supported placeholders:

- `{{apiKey}}`
- `{{model}}`
- `{{messagesJson}}`
- `{{promptJson}}`
- `{{responseSchemaJson}}`
- `{{metadataJson}}`

Example:

```json
{
  "model": "{{model}}",
  "messages": "{{messagesJson}}",
  "temperature": 0.2
}
```

Response mapping:

```text
text: $.choices[0].message.content
usage.inputTokens: $.usage.prompt_tokens
usage.outputTokens: $.usage.completion_tokens
```

Custom HTTP constraints:

- `https://` only, except `http://localhost`, `http://127.0.0.1`, and `http://[::1]`.
- No arbitrary JavaScript templates.
- No dynamic file reads.
- No shell commands.
- Response mapping is a **safe JSONPath subset only**: dotted-key and numeric-index navigation (`$.choices[0].message.content`). No filter expressions (`?(…)`), no script expressions, no evaluating wildcards — the parser must **reject** these, not silently ignore them. Choose or write a parser that cannot evaluate code.
- No request retries that could duplicate user-costly operations unless explicitly configured.
- Header values containing secrets are masked everywhere.
- Test connection is required before the connection can be active.
- Structured output is still validated by GitWarden's Zod schemas after mapping.

---

## 7. Phase 39 Boundary: Agentic Guardrail

Phase 39 is the only phase that lets AI influence file/action proposals, and it is deferred.

- AI may propose patches or action plans; it never executes directly.
- Proposed actions map only to existing, app-owned, allowlisted operations.
- When Phase 39 is actually designed, the allowlist is enumerated **by name** (like the `SafetyCode` union in Phase 34), not described abstractly; it must exclude anything that writes `.git/config`, stages, pushes, changes identity, or runs shell.
- There is no generic shell or arbitrary-command execution, even with confirmation.
- Every proposal requires preview → diff review → explicit confirmation.
- No push, no global git config, no destructive commands.
- Approved actions dispatch through existing app action layers, preserving safety gates.

---

## 8. Phases

### Phase 28 — AI Foundations, Decisions & Connection Contracts

**Goal:** define the AI connection model, safety boundaries, and provider strategy before implementation.

**Tasks:**

- Add/update this plan.
- Add `DECISIONS.md` entries: token-first single-active-connection UX, advisory-only AI, Custom HTTP constraints (incl. safe JSONPath subset), no autonomous Git mutation, zero-retention/default-off policy, privacy-flag precedence (repo → global → connection), single shared redaction/secret-scanner ruleset.
- Extend `SECURITY.md`: source-code-to-provider risk, credential handling, custom endpoint constraints, safe JSONPath subset, prompt redaction (run before chunking), retention state, and `baseUrl`-tampering as a send-destination risk (non-secret JSON → preview shows the host).
- Add pure core types and Zod schemas: `AiConnection`, `AiConnectionKind`, `AiCredentialMetadata`, `AiProviderDetection`, `CustomHttpMapping`, `AiUsageEstimate`, per-feature structured output schemas.
- Add redaction-rule fixtures in pure core.

**Exit criteria:**

- Docs reviewed; `DECISIONS.md` and `SECURITY.md` updated.
- `src/core/` stays pure.
- Vitest covers schemas, mapping validation, and redaction fixtures.
- `tsc --noEmit` clean on both tsconfigs.

### Phase 29 — AI Connections Manager & Credential Store

**Goal:** users can create, test, edit, disable, and delete reusable AI Connections.

**Tasks:**

- Implement `AiConnectionService` over JSON storage for non-secret connection records.
- Implement `AiCredentialStore` over `SecretStore` for encrypted API keys/custom header secrets.
- Add connection CRUD IPC: `ai:listConnections`, `ai:createConnection`, `ai:updateConnection`, `ai:deleteConnection`, `ai:setActiveConnection`.
- Add credential IPC: `ai:saveCredential`, `ai:deleteCredential`, returning only `AiCredentialMetadata`.
- Add `ai:detectProvider` for API-key prefix detection.
- Add Settings → AI UI (token-first, single active connection):
  - paste-key field as the primary entry point;
  - key-first detection with progressive disclosure (one base URL field only for ambiguous `sk-…`);
  - model picker populated by the model-list fetch (that fetch is the connection test — no separate Test button on this path), filtered to structured-output-capable models with a _recommended_ tag;
  - **Save connection** and a separate **Enable AI** toggle (two deliberate steps);
  - masked credential display;
  - retention/privacy status (local connections shown as safest);
  - Advanced disclosure for Custom HTTP / manual base URL;
  - per-repo override entry point.
- Externalize all new strings in `strings.ts`.

**Exit criteria:**

- Unit tests prove credentials round-trip through encrypted storage and never persist in connection JSON.
- Unit tests cover provider detection and progressive disclosure (`sk-or-`, `sk-ant-`, `gsk_`, `sk-lm-` → LM Studio base-URL prefill, ambiguous `sk-` → base-URL prompt, unknown → Advanced).
- Enabling AI is a separate action from saving a connection; saving a connection with AI still disabled sends nothing.
- IPC rejects malformed connection/credential payloads with Zod.
- Playwright with fake store: create → save credential → edit → disable → delete connection.
- Renderer cannot read raw credentials after save.

### Phase 30 — Adapter Registry, Built-in Providers & Custom HTTP

**Goal:** one registry routes AI requests to built-in or custom connections.

**Tasks:**

- Add `AiAdapter` interface:
  - `testConnection(connectionId)`;
  - `listModels(connectionId)`;
  - `generateStructured<T>(request)`;
  - `estimateUsage(request)`;
  - `cancel(requestId)`.
- Add `AiAdapterRegistry` in `src/main/ai/`.
- Implement built-ins:
  - `OpenRouterAdapter`;
  - `OpenAICompatibleAdapter` (also the path for local servers — LM Studio / vLLM / llama.cpp — via a loopback base URL; treats structured output as a server capability and sets `localOnly` from the host);
  - `AnthropicAdapter`;
  - `OllamaAdapter`.
- Implement `CustomHttpAdapter` using `CustomHttpMapping`.
- Reuse the existing injected `HttpClient` seam for fake-tested HTTP.
- Add spend/rate guard: per-request token cap, daily soft cap, explicit warning before expensive sends.
- Add `ai:testConnection`, `ai:listModels`, `ai:estimateUsage`, `ai:cancel`.

**Exit criteria:**

- Unit tests use fake HTTP only.
- Built-in adapters validate request shape and parse mapped responses through Zod.
- Built-in adapters accept `http://` loopback base URLs (LM Studio / Ollama / vLLM) and reject non-loopback `http://`; `localOnly` is set from the resolved host, not the kind.
- Custom HTTP rejects non-HTTPS non-localhost URLs, unsupported placeholders, secret-leaking mappings, malformed response mappings, and any response mapping using filter/script/wildcard JSONPath (safe subset enforced, not ignored).
- Spend/rate guard refuses requests over cap.
- Playwright verifies test connection/list models with fake adapters.

### Phase 31 — Context Builder, Redaction & Send Preview

**Goal:** safely prepare repo context for AI. This phase must land before any feature sends a real diff.

**Tasks:**

- Build `AiContextBuilder` in main using existing services: status, staged diff, selected unstaged diff, branch, remotes, Safety Engine result, recent commits.
- Never call `GitRunner` directly from AI code.
- Add deterministic redaction in pure core: tokens, private keys, GitHub tokens, common env secrets, credential URLs. This ruleset is the **single source** reused by the Phase 33 secret scanner.
- Run redaction on the **full** context **before** any chunk/truncation, so no split boundary leaks an un-scanned secret.
- Add `preview-each`-by-default "show what will be sent" preview showing the post-redaction payload **and the destination host**; `preview-first-run` is a conscious downgrade.
- Enforce the per-repo AI enable/disable override with fixed precedence (repo → global → connection): an opted-out repo blocks context assembly entirely.
- Add deterministic chunk/truncation strategy for large diffs (applied after redaction).

**Exit criteria:**

- Vitest redaction matrix passes, including a case proving redaction runs before chunking (a secret straddling a chunk boundary is still removed).
- Large diffs chunk/truncate predictably, after redaction.
- Captured fake-adapter payloads contain no redacted fixture shapes, with explicit caveat that this proves fixtures, not real-world completeness.
- Per-repo override blocks context assembly for opted-out repos (precedence: repo → global → connection).
- Playwright verifies the preview — post-redaction payload and destination host — appears before sending a diff.

### Phase 32 — Smart Commit Assistant

**Goal:** first useful vertical slice.

**Tasks:**

- On Commit screen, add "Draft message" and "Summarize staged changes."
- Inputs come only from `AiContextBuilder`.
- Outputs are structured/Zod-parsed: conventional option, plain option, concise summary, optional body.
- User clicks to insert; AI never commits.
- Externalize all strings.

**Exit criteria:**

- Vitest validates structured commit-output schema and rejects malformed adapter output.
- Playwright with fake adapter: staged diff → preview → draft appears → user inserts → existing Safety Engine commit gate still controls commit.

### Phase 33 — Change Review Assistant

**Goal:** help developers catch risk before commit.

**Tasks:**

- Add "Review staged changes" panel.
- Findings: risky files, secret-like changes, migrations, lockfiles, generated files, missing tests, destructive changes.
- Separate deterministic findings from AI findings via `AiReviewFinding.source`.
- Add confidence labels and "why this matters."
- Ship deterministic secret scanner in pure core that works with AI disabled, built on the **same** redaction ruleset from Phase 31 (one implementation, not a parallel pattern table).
- Externalize all strings.

**Exit criteria:**

- Fake AI review renders grouped findings with source/confidence labels.
- Deterministic secret scanner warns/blocks with AI disabled.
- A model "all clear" cannot clear a deterministic finding.

### Phase 34 — Safety Copilot _(recommended MVP stop point)_

**Goal:** explain safety issues and suggest safe repairs.

**Tasks:**

- In Safety Center and push sheet, add "Explain this" per issue.
- Cover the real `SafetyCode` union:
  `NO_ACTIVE_PROFILE`, `REPO_UNASSIGNED`, `PROFILE_MISMATCH`, `IDENTITY_UNSET`,
  `EMAIL_MISMATCH`, `EMAIL_FROM_GLOBAL_ONLY`, `NOTHING_STAGED`, `EMPTY_MESSAGE`,
  `HAS_CONFLICTS`, `NO_REMOTE`, `REMOTE_HOST_MISMATCH`, `GITHUB_ACCOUNT_MISMATCH`,
  `GITHUB_TOKEN_MISSING`, `GITHUB_TOKEN_INVALID`, `GITHUB_NOT_CONNECTED`.
- Suggest safe next actions using existing app actions only: set local identity, switch active profile, assign repo profile, reconnect GitHub.
- Never auto-apply.
- Externalize all strings.

**Exit criteria:**

- Every `SafetyCode` has deterministic fallback copy.
- Unit tests cover issue → suggested-action mapping.
- Playwright proves explanation does not enable a blocked commit/push.

### Phase 35 — Push Brief & History Intelligence

**Goal:** make remote operations less opaque.

**Tasks:**

- Before push, summarize commits ahead of upstream and explain what will be published.
- Highlight identity/account used for push via Phase 27 push context.
- Add History summaries: release notes draft, branch activity, changelog draft.
- Externalize all strings.

**Exit criteria:**

- Works offline with fake adapter.
- Push still requires explicit confirmation.
- No summary includes token/credential material.

### Phase 36 — Repo Onboarding Assistant

**Goal:** help users understand unfamiliar repos.

**Tasks:**

- Generate project brief from allowlisted files: README, package scripts, config files, recent commits.
- Identify likely test/build commands without running them.
- Add "How do I work on this repo?" panel.
- Externalize all strings.

**Exit criteria:**

- Context is limited to allowlisted files by default.
- User can inspect included files before send.
- Renderer security invariants still hold.

### Phase 37 — Failure Explainer

**Goal:** turn Git/test errors into next steps.

**Tasks:**

- Explain failed git operations from existing `GitCommandError` / `ErrorMapper`.
- Explain pasted/selected test or lint output.
- Map to categories aligned with `GitErrorCode`.
- Suggest existing safe app actions.
- Externalize all strings.

**Exit criteria:**

- Unit tests cover `GitErrorCode` → category → suggested action.
- AI explanation is additive; `ErrorMapper` deterministic message stands alone with AI disabled.

### Phase 38 — Connection Templates, Import/Export & Team Handoff

**Goal:** make the n8n-like connection system reusable without sharing secrets.

**Tasks:**

- Add built-in connection templates:
  - OpenRouter;
  - OpenAI-compatible;
  - Anthropic;
  - Ollama;
  - Custom HTTP examples.
- Allow export/import of connection templates **without credentials**.
- Add "duplicate connection" and "test after import."
- Add optional per-repo recommended connection assignment.
- Externalize all strings.

**Exit criteria:**

- Exported templates contain no secrets.
- Imported templates require fresh credential entry before activation.
- Playwright: export template → import template → add credential → test → use fake adapter.

### Phase 39 — Optional Agentic Actions _(deferred; allowlist-only)_

**Goal:** carefully preview AI-assisted edits inside a closed allowlist.

**Tasks:**

- AI may propose patches or action plans mapped only to existing allowlisted app actions.
- Require preview → diff review → explicit confirmation.
- No arbitrary shell, no push, no global git config, no destructive commands.
- Tests run only on explicit confirm.

**Exit criteria:**

- Proposals are schema-validated and rejected if they reference non-allowlisted actions.
- App shows exact files/actions before execution.
- E2E proves rejection leaves repo unchanged.

---

## 9. Testing & Verifiability

- **Logic-first:** core schemas, mappings, and redaction ship with Vitest before UI.
- **Fake adapters in CI:** `GITWARDEN_E2E_FAKE_AI=1` drives all Playwright AI flows.
- **No real AI network call in CI.**
- **Credential assertions:** raw secrets never appear in connection JSON, IPC responses, renderer state, logs, fake-adapter captured payloads, or exported templates.
- **Security assertions:** renderer stays locked down; custom HTTP remains declarative and constrained (safe JSONPath subset only); preview (payload + destination host) appears before sensitive sends; privacy-flag precedence (repo → global → connection) holds; redaction runs before chunking.

## Appendix A — Manual Real-Connection Smoke Check

Before considering the MVP (28–34) shippable, a maintainer:

1. Creates an OpenRouter connection by pasting a key; verifies detection, test connection, model selection, and masked credential display.
2. Creates a Custom OpenAI-compatible connection with a base URL/model; verifies test connection.
3. Creates a Custom HTTP connection using a test endpoint; verifies template rendering and response mapping.
4. Confirms raw credentials are not readable from renderer and do not appear in exported templates.
5. Drafts a commit message on a real staged diff, reviews the post-redaction payload preview, and confirms the provider retention/privacy state is visible.

## References

- Internal: `docs/plans/gitwarden-plan.md`, `docs/plans/github-oauth-plan.md`, `DECISIONS.md`, `SECURITY.md`, `docs/progress-log.md`
- OpenRouter docs for API keys, model IDs, and OpenAI-compatible routing.
- Provider docs for OpenAI-compatible chat/completions, Anthropic messages, and Ollama local APIs.
