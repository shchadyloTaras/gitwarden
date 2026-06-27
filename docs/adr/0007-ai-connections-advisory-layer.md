---
status: accepted
amended-by: 0008
date: 2026-06-25
phase: Phases 28–34
source: docs/plans/ai-integration-plan.md §1–§6
---

# 0007 — AI Connections: advisory layer

## Status

Accepted (Phases 28–34). **Amended by [0008 — AI Chat Redesign & simplification](0008-ai-chat-redesign-simplification.md).**

These decisions are binding for the AI feature; they extend, and never weaken, the deterministic
Safety Engine.

## Context

GitWarden's reason to exist — preventing the wrong-identity commit/push — is a **deterministic**
guarantee. An AI layer adds explanation/drafting value but must sit **beside** that guarantee, never
inside the control path, and its privacy implications (repo content leaving the machine) must be
visible and opt-in.

## Decision

- **Token-first, single active connection.** The default Settings → AI UX is "paste the API key you
  already have": GitWarden detects the provider from the key, fetches the models that key can use (the
  fetch _is_ the connection test — no separate Test button on the primary path), the user picks one and
  saves. Under the hood it is still an n8n-style connection model (`AiConnection[]`, reusable
  credential + adapter + capabilities), but the MVP UI exposes one active connection, not a manager of
  many.
- **Save and Enable are two deliberate steps.** "Save connection" attaches a key and a model; "Enable
  AI" is a separate consent that allows repo content to leave the machine. Saving with AI still
  disabled sends nothing. _(⚠️ Superseded for the shipped UI by [ADR 0008](0008-ai-chat-redesign-simplification.md) — a stored key is now the consent.)_
- **Advisory-only — AI owns no Git action.** The AI explains, drafts, and recommends. **No blocker,
  gate, or Git mutation may depend on model output.** It never commits, pushes, changes identity,
  rewrites config, or clears a deterministic finding; a model "all clear" cannot override the Safety
  Engine or the deterministic secret scanner. (Phase 39 agentic actions stay deferred and
  allowlist-only.)
- **Default-off with fixed, one-directional precedence.** AI is disabled until the user enables it.
  When flags disagree, precedence is **per-repo override → global enable → `connection.enabled`**; a
  more specific opt-out always wins, and no flag can re-enable what a more specific flag turned off. A
  repo opted out of AI blocks context assembly entirely.
- **Zero-retention / unknown-retention is a conscious downgrade.** GitWarden surfaces a connection's
  retention state (`zero-retention` | `unknown` | `user-accepted`). An endpoint that cannot attest
  zero-retention requires the user to explicitly accept the downgrade. _(⚠️ Updated by [ADR 0008](0008-ai-chat-redesign-simplification.md) — the inline per-send preview→confirm gate was removed; the shipped privacy floor is redaction + an explicit send acknowledgement.)_
- **`localOnly` is derived from the resolved host, not the kind.** Any connection whose base URL
  resolves to loopback (`localhost` / `127.0.0.1` / `[::1]`) is surfaced as the most private choice —
  including an `openai-compatible` connection pointed at LM Studio / vLLM / llama.cpp, not just
  `ollama`. Transport is `https://` only for every adapter, except plain `http://` to loopback.
- **Custom HTTP is declarative, not code.** The power-user escape hatch supports only a closed
  placeholder set (`{{apiKey}}`, `{{model}}`, `{{messagesJson}}`, `{{promptJson}}`,
  `{{responseSchemaJson}}`, `{{metadataJson}}`) and a **safe JSONPath subset** for response mapping —
  dotted-key and numeric-index navigation only (`$.choices[0].message.content`). Filter (`?(…)`),
  script, recursive-descent, and wildcard expressions are **rejected, not silently ignored**. No
  arbitrary JS, no file reads, no shell.
- **One redaction / secret-scanner ruleset.** The prompt-redaction patterns (Phase 31) and the
  deterministic secret scanner (Phase 33) are the **same** core ruleset (`src/core/ai/redaction.ts`),
  not two parallel tables that can drift apart. Redaction runs on the **full** context **before** any
  chunk/truncation, so no split boundary can carry an un-scanned secret into a later chunk.
- **Secrets never live in `AiConnection` JSON.** A connection record — including `baseUrl`, the send
  destination — is non-secret JSON. API keys and custom header secrets are referenced only by
  `connectionId` and live in the encrypted `AiCredentialStore`; they never cross back to the renderer
  after save. (See SECURITY.md §16–§20.)

## Consequences

- Near-zero setup for the 80% case without throwing away the reusable-connection data model the
  advanced path and Phase 38 templates need.
- The privacy consent (data leaving the machine) is a conscious, distinct act — not a side effect of
  configuring a provider.
- The wrong-identity guarantee stays deterministic; AI sits beside it, never inside the control path.
- A single, predictable precedence rule means a user can always reason about whether a given repo's
  content can be sent, and the safest setting dominates.
- Privacy status follows where data actually goes, not a provider label; local servers over plain
  http on loopback are legitimately the safest path.
- A user-supplied mapping never becomes an evaluation surface; rejecting (vs ignoring) unsafe paths
  makes the constraint enforceable and auditable.
- One shared redaction source keeps "what we redact" and "what we warn about" identical, and
  pre-chunk redaction removes a whole class of leak.
- Keeping the destination non-secret is what lets the send preview show the host; keeping the
  credential out of the record is what keeps it out of logs, exports, and the renderer.
